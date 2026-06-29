import { Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { SalaryRecord } from "../models/SalaryRecord";
import { Employee } from "../models/Employee";
import { Advance } from "../models/Advance";
import { SalaryPaidStatus, SalaryPaymentMode } from "../types/enums";
import { AuthRequest } from "../middleware/auth";
import { assertOfficeAccess } from "../middleware/rbac";
import { AppError } from "../middleware/errorHandler";
import { logAudit } from "../services/auditService";
import { generateMonthlySalaries } from "../services/salaryService";
import { getOfficeIdFilter, getOfficeIdsForQuery } from "../utils/officeFilter";
import {
  applyAdvanceDeductionToSalary,
  getSalaryAdvanceSummary,
  paySalaryRecord,
} from "../services/salaryAdvanceService";
import { JAMA_UI } from "../constants/jamaLabels";
import {
  buildDeferredSalaryStatement,
  buildSkippedSalaryStatement,
  createManualDeferredSalary,
  deferSalaryRecord,
  skipSalaryRecord,
} from "../services/salaryDeferService";
import { isSalaryVisibleForPeriod, salaryEmployeeDates } from "../utils/salary";

const updateSalarySchema = z.object({
  bonus: z.coerce.number().min(0).optional(),
  otherAddition: z.coerce.number().min(0).optional(),
  otherDeduction: z.coerce.number().min(0).optional(),
  advanceDeduction: z.coerce.number().min(0).optional(),
  remarks: z.string().optional(),
});

const payBankSchema = z.object({
  bankName: z.string().min(1),
  accountHolderName: z.string().min(1),
  accountNumber: z.string().min(1),
  ifscCode: z.string().min(1),
  branch: z.string().min(1),
});

const payAngadiyaSchema = z.object({
  name: z.string().min(1),
  number: z.string().min(10),
  angadiyaNumber: z.string().min(1),
  amount: z.coerce.number().min(0),
  city: z.string().min(1),
});

const paySalarySchema = z
  .object({
    advanceDeduction: z.coerce.number().min(0).optional(),
    paidAmount: z.coerce.number().positive().optional(),
    paymentMode: z.nativeEnum(SalaryPaymentMode),
    bankDetails: payBankSchema.optional(),
    angadiyaDetails: payAngadiyaSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.paymentMode === SalaryPaymentMode.BANK && !data.bankDetails) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bank details required for bank payment",
        path: ["bankDetails"],
      });
    }
    if (data.paymentMode === SalaryPaymentMode.ANGADIYA && !data.angadiyaDetails) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Angadiya details required for angadiya payment",
        path: ["angadiyaDetails"],
      });
    }
  });

const generateSchema = z.object({
  month: z.coerce.number().min(1).max(12),
  year: z.coerce.number().min(2000),
  officeId: z.string().optional(),
  bonus: z.coerce.number().min(0).optional(),
  otherAddition: z.coerce.number().min(0).optional(),
  otherDeduction: z.coerce.number().min(0).optional(),
});

const deferSalarySchema = z.object({
  remarks: z.string().optional(),
  deferredUntilMonth: z.coerce.number().min(1).max(12).optional(),
  deferredUntilYear: z.coerce.number().min(2000).optional(),
});

const skipSalarySchema = z.object({
  remarks: z.string().min(1, "Reason is required"),
});

const createManualDeferredSchema = z.object({
  employeeId: z.string(),
  month: z.coerce.number().min(1).max(12),
  year: z.coerce.number().min(2000),
  amount: z.coerce.number().positive(),
  remarks: z.string().optional(),
  deferredUntilMonth: z.coerce.number().min(1).max(12).optional(),
  deferredUntilYear: z.coerce.number().min(2000).optional(),
});

const payAllSchema = z.object({
  month: z.coerce.number().min(1).max(12),
  year: z.coerce.number().min(2000),
  officeId: z.string().optional(),
  paymentMode: z.nativeEnum(SalaryPaymentMode),
});

