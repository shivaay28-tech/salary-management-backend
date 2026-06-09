import { Response } from "express";
import { z } from "zod";
import { SalaryRecord } from "../models/SalaryRecord";
import { Advance } from "../models/Advance";
import { Employee } from "../models/Employee";
import { SalaryPaidStatus, SalaryPaymentMode } from "../types/enums";
import { AuthRequest } from "../middleware/auth";
import { assertOfficeAccess } from "../middleware/rbac";
import { AppError } from "../middleware/errorHandler";
import { getOfficeIdFilter } from "../utils/officeFilter";
import { hasCustomDateFilter, resolveReportPeriod } from "../utils/dateRange";

const periodSchema = z.object({
  month: z.coerce.number().min(1).max(12),
  year: z.coerce.number().min(2000),
  officeId: z.string().optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

type ParsedPeriod = z.infer<typeof periodSchema>;

function applyOfficeFilter(
  req: AuthRequest,
  filter: Record<string, unknown>,
  officeId?: string
) {
  if (officeId) {
    assertOfficeAccess(req, officeId);
    filter.officeId = officeId;
  }
}

function applyAdvanceDateRange(
  filter: Record<string, unknown>,
  parsed: ParsedPeriod
) {
  const { start, end } = resolveReportPeriod(parsed);
  filter.date = { $gte: start, $lte: end };
}

function filterSalariesByPaidDate<
  T extends { paidStatus: string; paidDate?: Date | null },
>(records: T[], parsed: ParsedPeriod): T[] {
  if (!hasCustomDateFilter(parsed)) return records;
  const { start, end } = resolveReportPeriod(parsed);
  return records.filter(
    (r) =>
      r.paidStatus === SalaryPaidStatus.PENDING ||
      r.paidStatus === SalaryPaidStatus.DEFERRED ||
      r.paidStatus === SalaryPaidStatus.SKIPPED ||
      (r.paidDate && r.paidDate >= start && r.paidDate <= end)
  );
}

function periodMeta(parsed: ParsedPeriod) {
  const { start, end } = resolveReportPeriod(parsed);
  return {
    month: parsed.month,
    year: parsed.year,
    dateFrom: parsed.dateFrom ?? start.toISOString().split("T")[0],
    dateTo: parsed.dateTo ?? end.toISOString().split("T")[0],
  };
}

function salaryPeriodOverlapsRange(
  month: number,
  year: number,
  start: Date,
  end: Date
): boolean {
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);
  return periodStart <= end && periodEnd >= start;
}

function filterHistoryByScope<
  T extends { month: number; year: number },
>(
  records: T[],
  parsed: {
    month?: number;
    year?: number;
    dateFrom?: string;
    dateTo?: string;
  }
): T[] {
  if (hasCustomDateFilter(parsed)) {
    const { start, end } = resolveReportPeriod({
      month: parsed.month ?? 1,
      year: parsed.year ?? new Date().getFullYear(),
      dateFrom: parsed.dateFrom,
      dateTo: parsed.dateTo,
    });
    return records.filter((r) =>
      salaryPeriodOverlapsRange(r.month, r.year, start, end)
    );
  }

  if (parsed.month && parsed.year) {
    return records.filter(
      (r) => r.month === parsed.month && r.year === parsed.year
    );
  }

  if (parsed.year) {
    return records.filter((r) => r.year === parsed.year);
  }

  return records;
}

export async function monthlySalaryReport(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const parsed = periodSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("Month and year required");
  }

  const filter: Record<string, unknown> = {
    month: parsed.data.month,
    year: parsed.data.year,
    ...getOfficeIdFilter(req),
  };

  applyOfficeFilter(req, filter, parsed.data.officeId);

  const allRecords = await SalaryRecord.find(filter)
    .populate("employeeId", "fullName mobileNumber")
    .populate("officeId", "name")
    .sort({ finalSalary: -1 });

  const records = filterSalariesByPaidDate(allRecords, parsed.data);

  const totalSalary = records.reduce((s, r) => s + r.finalSalary, 0);
  const paidRecords = records.filter((r) => r.paidStatus === SalaryPaidStatus.PAID);
  const pendingRecords = records.filter((r) => r.paidStatus === SalaryPaidStatus.PENDING);
  const deferredRecords = records.filter((r) => r.paidStatus === SalaryPaidStatus.DEFERRED);
  const skippedRecords = records.filter((r) => r.paidStatus === SalaryPaidStatus.SKIPPED);
  const totalPaid = paidRecords.reduce((s, r) => s + r.finalSalary, 0);
  const totalPending = pendingRecords.reduce((s, r) => s + r.finalSalary, 0);
  const totalDeferred = deferredRecords.reduce((s, r) => s + r.finalSalary, 0);
  const totalAdvances = records.reduce((s, r) => s + r.advanceDeduction, 0);

  const paymentModes = [
    SalaryPaymentMode.BANK,
    SalaryPaymentMode.ANGADIYA,
    SalaryPaymentMode.CASH_IN_HAND,
  ] as const;

  const paymentBreakdown = paymentModes.map((mode) => {
    const modeRecords = paidRecords.filter((r) => r.paymentMode === mode);
    return {
      mode,
      count: modeRecords.length,
      amount: modeRecords.reduce((s, r) => s + r.finalSalary, 0),
    };
  });

  res.json({
    success: true,
    data: {
      ...periodMeta(parsed.data),
      totalEmployees: records.length,
      paidCount: paidRecords.length,
      pendingCount: pendingRecords.length,
      deferredCount: deferredRecords.length,
      skippedCount: skippedRecords.length,
      totalSalary,
      totalAdvances,
      totalPaid,
      totalPending,
      totalDeferred,
      paymentBreakdown,
      records: records.map((r) => {
        const emp = r.employeeId as { fullName?: string; mobileNumber?: string } | null;
        const off = r.officeId as { name?: string } | null;
        return {
          _id: r._id,
          employeeName: emp?.fullName ?? "",
          employeeMobile: emp?.mobileNumber ?? "",
          officeName: off?.name ?? "",
          baseSalary: r.baseSalary,
          fullMonthlySalary: r.fullMonthlySalary,
          payableDays: r.payableDays,
          daysInMonth: r.daysInMonth,
          bonus: r.bonus,
          otherAddition: r.otherAddition,
          otherDeduction: r.otherDeduction,
          advanceDeduction: r.advanceDeduction,
          deferredCarryForward: r.deferredCarryForward ?? 0,
          finalSalary: r.finalSalary,
          paidStatus: r.paidStatus,
          remarks: r.remarks,
          paymentMode: r.paymentMode,
          paidDate: r.paidDate,
        };
      }),
    },
  });
}

