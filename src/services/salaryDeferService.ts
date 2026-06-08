import mongoose from "mongoose";
import { SalaryRecord, ISalaryRecord } from "../models/SalaryRecord";
import { SalaryPaidStatus } from "../types/enums";
import { calculateFinalSalary } from "../utils/salary";
import { recalculateSalaryAdvances } from "./salaryRecalcService";

function isBeforePeriod(
  month: number,
  year: number,
  beforeMonth: number,
  beforeYear: number
): boolean {
  return year < beforeYear || (year === beforeYear && month < beforeMonth);
}

export async function getUnsettledDeferredRecords(
  employeeId: string,
  beforeMonth: number,
  beforeYear: number
): Promise<ISalaryRecord[]> {
  const records = await SalaryRecord.find({
    employeeId,
    paidStatus: SalaryPaidStatus.DEFERRED,
    carriedToSalaryId: { $exists: false },
  });

  return records.filter((r) =>
    isBeforePeriod(r.month, r.year, beforeMonth, beforeYear)
  );
}

export async function clearCarryForwardLinks(
  recordId: mongoose.Types.ObjectId
): Promise<void> {
  await SalaryRecord.updateMany(
    { carriedToSalaryId: recordId },
    { $unset: { carriedToSalaryId: 1 } }
  );
}

export async function applyDeferredCarryForward(
  record: ISalaryRecord
): Promise<ISalaryRecord> {
  if (record.paidStatus !== SalaryPaidStatus.PENDING) {
    return record;
  }

  await clearCarryForwardLinks(record._id as mongoose.Types.ObjectId);

  const deferredRecords = await getUnsettledDeferredRecords(
    String(record.employeeId),
    record.month,
    record.year
  );

  const carryForward = deferredRecords.reduce((sum, r) => sum + r.finalSalary, 0);
  record.deferredCarryForward = carryForward;
  record.settledDeferredIds = deferredRecords.map(
    (r) => r._id as mongoose.Types.ObjectId
  );

  for (const deferred of deferredRecords) {
    deferred.carriedToSalaryId = record._id as mongoose.Types.ObjectId;
    await deferred.save();
  }

  if (!record.advanceDeductionManual) {
    return recalculateSalaryAdvances(record);
  }

  record.finalSalary = calculateFinalSalary({
    monthlySalary: record.baseSalary,
    bonus: record.bonus,
    otherAddition: record.otherAddition + carryForward,
    otherDeduction: record.otherDeduction,
    advanceDeduction: record.advanceDeduction,
  });
  await record.save();
  return record;
}

export async function deferSalaryRecord(
  record: ISalaryRecord,
  remarks?: string,
  deferredUntilMonth?: number,
  deferredUntilYear?: number
): Promise<ISalaryRecord> {
  if (record.paidStatus !== SalaryPaidStatus.PENDING) {
    throw new Error("Only pending salaries can be deferred");
  }

  record.paidStatus = SalaryPaidStatus.DEFERRED;
  if (remarks !== undefined) record.remarks = remarks;
  if (deferredUntilMonth) record.deferredUntilMonth = deferredUntilMonth;
  if (deferredUntilYear) record.deferredUntilYear = deferredUntilYear;

  await record.save();
  return record;
}

export async function skipSalaryRecord(
  record: ISalaryRecord,
  remarks: string
): Promise<ISalaryRecord> {
  if (record.paidStatus !== SalaryPaidStatus.PENDING) {
    throw new Error("Only pending salaries can be skipped");
  }

  if (!remarks.trim()) {
    throw new Error("Reason is required when skipping salary");
  }

  if (record.settledDeferredIds?.length) {
    await SalaryRecord.updateMany(
      { _id: { $in: record.settledDeferredIds } },
      { $unset: { carriedToSalaryId: 1 } }
    );
  }

  record.paidStatus = SalaryPaidStatus.SKIPPED;
  record.finalSalary = 0;
  record.advanceDeduction = 0;
  record.deferredCarryForward = 0;
  record.settledDeferredIds = [];
  record.remarks = remarks.trim();
  await record.save();
  return record;
}

function salaryPeriodLabel(month: number, year: number): string {
  return new Date(year, month - 1).toLocaleString("en", {
    month: "long",
    year: "numeric",
  });
}