export async function listSalaries(req: AuthRequest, res: Response): Promise<void> {
  const filter: Record<string, unknown> = { ...getOfficeIdFilter(req) };

  if (req.query.month) filter.month = Number(req.query.month);
  if (req.query.year) filter.year = Number(req.query.year);
  if (req.query.officeId) {
    const officeId = String(req.query.officeId);
    assertOfficeAccess(req, officeId);
    filter.officeId = officeId;
  }
  if (req.query.paidStatus) filter.paidStatus = String(req.query.paidStatus);
  if (req.query.employeeId) filter.employeeId = String(req.query.employeeId);

  const salaries = await SalaryRecord.find(filter)
    .populate("employeeId", "fullName monthlySalary dateOfJoining outDate status")
    .populate("officeId", "name")
    .sort({ year: -1, month: -1 });

  const visibleSalaries = salaries.filter((s) => {
    const dates = salaryEmployeeDates(s.employeeId);
    return dates ? isSalaryVisibleForPeriod(dates, s.month, s.year) : false;
  });

  const employeeIds = [
    ...new Set(
      visibleSalaries
        .map((s) => {
          const emp = s.employeeId as
            | { _id?: { toString(): string } }
            | mongoose.Types.ObjectId
            | null;
          if (!emp) return null;
          if (typeof emp === "object" && "_id" in emp && emp._id) {
            return emp._id.toString();
          }
          return emp.toString();
        })
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const outstandingRows =
    employeeIds.length > 0
      ? await Advance.aggregate([
          {
            $match: {
              employeeId: {
                $in: employeeIds.map((id) => new mongoose.Types.ObjectId(id)),
              },
              isFullyRecovered: false,
              outstandingAmount: { $gt: 0 },
            },
          },
          {
            $group: {
              _id: "$employeeId",
              outstandingAdvance: { $sum: "$outstandingAmount" },
            },
          },
        ])
      : [];

  const outstandingMap = new Map(
    outstandingRows.map((row) => [row._id.toString(), row.outstandingAdvance as number])
  );

  const data = visibleSalaries.map((s) => {
    const emp = s.employeeId as
      | { _id?: { toString(): string }; fullName?: string }
      | mongoose.Types.ObjectId
      | null;
    let empId: string | null = null;
    if (emp) {
      if (typeof emp === "object" && "_id" in emp && emp._id) {
        empId = emp._id.toString();
      } else {
        empId = emp.toString();
      }
    }
    const json = s.toObject();
    return {
      ...json,
      employeeId: emp ?? json.employeeId,
      outstandingAdvance: empId ? (outstandingMap.get(empId) ?? 0) : 0,
    };
  });

  res.json({ success: true, data });
}

export async function createManualDeferred(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const parsed = createManualDeferredSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  if (!req.user) {
    throw new AppError("Unauthorized", 401);
  }

  const employee = await Employee.findById(parsed.data.employeeId);
  if (!employee) {
    throw new AppError("Employee not found", 404);
  }
  assertOfficeAccess(req, employee.officeId.toString());

  try {
    const record = await createManualDeferredSalary({
      ...parsed.data,
      createdBy: new mongoose.Types.ObjectId(req.user.userId),
    });

    if (req.user) {
      await logAudit(req.user, JAMA_UI.auditAction, "salaries", {
        salaryId: record._id,
        month: record.month,
        year: record.year,
        amount: record.finalSalary,
        manual: true,
      });
    }

    const result = await SalaryRecord.findById(record._id)
      .populate("employeeId", "fullName")
      .populate("officeId", "name");

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    throw new AppError(err instanceof Error ? err.message : JAMA_UI.deferFailed, 400);
  }
}

export async function getSalaryAdvanceInfo(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const record = await SalaryRecord.findById(String(req.params.id));
  if (!record) {
    throw new AppError("Salary record not found", 404);
  }
  assertOfficeAccess(req, record.officeId.toString());

  const summary = await getSalaryAdvanceSummary(
    String(record.employeeId),
    record
  );

  res.json({
    success: true,
    data: {
      ...summary,
      currentDeduction: record.advanceDeduction,
      isManual: record.advanceDeductionManual,
      finalSalary: record.finalSalary,
    },
  });
}

export async function generateSalaries(req: AuthRequest, res: Response): Promise<void> {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  if (parsed.data.officeId) {
    assertOfficeAccess(req, parsed.data.officeId);
  }

  const officeIds = getOfficeIdsForQuery(req) ?? undefined;

  const result = await generateMonthlySalaries({
    month: parsed.data.month,
    year: parsed.data.year,
    officeId: parsed.data.officeId,
    officeIds: parsed.data.officeId ? undefined : officeIds,
    bonus: parsed.data.bonus,
    otherAddition: parsed.data.otherAddition,
    otherDeduction: parsed.data.otherDeduction,
    createdBy: req.user!,
  });

  if (req.user) {
    await logAudit(req.user, "Salaries Generated", "salaries", {
      month: parsed.data.month,
      year: parsed.data.year,
      ...result,
    });
  }

  res.status(201).json({ success: true, data: result });
}

export async function updateSalary(req: AuthRequest, res: Response): Promise<void> {
  const parsed = updateSalarySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("Invalid input");
  }

  const record = await SalaryRecord.findById(String(req.params.id));
  if (!record) {
    throw new AppError("Salary record not found", 404);
  }
  assertOfficeAccess(req, record.officeId.toString());

  if (
    record.paidStatus === SalaryPaidStatus.PAID ||
    record.paidStatus === SalaryPaidStatus.DEFERRED ||
    record.paidStatus === SalaryPaidStatus.SKIPPED
  ) {
    throw new AppError("Cannot edit this salary record", 400);
  }

  if (parsed.data.bonus !== undefined) record.bonus = parsed.data.bonus;
  if (parsed.data.otherAddition !== undefined) {
    record.otherAddition = parsed.data.otherAddition;
  }
  if (parsed.data.otherDeduction !== undefined) {
    record.otherDeduction = parsed.data.otherDeduction;
  }
  if (parsed.data.remarks !== undefined) record.remarks = parsed.data.remarks;

  try {
    if (parsed.data.advanceDeduction !== undefined) {
      await applyAdvanceDeductionToSalary(
        record,
        parsed.data.advanceDeduction,
        true
      );
    } else if (!record.advanceDeductionManual) {
      const { recalculateSalaryAdvances } = await import(
        "../services/salaryRecalcService"
      );
      await recalculateSalaryAdvances(record);
    } else {
      await applyAdvanceDeductionToSalary(
        record,
        record.advanceDeduction,
        true
      );
    }
  } catch (err) {
    throw new AppError(err instanceof Error ? err.message : "Invalid deduction", 400);
  }

  await record.save();

  if (req.user) {
    await logAudit(req.user, "Salary Updated", "salaries", {
      salaryId: record._id,
      advanceDeduction: record.advanceDeduction,
    });
  }

  const result = await SalaryRecord.findById(record._id)
    .populate("employeeId", "fullName")
    .populate("officeId", "name");

  res.json({ success: true, data: result });
}

export async function markSalaryPaid(req: AuthRequest, res: Response): Promise<void> {
  const parsed = paySalarySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("Invalid input");
  }

  const record = await SalaryRecord.findById(String(req.params.id));
  if (!record) {
    throw new AppError("Salary record not found", 404);
  }
  assertOfficeAccess(req, record.officeId.toString());

  try {
    await paySalaryRecord(record, parsed.data.advanceDeduction, {
      paymentMode: parsed.data.paymentMode,
      bankDetails: parsed.data.bankDetails,
      angadiyaDetails: parsed.data.angadiyaDetails,
      paidAmount: parsed.data.paidAmount,
    });
  } catch (err) {
    throw new AppError(err instanceof Error ? err.message : "Payment failed", 400);
  }

  if (req.user) {
    await logAudit(req.user, "Salary Paid", "salaries", {
      salaryId: record._id,
      advanceDeduction: record.advanceDeduction,
      paymentMode: parsed.data.paymentMode,
    });
  }

  const result = await SalaryRecord.findById(record._id)
    .populate("employeeId", "fullName")
    .populate("officeId", "name");

  res.json({ success: true, data: result });
}