export async function employeePeriodReport(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const parsed = periodSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("Month and year required");
  }

  const { start, end } = resolveReportPeriod(parsed.data);
  const empFilter: Record<string, unknown> = { ...getOfficeIdFilter(req) };
  applyOfficeFilter(req, empFilter, parsed.data.officeId);

  if (hasCustomDateFilter(parsed.data)) {
    empFilter.dateOfJoining = { $lte: end };
  }

  const employees = await Employee.find(empFilter)
    .populate("officeId", "name")
    .sort({ fullName: 1 });

  const salaryFilter: Record<string, unknown> = {
    month: parsed.data.month,
    year: parsed.data.year,
    ...getOfficeIdFilter(req),
  };
  applyOfficeFilter(req, salaryFilter, parsed.data.officeId);

  const salaries = filterSalariesByPaidDate(
    await SalaryRecord.find(salaryFilter),
    parsed.data
  );
  const salaryByEmployee = new Map(
    salaries.map((s) => [s.employeeId.toString(), s])
  );

  const rows = employees.map((e) => {
    const off = e.officeId as { name?: string } | null;
    const salary = salaryByEmployee.get(e._id.toString());
    return {
      _id: e._id,
      fullName: e.fullName,
      mobileNumber: e.mobileNumber,
      officeName: off?.name ?? "",
      monthlySalary: e.monthlySalary,
      status: e.status,
      dateOfJoining: e.dateOfJoining,
      hasSalaryRecord: !!salary,
      netSalary: salary?.finalSalary,
      paidStatus: salary?.paidStatus,
      paymentMode: salary?.paymentMode,
      advanceDeduction: salary?.advanceDeduction,
      paidDate: salary?.paidDate,
    };
  });

  res.json({
    success: true,
    data: {
      ...periodMeta(parsed.data),
      totalEmployees: rows.length,
      withSalaryCount: rows.filter((r) => r.hasSalaryRecord).length,
      rows,
    },
  });
}

