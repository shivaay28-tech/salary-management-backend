import { Response } from "express";
import { z } from "zod";
import { Advance } from "../models/Advance";
import { AdvanceDeductionLog } from "../models/AdvanceDeductionLog";
import { Employee } from "../models/Employee";
import { AdvanceRecoveryMode } from "../types/enums";
import { AuthRequest } from "../middleware/auth";
import { assertOfficeAccess } from "../middleware/rbac";
import { AppError } from "../middleware/errorHandler";
import { logAudit } from "../services/auditService";
import { getOfficeIdFilter } from "../utils/officeFilter";
import { getDeductionHistoryByEmployee } from "../services/advanceDeductionHistoryService";
import { resolveReportPeriod } from "../utils/dateRange";

const advanceSchema = z
  .object({
    employeeId: z.string(),
    advanceAmount: z.coerce.number().positive(),
    date: z.coerce.date(),
    reason: z.string().min(1),
    notes: z.string().optional(),
    recoveryMode: z.nativeEnum(AdvanceRecoveryMode),
    installmentAmount: z.coerce.number().positive().optional(),
  })
  .refine(
    (data) =>
      data.recoveryMode !== AdvanceRecoveryMode.INSTALLMENT ||
      (data.installmentAmount !== undefined && data.installmentAmount > 0),
    { message: "Installment amount required for installment recovery" }
  )
  .refine(
    (data) =>
      data.recoveryMode !== AdvanceRecoveryMode.CUSTOM ||
      data.installmentAmount === undefined,
    { message: "Installment amount is not used for custom recovery" }
  );

export async function listAdvances(req: AuthRequest, res: Response): Promise<void> {
  const filter: Record<string, unknown> = { ...getOfficeIdFilter(req) };
  if (req.query.officeId) {
    const officeId = String(req.query.officeId);
    assertOfficeAccess(req, officeId);
    filter.officeId = officeId;
  }
  if (req.query.employeeId) {
    filter.employeeId = String(req.query.employeeId);
  }
  if (req.query.status === "active" || req.query.active === "true") {
    filter.isFullyRecovered = false;
  } else if (req.query.status === "recovered") {
    filter.isFullyRecovered = true;
  }

  const advances = await Advance.find(filter)
    .populate("employeeId", "fullName")
    .populate("officeId", "name")
    .sort({ date: -1 });

  res.json({ success: true, data: advances });
}

export async function createAdvance(req: AuthRequest, res: Response): Promise<void> {
  const parsed = advanceSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const employee = await Employee.findById(parsed.data.employeeId);
  if (!employee) {
    throw new AppError("Employee not found", 404);
  }
  assertOfficeAccess(req, employee.officeId.toString());

  const advance = await Advance.create({
    employeeId: employee._id,
    officeId: employee.officeId,
    advanceAmount: parsed.data.advanceAmount,
    date: parsed.data.date,
    reason: parsed.data.reason,
    notes: parsed.data.notes,
    outstandingAmount: parsed.data.advanceAmount,
    recoveryMode: parsed.data.recoveryMode,
    installmentAmount:
      parsed.data.recoveryMode === AdvanceRecoveryMode.INSTALLMENT
        ? parsed.data.installmentAmount
        : undefined,
    amountRecovered: 0,
    isFullyRecovered: false,
    createdBy: req.user!.userId,
  });

  if (req.user) {
    await logAudit(req.user, "Advance Added", "advances", {
      advanceId: advance._id,
      amount: advance.advanceAmount,
    });
  }

  const result = await Advance.findById(advance._id)
    .populate("employeeId", "fullName")
    .populate("officeId", "name");

  res.status(201).json({ success: true, data: result });
}

const advanceUpdateSchema = z
  .object({
    advanceAmount: z.coerce.number().positive().optional(),
    date: z.coerce.date().optional(),
    reason: z.string().min(1).optional(),
    notes: z.string().optional(),
    recoveryMode: z.nativeEnum(AdvanceRecoveryMode).optional(),
    installmentAmount: z.coerce.number().positive().optional(),
  })
  .refine(
    (data) =>
      data.recoveryMode !== AdvanceRecoveryMode.INSTALLMENT ||
      data.installmentAmount === undefined ||
      data.installmentAmount > 0,
    { message: "Installment amount required for installment recovery" }
  );