type PopulatedSalary = ISalaryRecord & {
  employeeId: { _id?: { toString(): string }; fullName?: string; mobileNumber?: string } | mongoose.Types.ObjectId;
  officeId: { name?: string } | mongoose.Types.ObjectId;
  carriedToSalaryId?: { month?: number; year?: number; paidStatus?: string } | mongoose.Types.ObjectId | null;
  settledWithSalaryId?: { month?: number; year?: number; paidDate?: Date } | mongoose.Types.ObjectId | null;
};

function employeeIdFromRecord(record: PopulatedSalary): string {
  const emp = record.employeeId;
  if (emp && typeof emp === "object" && "_id" in emp && emp._id) {
    return emp._id.toString();
  }
  return String(record.employeeId);
}

function employeeNameFromRecord(record: PopulatedSalary): string {
  const emp = record.employeeId;
  if (emp && typeof emp === "object" && "fullName" in emp) {
    return (emp as { fullName?: string }).fullName ?? "Unknown";
  }
  return "Unknown";
}

function employeeMobileFromRecord(record: PopulatedSalary): string {
  const emp = record.employeeId;
  if (emp && typeof emp === "object" && "mobileNumber" in emp) {
    return (emp as { mobileNumber?: string }).mobileNumber ?? "";
  }
  return "";
}

function officeNameFromRecord(record: PopulatedSalary): string {
  const off = record.officeId;
  if (off && typeof off === "object" && "name" in off) {
    return (off as { name?: string }).name ?? "";
  }
  return "";
}

function carriedToLabel(record: PopulatedSalary): string | undefined {
  const carried = record.carriedToSalaryId;
  if (!carried || typeof carried !== "object" || !("month" in carried)) return undefined;
  if (!carried.month || !carried.year) return undefined;
  return salaryPeriodLabel(carried.month, carried.year);
}

function settledInLabel(record: PopulatedSalary): string | undefined {
  const settled = record.settledWithSalaryId;
  if (!settled || typeof settled !== "object" || !("month" in settled)) return undefined;
  if (!settled.month || !settled.year) return undefined;
  return salaryPeriodLabel(settled.month, settled.year);
}

export interface DeferredStatementOptions {
  officeId?: string;
  employeeId?: string;
  status?: "active" | "settled" | "all";
  month?: number;
  year?: number;
}

export interface DeferredStatementEntry {
  id: string;
  month: number;
  year: number;
  periodLabel: string;
  amount: number;
  remarks?: string;
  lineStatus: "open" | "carried_forward" | "settled";
  carriedToPeriod?: string;
  settledInPeriod?: string;
  settledOn?: string;
  deferredAt?: string;
}

export interface DeferredStatementEmployee {
  employeeId: string;
  fullName: string;
  mobileNumber: string;
  officeName: string;
  totalOutstanding: number;
  totalSettled: number;
  pendingCarryPeriod?: string;
  pendingCarryAmount?: number;
  pendingNetSalary?: number;
  entries: DeferredStatementEntry[];
}

export interface DeferredStatementResult {
  generatedAt: string;
  scope: string;
  employeeCount: number;
  totalOutstanding: number;
  totalSettled: number;
  totalPendingCarry: number;
  byEmployee: DeferredStatementEmployee[];
}

function buildScopeLabel(options: DeferredStatementOptions, status: string): string {
  if (status === "active") {
    return "All outstanding deferred";
  }
  if (options.month && options.year) {
    return salaryPeriodLabel(options.month, options.year);
  }
  if (options.year) {
    return String(options.year);
  }
  return "All time";
}