export async function markAllSalariesPaid(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const parsed = payAllSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Month and year required");
  }

  if (parsed.data.officeId) {
    assertOfficeAccess(req, parsed.data.officeId);
  }

  const filter: Record<string, unknown> = {
    month: parsed.data.month,
    year: parsed.data.year,
    paidStatus: SalaryPaidStatus.PENDING,
    ...getOfficeIdFilter(req),
  };

  if (parsed.data.officeId) {
    filter.officeId = parsed.data.officeId;
  }

  const pending = await SalaryRecord.find(filter)
    .populate("employeeId", "dateOfJoining outDate")
    .sort({ createdAt: 1 });

  const payablePending = pending.filter((record) => {
    const dates = salaryEmployeeDates(record.employeeId);
    return dates
      ? isSalaryVisibleForPeriod(dates, record.month, record.year)
      : false;
  });

  if (payablePending.length === 0) {
    res.json({
      success: true,
      data: { paid: 0, failed: [], message: "No pending salaries to pay" },
    });
    return;
  }

  let paid = 0;
  const failed: { id: string; employeeId: string; error: string }[] = [];

  for (const record of payablePending) {
    try {
      await paySalaryRecord(record, undefined, {
        paymentMode: parsed.data.paymentMode,
      });
      paid++;
    } catch (err) {
      failed.push({
        id: record._id.toString(),
        employeeId: record.employeeId.toString(),
        error: err instanceof Error ? err.message : "Payment failed",
      });
    }
  }

  if (req.user) {
    await logAudit(req.user, "Bulk Salaries Paid", "salaries", {
      month: parsed.data.month,
      year: parsed.data.year,
      paid,
      failed: failed.length,
    });
  }

  res.json({
    success: true,
    data: {
      paid,
      failed,
      total: payablePending.length,
    },
  });
}