export async function updateAdvance(req: AuthRequest, res: Response): Promise<void> {
  const parsed = advanceUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const advance = await Advance.findById(String(req.params.id));
  if (!advance) {
    throw new AppError("Advance not found", 404);
  }
  assertOfficeAccess(req, advance.officeId.toString());

  const nextRecoveryMode = parsed.data.recoveryMode ?? advance.recoveryMode;

  if (
    parsed.data.advanceAmount !== undefined &&
    parsed.data.advanceAmount !== advance.advanceAmount
  ) {
    if (parsed.data.advanceAmount < advance.amountRecovered) {
      throw new AppError(
        `Amount cannot be less than already recovered (₹${advance.amountRecovered})`,
        400
      );
    }
    advance.advanceAmount = parsed.data.advanceAmount;
    advance.outstandingAmount = parsed.data.advanceAmount - advance.amountRecovered;
    advance.isFullyRecovered = advance.outstandingAmount <= 0;
  }

  if (parsed.data.date !== undefined) advance.date = parsed.data.date;
  if (parsed.data.reason !== undefined) advance.reason = parsed.data.reason;
  if (parsed.data.notes !== undefined) advance.notes = parsed.data.notes;
  if (parsed.data.recoveryMode !== undefined) advance.recoveryMode = parsed.data.recoveryMode;

  if (nextRecoveryMode === AdvanceRecoveryMode.INSTALLMENT) {
    const installment =
      parsed.data.installmentAmount ?? advance.installmentAmount;
    if (!installment || installment <= 0) {
      throw new AppError("Installment amount required for installment recovery");
    }
    advance.installmentAmount = installment;
  } else {
    advance.installmentAmount = undefined;
  }

  await advance.save();

  if (req.user) {
    await logAudit(req.user, "Advance Updated", "advances", {
      advanceId: advance._id,
    });
  }

  const result = await Advance.findById(advance._id)
    .populate("employeeId", "fullName")
    .populate("officeId", "name");

  res.json({ success: true, data: result });
}

export async function deleteAdvance(req: AuthRequest, res: Response): Promise<void> {
  const advance = await Advance.findById(String(req.params.id));
  if (!advance) {
    throw new AppError("Advance not found", 404);
  }
  assertOfficeAccess(req, advance.officeId.toString());

  if (advance.amountRecovered > 0) {
    throw new AppError(
      "Cannot delete advance that has salary deductions. Recoveries are already recorded.",
      400
    );
  }

  await AdvanceDeductionLog.deleteMany({ advanceId: advance._id });
  await advance.deleteOne();

  if (req.user) {
    await logAudit(req.user, "Advance Deleted", "advances", {
      advanceId: advance._id,
      amount: advance.advanceAmount,
    });
  }

  res.json({ success: true, message: "Advance deleted" });
}