export async function employeeSalaryHistory(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const historySchema = z.object({
    employeeId: z.string().min(1),
    month: z.coerce.number().min(1).max(12).optional(),
    year: z.coerce.number().min(2000).optional(),
    dateFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    dateTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  });
  const parsed = historySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("Employee id required");
  }

  const employee = await Employee.findById(parsed.data.employeeId).populate(
    "officeId",
    "name"
  );
  if (!employee) {
    throw new AppError("Employee not found", 404);
  }
  assertOfficeAccess(req, employee.officeId.toString());

  const allRecords = await SalaryRecord.find({
    employeeId: parsed.data.employeeId,
  })
    .sort({ year: -1, month: -1 })
    .select(
      "month year baseSalary bonus otherAddition otherDeduction advanceDeduction deferredCarryForward finalSalary paidDate paidStatus paymentMode remarks settledWithSalaryId"
    );

  const records = filterHistoryByScope(allRecords, parsed.data);

  const paidRecords = records.filter((r) => r.paidStatus === SalaryPaidStatus.PAID);
  const pendingRecords = records.filter(
    (r) => r.paidStatus === SalaryPaidStatus.PENDING
  );
  const deferredRecords = records.filter(
    (r) => r.paidStatus === SalaryPaidStatus.DEFERRED
  );
  const skippedRecords = records.filter(
    (r) => r.paidStatus === SalaryPaidStatus.SKIPPED
  );

  const totalPaid = paidRecords.reduce((s, r) => s + r.finalSalary, 0);
  const totalPending = pendingRecords.reduce((s, r) => s + r.finalSalary, 0);
  const totalDeferred = deferredRecords.reduce((s, r) => s + r.finalSalary, 0);
  const totalAdvanceDed = records.reduce((s, r) => s + r.advanceDeduction, 0);

  const scopeLabel = hasCustomDateFilter(parsed.data)
    ? `${parsed.data.dateFrom} – ${parsed.data.dateTo ?? parsed.data.dateFrom}`
    : parsed.data.month && parsed.data.year
      ? new Date(parsed.data.year, parsed.data.month - 1).toLocaleString("en", {
          month: "long",
          year: "numeric",
        })
      : parsed.data.year
        ? String(parsed.data.year)
        : "All time";

  const off = employee.officeId as { name?: string } | null;

  res.json({
    success: true,
    data: {
      scope: scopeLabel,
      year: parsed.data.year,
      employee: {
        id: employee._id,
        fullName: employee.fullName,
        mobileNumber: employee.mobileNumber,
        monthlySalary: employee.monthlySalary,
        officeName: off?.name ?? "",
      },
      summary: {
        totalRecords: records.length,
        paidCount: paidRecords.length,
        pendingCount: pendingRecords.length,
        deferredCount: deferredRecords.length,
        skippedCount: skippedRecords.length,
        totalPaid,
        totalPending,
        totalDeferred,
        totalAdvanceDed,
      },
      history: records.map((r) => ({
        month: r.month,
        year: r.year,
        baseSalary: r.baseSalary,
        bonus: r.bonus,
        otherAddition: r.otherAddition,
        otherDeduction: r.otherDeduction,
        advanceDeduction: r.advanceDeduction,
        deferredCarryForward: r.deferredCarryForward ?? 0,
        netSalary: r.finalSalary,
        paidDate: r.paidDate,
        paidStatus: r.paidStatus,
        paymentMode: r.paymentMode,
        remarks: r.remarks,
        settledViaLaterMonth: Boolean(r.settledWithSalaryId),
      })),
    },
  });
}

export async function advanceReport(req: AuthRequest, res: Response): Promise<void> {
  const parsed = periodSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("Month and year required");
  }

  const filter: Record<string, unknown> = { ...getOfficeIdFilter(req) };
  applyOfficeFilter(req, filter, parsed.data.officeId);
  applyAdvanceDateRange(filter, parsed.data);

  const advances = await Advance.find(filter)
    .populate("employeeId", "fullName")
    .populate("officeId", "name")
    .sort({ date: -1 });

  const report = advances.map((a) => {
    const emp = a.employeeId as { fullName?: string } | null;
    const off = a.officeId as { name?: string } | null;
    return {
      employee:
        emp && typeof emp === "object" && "fullName" in emp
          ? { fullName: emp.fullName }
          : null,
      officeName: off?.name ?? "",
      advanceTaken: a.advanceAmount,
      amountRecovered: a.amountRecovered,
      outstandingBalance: a.outstandingAmount,
      recoveryMode: a.recoveryMode,
      isFullyRecovered: a.isFullyRecovered,
      date: a.date,
      reason: a.reason,
    };
  });

  const summary = {
    totalAdvances: advances.length,
    totalTaken: advances.reduce((s, a) => s + a.advanceAmount, 0),
    totalRecovered: advances.reduce((s, a) => s + a.amountRecovered, 0),
    totalOutstanding: advances.reduce((s, a) => s + a.outstandingAmount, 0),
    activeCount: advances.filter((a) => !a.isFullyRecovered).length,
  };

  res.json({
    success: true,
    data: {
      ...periodMeta(parsed.data),
      summary,
      rows: report,
    },
  });
}