export async function getDeferredStatement(
  req: AuthRequest,
  res: Response
): Promise<void> {
  if (req.query.officeId) {
    assertOfficeAccess(req, String(req.query.officeId));
  }

  const status =
    req.query.status === "settled" || req.query.status === "all"
      ? req.query.status
      : "active";

  const data = await buildDeferredSalaryStatement(getOfficeIdFilter(req), {
    officeId: req.query.officeId ? String(req.query.officeId) : undefined,
    employeeId: req.query.employeeId ? String(req.query.employeeId) : undefined,
    status,
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
  });

  res.json({ success: true, data });
}

export async function getSkippedStatement(
  req: AuthRequest,
  res: Response
): Promise<void> {
  if (req.query.officeId) {
    assertOfficeAccess(req, String(req.query.officeId));
  }

  const data = await buildSkippedSalaryStatement(getOfficeIdFilter(req), {
    officeId: req.query.officeId ? String(req.query.officeId) : undefined,
    employeeId: req.query.employeeId ? String(req.query.employeeId) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    month: req.query.month ? Number(req.query.month) : undefined,
  });

  res.json({ success: true, data });
}

export async function deferSalary(req: AuthRequest, res: Response): Promise<void> {
  const parsed = deferSalarySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("Invalid input");
  }

  const record = await SalaryRecord.findById(String(req.params.id));
  if (!record) {
    throw new AppError("Salary record not found", 404);
  }
  assertOfficeAccess(req, record.officeId.toString());

  try {
    await deferSalaryRecord(
      record,
      parsed.data.remarks,
      parsed.data.deferredUntilMonth,
      parsed.data.deferredUntilYear
    );
  } catch (err) {
    throw new AppError(err instanceof Error ? err.message : JAMA_UI.deferFailed, 400);
  }

  if (req.user) {
    await logAudit(req.user, JAMA_UI.auditAction, "salaries", {
      salaryId: record._id,
      month: record.month,
      year: record.year,
      amount: record.finalSalary,
    });
  }

  const result = await SalaryRecord.findById(record._id)
    .populate("employeeId", "fullName")
    .populate("officeId", "name");

  res.json({ success: true, data: result });
}

export async function skipSalary(req: AuthRequest, res: Response): Promise<void> {
  const parsed = skipSalarySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const record = await SalaryRecord.findById(String(req.params.id));
  if (!record) {
    throw new AppError("Salary record not found", 404);
  }
  assertOfficeAccess(req, record.officeId.toString());

  try {
    await skipSalaryRecord(record, parsed.data.remarks);
  } catch (err) {
    throw new AppError(err instanceof Error ? err.message : "Skip failed", 400);
  }

  if (req.user) {
    await logAudit(req.user, "Salary Skipped (Waived)", "salaries", {
      salaryId: record._id,
      month: record.month,
      year: record.year,
      remarks: parsed.data.remarks,
    });
  }

  const result = await SalaryRecord.findById(record._id)
    .populate("employeeId", "fullName")
    .populate("officeId", "name");

  res.json({ success: true, data: result });
}

export async function getSalary(req: AuthRequest, res: Response): Promise<void> {
  const record = await SalaryRecord.findById(String(req.params.id))
    .populate("employeeId", "fullName bankDetails angadiyaDetails")
    .populate("officeId", "name");
  if (!record) {
    throw new AppError("Salary record not found", 404);
  }
  assertOfficeAccess(req, record.officeId.toString());
  res.json({ success: true, data: record });
}