export async function getAdvanceStatement(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const filter: Record<string, unknown> = { ...getOfficeIdFilter(req) };
  if (req.query.officeId) {
    const officeId = String(req.query.officeId);
    assertOfficeAccess(req, officeId);
    filter.officeId = officeId;
  }
  if (req.query.employeeId) {
    filter.employeeId = String(req.query.employeeId);
  }
  if (req.query.status === "active") {
    filter.isFullyRecovered = false;
  } else if (req.query.status === "recovered") {
    filter.isFullyRecovered = true;
  }
  if (req.query.month && req.query.year) {
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    if (month >= 1 && month <= 12 && year >= 2000) {
      const dateFrom =
        typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined;
      const dateTo =
        typeof req.query.dateTo === "string" ? req.query.dateTo : undefined;
      const { start, end } = resolveReportPeriod({ month, year, dateFrom, dateTo });
      filter.date = { $gte: start, $lte: end };
    }
  }

  const advances = await Advance.find(filter)
    .populate("employeeId", "fullName mobileNumber")
    .populate("officeId", "name")
    .sort({ date: -1 });

  type EmpKey = string;
  const byEmployeeMap = new Map<
    EmpKey,
    {
      employeeId: string;
      fullName: string;
      mobileNumber: string;
      officeName: string;
      totalTaken: number;
      totalRecovered: number;
      totalOutstanding: number;
      advances: Array<{
        id: string;
        date: Date;
        advanceAmount: number;
        amountRecovered: number;
        outstandingAmount: number;
        recoveryMode: string;
        installmentAmount?: number;
        reason: string;
        notes?: string;
        status: string;
        deductions: Array<{
          id: string;
          amount: number;
          deductedAt: string;
          periodLabel: string;
        }>;
      }>;
      deductions: Array<{
        id: string;
        advanceId?: string;
        amount: number;
        deductedAt: string;
        periodLabel: string;
      }>;
    }
  >();

  for (const a of advances) {
    const emp = a.employeeId as {
      _id?: { toString(): string };
      fullName?: string;
      mobileNumber?: string;
    } | null;
    const off = a.officeId as { name?: string } | null;
    const empId = emp?._id?.toString() ?? a.employeeId.toString();

    if (!byEmployeeMap.has(empId)) {
      byEmployeeMap.set(empId, {
        employeeId: empId,
        fullName: emp?.fullName ?? "Unknown",
        mobileNumber: emp?.mobileNumber ?? "",
        officeName: off?.name ?? "",
        totalTaken: 0,
        totalRecovered: 0,
        totalOutstanding: 0,
        advances: [],
        deductions: [],
      });
    }

    const row = byEmployeeMap.get(empId)!;
    row.totalTaken += a.advanceAmount;
    row.totalRecovered += a.amountRecovered;
    row.totalOutstanding += a.outstandingAmount;
    row.advances.push({
      id: a._id.toString(),
      date: a.date,
      advanceAmount: a.advanceAmount,
      amountRecovered: a.amountRecovered,
      outstandingAmount: a.outstandingAmount,
      recoveryMode: a.recoveryMode,
      installmentAmount: a.installmentAmount,
      reason: a.reason,
      notes: a.notes,
      status: a.isFullyRecovered ? "Recovered" : "Active",
      deductions: [],
    });
  }

  const byEmployee = Array.from(byEmployeeMap.values()).sort((a, b) =>
    a.fullName.localeCompare(b.fullName)
  );

  const historyMap = await getDeductionHistoryByEmployee(
    byEmployee.map((e) => e.employeeId)
  );

  for (const emp of byEmployee) {
    const allDeductions = historyMap.get(emp.employeeId) ?? [];
    emp.deductions = allDeductions;
    for (const adv of emp.advances) {
      adv.deductions = allDeductions
        .filter((d) => d.advanceId === adv.id)
        .map((d) => ({
          id: d.id,
          amount: d.amount,
          deductedAt: d.deductedAt,
          periodLabel: d.periodLabel,
        }));
    }
  }

  const totals = byEmployee.reduce(
    (acc, e) => ({
      totalTaken: acc.totalTaken + e.totalTaken,
      totalRecovered: acc.totalRecovered + e.totalRecovered,
      totalOutstanding: acc.totalOutstanding + e.totalOutstanding,
    }),
    { totalTaken: 0, totalRecovered: 0, totalOutstanding: 0 }
  );

  res.json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      employeeCount: byEmployee.length,
      ...totals,
      byEmployee,
    },
  });
}

export async function getAdvance(req: AuthRequest, res: Response): Promise<void> {
  const advance = await Advance.findById(String(req.params.id))
    .populate("employeeId", "fullName")
    .populate("officeId", "name");
  if (!advance) {
    throw new AppError("Advance not found", 404);
  }
  assertOfficeAccess(req, advance.officeId.toString());
  res.json({ success: true, data: advance });
}
