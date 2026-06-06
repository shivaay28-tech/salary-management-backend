import mongoose from "mongoose";
import { Advance, IAdvance } from "../models/Advance";
import { AdvanceRecoveryMode } from "../types/enums";

export interface AdvanceAllocation {
  advanceId: mongoose.Types.ObjectId;
  amount: number;
}

export function computeAdvanceDeduction(
  advances: IAdvance[],
  availableAmount: number
): { totalDeduction: number; allocations: AdvanceAllocation[] } {
  const active = advances
    .filter((a) => !a.isFullyRecovered && a.outstandingAmount > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  let remaining = Math.max(0, availableAmount);
  const allocations: AdvanceAllocation[] = [];
  let totalDeduction = 0;

  for (const advance of active) {
    if (remaining <= 0) break;

    let deduct = 0;
    if (advance.recoveryMode === AdvanceRecoveryMode.FULL) {
      deduct = Math.min(advance.outstandingAmount, remaining);
    } else if (advance.recoveryMode === AdvanceRecoveryMode.INSTALLMENT) {
      const installment = advance.installmentAmount ?? 0;
      deduct = Math.min(advance.outstandingAmount, installment, remaining);
    } else {
      // Custom: deducted manually when marking salary paid
      deduct = 0;
    }

    if (deduct > 0) {
      allocations.push({ advanceId: advance._id, amount: deduct });
      totalDeduction += deduct;
      remaining -= deduct;
    }
  }

  return { totalDeduction, allocations };
}

export interface RecoveryLogContext {
  employeeId: string;
  salaryRecordId: string;
  officeId: string;
  month: number;
  year: number;
  deductedAt: Date;
}

export async function applyAdvanceRecoveries(
  allocations: AdvanceAllocation[],
  logContext?: RecoveryLogContext
): Promise<void> {
  const { AdvanceDeductionLog } = await import("../models/AdvanceDeductionLog");

  for (const { advanceId, amount } of allocations) {
    const advance = await Advance.findById(advanceId);
    if (!advance) continue;

    advance.amountRecovered += amount;
    advance.outstandingAmount = Math.max(
      0,
      advance.outstandingAmount - amount
    );
    if (advance.outstandingAmount <= 0) {
      advance.outstandingAmount = 0;
      advance.isFullyRecovered = true;
    }
    await advance.save();

    if (logContext && amount > 0) {
      await AdvanceDeductionLog.create({
        employeeId: logContext.employeeId,
        advanceId: advance._id,
        salaryRecordId: logContext.salaryRecordId,
        officeId: logContext.officeId,
        amount,
        month: logContext.month,
        year: logContext.year,
        deductedAt: logContext.deductedAt,
      });
    }
  }
}

export async function getActiveAdvancesForEmployee(
  employeeId: string
): Promise<IAdvance[]> {
  return Advance.find({
    employeeId: new mongoose.Types.ObjectId(employeeId),
    isFullyRecovered: false,
    outstandingAmount: { $gt: 0 },
  }).sort({ date: 1 });
}

export function getTotalOutstanding(advances: IAdvance[]): number {
  return advances
    .filter((a) => !a.isFullyRecovered && a.outstandingAmount > 0)
    .reduce((sum, a) => sum + a.outstandingAmount, 0);
}

/** Distribute a fixed deduction across advances (oldest first). */
export function allocateCustomAdvanceDeduction(
  advances: IAdvance[],
  deductionAmount: number
): { totalDeduction: number; allocations: AdvanceAllocation[] } {
  const active = advances
    .filter((a) => !a.isFullyRecovered && a.outstandingAmount > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  let remaining = Math.max(0, deductionAmount);
  const allocations: AdvanceAllocation[] = [];
  let totalDeduction = 0;

  for (const advance of active) {
    if (remaining <= 0) break;
    const deduct = Math.min(advance.outstandingAmount, remaining);
    if (deduct > 0) {
      allocations.push({ advanceId: advance._id, amount: deduct });
      totalDeduction += deduct;
      remaining -= deduct;
    }
  }

  return { totalDeduction, allocations };
}

export function validateAdvanceDeductionAmount(
  advances: IAdvance[],
  grossBeforeAdvance: number,
  requestedAmount: number
): { valid: boolean; message?: string; maxAllowed: number } {
  const outstanding = getTotalOutstanding(advances);
  const maxAllowed = Math.min(Math.max(0, grossBeforeAdvance), outstanding);

  if (requestedAmount < 0) {
    return { valid: false, message: "Advance deduction cannot be negative", maxAllowed };
  }
  if (requestedAmount > grossBeforeAdvance) {
    return {
      valid: false,
      message: `Cannot deduct more than gross salary (₹${grossBeforeAdvance})`,
      maxAllowed,
    };
  }
  if (requestedAmount > outstanding) {
    return {
      valid: false,
      message: `Cannot deduct more than outstanding advance (₹${outstanding})`,
      maxAllowed,
    };
  }

  return { valid: true, maxAllowed };
}
