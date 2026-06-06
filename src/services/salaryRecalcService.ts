import { SalaryRecord, ISalaryRecord } from "../models/SalaryRecord";
import { SalaryPaidStatus } from "../types/enums";
import { calculateFinalSalary } from "../utils/salary";
import {
  computeAdvanceDeduction,
  getActiveAdvancesForEmployee,
} from "./advanceService";

export function recalculateFinalSalaryKeepingAdvance(
  record: ISalaryRecord
): void {
  record.finalSalary = calculateFinalSalary({
    monthlySalary: record.baseSalary,
    bonus: record.bonus,
    otherAddition: record.otherAddition,
    otherDeduction: record.otherDeduction,
    advanceDeduction: record.advanceDeduction,
  });
}

/** Refresh a pending salary from employee base pay; keep manual advance deduction. */
export async function refreshPendingSalaryFromEmployee(
  record: ISalaryRecord,
  monthlySalary: number
): Promise<ISalaryRecord> {
  if (record.paidStatus === SalaryPaidStatus.PAID) {
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
    record.otherAddition -
    record.otherDeduction;

  const { totalDeduction } = computeAdvanceDeduction(
    advances,
    Math.max(0, grossBeforeAdvance)
  );

  const finalSalary = calculateFinalSalary({
    monthlySalary: record.baseSalary,
    bonus: record.bonus,
    otherAddition: record.otherAddition,
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

export async function recalculatePendingSalaries(
  filter: Record<string, unknown>
): Promise<void> {
  const pending = await SalaryRecord.find({
    ...filter,
    paidStatus: SalaryPaidStatus.PENDING,
  });

  for (const record of pending) {
    await recalculateSalaryAdvances(record);
  }
}