export async function buildDeferredSalaryStatement(
  officeFilter: Record<string, unknown>,
  options: DeferredStatementOptions = {}
): Promise<DeferredStatementResult> {
  const officeScopedFilter: Record<string, unknown> = { ...officeFilter };
  if (options.officeId) officeScopedFilter.officeId = options.officeId;
  if (options.employeeId) officeScopedFilter.employeeId = options.employeeId;

  const settledPeriodFilter: Record<string, unknown> = { ...officeScopedFilter };
  if (options.year) settledPeriodFilter.year = options.year;
  if (options.month) settledPeriodFilter.month = options.month;

  const status = options.status ?? "active";
  const recordQueries: Promise<PopulatedSalary[]>[] = [];

  // Outstanding deferred: always show full liability (office scope only).
  if (status === "active" || status === "all") {
    recordQueries.push(
      SalaryRecord.find({
        ...officeScopedFilter,
        paidStatus: SalaryPaidStatus.DEFERRED,
      })
        .populate("employeeId", "fullName mobileNumber")
        .populate("officeId", "name")
        .populate("carriedToSalaryId", "month year paidStatus")
        .sort({ year: -1, month: -1 })
        .lean() as Promise<PopulatedSalary[]>
    );
  }

  // Settled via later month: optional year / month filter on original deferred period.
  if (status === "settled" || status === "all") {
    recordQueries.push(
      SalaryRecord.find({
        ...settledPeriodFilter,
        paidStatus: SalaryPaidStatus.PAID,
        settledWithSalaryId: { $exists: true },
      })
        .populate("employeeId", "fullName mobileNumber")
        .populate("officeId", "name")
        .populate("settledWithSalaryId", "month year paidDate")
        .sort({ year: -1, month: -1 })
        .lean() as Promise<PopulatedSalary[]>
    );
  }

  const recordGroups = await Promise.all(recordQueries);
  const records = recordGroups.flat();

  const pendingCarryRecords =
    status === "active" || status === "all"
      ? ((await SalaryRecord.find({
          ...officeScopedFilter,
          paidStatus: SalaryPaidStatus.PENDING,
          deferredCarryForward: { $gt: 0 },
        })
          .populate("employeeId", "fullName mobileNumber")
          .populate("officeId", "name")
          .sort({ year: -1, month: -1 })
          .lean()) as PopulatedSalary[])
      : [];

  const byEmployeeMap = new Map<string, DeferredStatementEmployee>();

  const ensureEmployee = (record: PopulatedSalary): DeferredStatementEmployee => {
    const empId = employeeIdFromRecord(record);
    if (!byEmployeeMap.has(empId)) {
      byEmployeeMap.set(empId, {
        employeeId: empId,
        fullName: employeeNameFromRecord(record),
        mobileNumber: employeeMobileFromRecord(record),
        officeName: officeNameFromRecord(record),
        totalOutstanding: 0,
        totalSettled: 0,
        entries: [],
      });
    }
    return byEmployeeMap.get(empId)!;
  };

  for (const record of records) {
    const emp = ensureEmployee(record);
    const carriedTo = carriedToLabel(record);
    const settledIn = settledInLabel(record);
    const isSettled = record.paidStatus === SalaryPaidStatus.PAID;

    const entry: DeferredStatementEntry = {
      id: String(record._id),
      month: record.month,
      year: record.year,
      periodLabel: salaryPeriodLabel(record.month, record.year),
      amount: record.finalSalary,
      remarks: record.remarks,
      lineStatus: isSettled
        ? "settled"
        : carriedTo
          ? "carried_forward"
          : "open",
      carriedToPeriod: carriedTo,
      settledInPeriod: settledIn,
      settledOn: record.paidDate
        ? new Date(record.paidDate).toISOString().split("T")[0]
        : undefined,
      deferredAt: record.updatedAt
        ? new Date(record.updatedAt).toISOString().split("T")[0]
        : undefined,
    };

    emp.entries.push(entry);
    if (isSettled) {
      emp.totalSettled += record.finalSalary;
    } else {
      emp.totalOutstanding += record.finalSalary;
    }
  }

  let totalPendingCarry = 0;

  for (const pending of pendingCarryRecords) {
    const emp = ensureEmployee(pending);
    const carry = pending.deferredCarryForward ?? 0;
    totalPendingCarry += carry;
    emp.pendingCarryPeriod = salaryPeriodLabel(pending.month, pending.year);
    emp.pendingCarryAmount = carry;
    emp.pendingNetSalary = pending.finalSalary;
  }

  const byEmployee = Array.from(byEmployeeMap.values())
    .map((emp) => ({
      ...emp,
      entries: emp.entries.sort(
        (a, b) => b.year - a.year || b.month - a.month
      ),
    }))
    .filter((emp) => emp.entries.length > 0 || emp.pendingCarryAmount)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const totals = byEmployee.reduce(
    (acc, emp) => ({
      totalOutstanding: acc.totalOutstanding + emp.totalOutstanding,
      totalSettled: acc.totalSettled + emp.totalSettled,
    }),
    { totalOutstanding: 0, totalSettled: 0 }
  );

  return {
    generatedAt: new Date().toISOString(),
    scope: buildScopeLabel(options, status),
    employeeCount: byEmployee.length,
    totalOutstanding: totals.totalOutstanding,
    totalSettled: totals.totalSettled,
    totalPendingCarry,
    byEmployee,
  };
}

