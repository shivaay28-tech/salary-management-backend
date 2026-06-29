import mongoose from "mongoose";
import { IAdvance } from "../models/Advance";
import { SalaryRecord, ISalaryRecord } from "../models/SalaryRecord";
import { SalaryPaidStatus } from "../types/enums";
import { calculateFinalSalary, calculateProRataBaseSalary } from "../utils/salary";
import {
  computeAdvanceDeduction,
  getActiveAdvancesForEmployee,
} from "./advanceService";

function carryForwardAddition(record: ISalaryRecord): number {
  return record.deferredCarryForward ?? 0;
}

export function applyAdvanceDeductionToRecord(
  record: ISalaryRecord,
  advances: IAdvance[]
): void {
  const grossBeforeAdvance =
    record.baseSalary +
    record.bonus +
    record.otherAddition +
    carryForwardAddition(record) -
    record.otherDeduction;

  const { totalDeduction } = computeAdvanceDeduction(
    advances,
    Math.max(0, grossBeforeAdvance)
  );

  record.advanceDeduction = totalDeduction;
  record.finalSalary = calculateFinalSalary({
    monthlySalary: record.baseSalary,
    bonus: record.bonus,
    otherAddition: record.otherAddition + carryForwardAddition(record),
    otherDeduction: record.otherDeduction,
    advanceDeduction: totalDeduction,
  });
}

export function recalculateFinalSalaryKeepingAdvance(
  record: ISalaryRecord
): void {
  record.finalSalary = calculateFinalSalary({
    monthlySalary: record.baseSalary,
    bonus: record.bonus,
    otherAddition: record.otherAddition + carryForwardAddition(record),
    otherDeduction: record.otherDeduction,
    advanceDeduction: record.advanceDeduction,
  });
}

/** Refresh a pending salary from employee base pay; keep manual advance deduction. */
export async function refreshPendingSalaryFromEmployee(
  record: ISalaryRecord,
  monthlySalary: number
): Promise<ISalaryRecord> {
  if (
    record.paidStatus === SalaryPaidStatus.PAID ||
    record.paidStatus === SalaryPaidStatus.SKIPPED ||
    record.paidStatus === SalaryPaidStatus.DEFERRED
  ) {
    return record;
  }

  record.baseSalary = monthlySalary;

  if (record.advanceDeductionManual) {
    recalculateFinalSalaryKeepingAdvance(record);
    await record.save();
    return record;
  }

  return recalculateSalaryAdvances(record);
}

export async function recalculateSalaryAdvances(
  record: ISalaryRecord
): Promise<ISalaryRecord> {
  if (
    record.paidStatus === SalaryPaidStatus.PAID ||
    record.advanceDeductionManual
  ) {
    return record;
  }

  const employeeId = String(record.employeeId);

  const advances = await getActiveAdvancesForEmployee(employeeId);
  const grossBeforeAdvance =
    record.baseSalary +
    record.bonus +
    record.otherAddition +
    carryForwardAddition(record) -
    record.otherDeduction;

  const { totalDeduction } = computeAdvanceDeduction(
    advances,
    Math.max(0, grossBeforeAdvance)
  );

  const finalSalary = calculateFinalSalary({
    monthlySalary: record.baseSalary,
    bonus: record.bonus,
    otherAddition: record.otherAddition + carryForwardAddition(record),
    otherDeduction: record.otherDeduction,
    advanceDeduction: totalDeduction,
  });

  if (
    record.advanceDeduction !== totalDeduction ||
    record.finalSalary !== finalSalary
  ) {
    record.advanceDeduction = totalDeduction;
    record.finalSalary = finalSalary;
    await record.save();
  }

  return record;
}

/** Recompute pending salary rows when employee monthly pay or dates change. */
export async function refreshEmployeePendingSalaries(employee: {
  _id: mongoose.Types.ObjectId;
  monthlySalary: number;
  dateOfJoining: Date;
  outDate?: Date | null;
}): Promise<void> {
  const { applyDeferredCarryForward } = await import("./salaryDeferService");
  const pending = await SalaryRecord.find({
    employeeId: employee._id,
    paidStatus: SalaryPaidStatus.PENDING,
  });

  for (const record of pending) {
    const proRata = calculateProRataBaseSalary({
      monthlySalary: employee.monthlySalary,
      dateOfJoining: employee.dateOfJoining,
      outDate: employee.outDate ?? undefined,
      month: record.month,
      year: record.year,
    });

    record.baseSalary = proRata.baseSalary;
    record.fullMonthlySalary = proRata.fullMonthlySalary;
    record.payableDays = proRata.payableDays;
    record.daysInMonth = proRata.daysInMonth;

    await applyDeferredCarryForward(record);

    if (record.advanceDeductionManual) {
      recalculateFinalSalaryKeepingAdvance(record);
    } else {
      await recalculateSalaryAdvances(record);
    }

    await record.save();
  }
}

export async function recalculatePendingSalaries(
  filter: Record<string, unknown>
): Promise<void> {
  const { applyDeferredCarryForward } = await import("./salaryDeferService");
  const pending = await SalaryRecord.find({
    ...filter,
    paidStatus: SalaryPaidStatus.PENDING,
  });

  for (const record of pending) {
    await applyDeferredCarryForward(record);
  }
}