export interface SkippedStatementEntry {
  id: string;
  month: number;
  year: number;
  periodLabel: string;
  waivedAmount: number;
  remarks?: string;
  skippedAt?: string;
}

export interface SkippedStatementEmployee {
  employeeId: string;
  fullName: string;
  mobileNumber: string;
  officeName: string;
  skippedCount: number;
  totalWaived: number;
  entries: SkippedStatementEntry[];
}

export interface SkippedStatementResult {
  generatedAt: string;
  scope: string;
  employeeCount: number;
  totalSkipped: number;
  totalWaived: number;
  byEmployee: SkippedStatementEmployee[];
}

export interface SkippedStatementOptions {
  officeId?: string;
  employeeId?: string;
  year?: number;
  month?: number;
}

export async function buildSkippedSalaryStatement(
  officeFilter: Record<string, unknown>,
  options: SkippedStatementOptions = {}
): Promise<SkippedStatementResult> {
  const filter: Record<string, unknown> = {
    ...officeFilter,
    paidStatus: SalaryPaidStatus.SKIPPED,
  };
  if (options.officeId) filter.officeId = options.officeId;
  if (options.employeeId) filter.employeeId = options.employeeId;
  if (options.year) filter.year = options.year;
  if (options.month) filter.month = options.month;

  const records = (await SalaryRecord.find(filter)
    .populate("employeeId", "fullName mobileNumber")
    .populate("officeId", "name")
    .sort({ year: -1, month: -1 })
    .lean()) as PopulatedSalary[];

  const byEmployeeMap = new Map<string, SkippedStatementEmployee>();

  for (const record of records) {
    const empId = employeeIdFromRecord(record);
    if (!byEmployeeMap.has(empId)) {
      byEmployeeMap.set(empId, {
        employeeId: empId,
        fullName: employeeNameFromRecord(record),
        mobileNumber: employeeMobileFromRecord(record),
        officeName: officeNameFromRecord(record),
        skippedCount: 0,
        totalWaived: 0,
        entries: [],
      });
    }

    const emp = byEmployeeMap.get(empId)!;
    const waivedAmount = record.baseSalary;
    emp.skippedCount += 1;
    emp.totalWaived += waivedAmount;
    emp.entries.push({
      id: String(record._id),
      month: record.month,
      year: record.year,
      periodLabel: salaryPeriodLabel(record.month, record.year),
      waivedAmount,
      remarks: record.remarks,
      skippedAt: record.updatedAt
        ? new Date(record.updatedAt).toISOString().split("T")[0]
        : undefined,
    });
  }

  const byEmployee = Array.from(byEmployeeMap.values())
    .map((emp) => ({
      ...emp,
      entries: emp.entries.sort((a, b) => b.year - a.year || b.month - a.month),
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const totalWaived = byEmployee.reduce((s, e) => s + e.totalWaived, 0);
  const totalSkipped = byEmployee.reduce((s, e) => s + e.skippedCount, 0);

  const scope =
    options.month && options.year
      ? salaryPeriodLabel(options.month, options.year)
      : options.year
        ? String(options.year)
        : "All time";

  return {
    generatedAt: new Date().toISOString(),
    scope,
    employeeCount: byEmployee.length,
    totalSkipped,
    totalWaived,
    byEmployee,
  };
}

export async function settleDeferredOnPayment(
  record: ISalaryRecord,
  paidDate: Date
): Promise<void> {
  if (!record.settledDeferredIds?.length) return;

  await SalaryRecord.updateMany(
    {
      _id: { $in: record.settledDeferredIds },
      paidStatus: SalaryPaidStatus.DEFERRED,
    },
    {
      $set: {
        paidStatus: SalaryPaidStatus.PAID,
        paidDate,
        settledWithSalaryId: record._id,
        paymentMode: record.paymentMode,
      },
    }
  );
}
