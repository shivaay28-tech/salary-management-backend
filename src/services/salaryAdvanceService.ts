import {
  ISalaryRecord,
  ISalaryAngadiyaDetails,
  ISalaryBankDetails,
} from "../models/SalaryRecord";
import { SalaryPaidStatus, SalaryPaymentMode } from "../types/enums";
import { calculateFinalSalary } from "../utils/salary";
import { recalculateSalaryAdvances } from "./salaryRecalcService";
import { settleDeferredOnPayment } from "./salaryDeferService";
import { applyAdvanceRecoveries } from "./advanceService";
import {
  computeAdvanceDeduction,
  getActiveAdvancesForEmployee,
  getTotalOutstanding,
  allocateCustomAdvanceDeduction,
  validateAdvanceDeductionAmount,
  AdvanceAllocation,
} from "./advanceService";

export function getGrossBeforeAdvance(record: ISalaryRecord): number {
  return (
    record.baseSalary +
    record.bonus +
    record.otherAddition +
    (record.deferredCarryForward ?? 0) -
    record.otherDeduction
  );
}

export async function getSalaryAdvanceSummary(employeeId: string, record: ISalaryRecord) {
  const advances = await getActiveAdvancesForEmployee(employeeId);
  const grossBeforeAdvance = Math.max(0, getGrossBeforeAdvance(record));
  const totalOutstanding = getTotalOutstanding(advances);
  const { totalDeduction: suggestedAuto } = computeAdvanceDeduction(
    advances,
    grossBeforeAdvance
  );

  return {
    totalOutstanding,
    grossBeforeAdvance,
    suggestedAuto,
    maxAllowed: Math.min(grossBeforeAdvance, totalOutstanding),
    advances: advances.map((a) => ({
      id: a._id,
      advanceAmount: a.advanceAmount,
      outstandingAmount: a.outstandingAmount,
      recoveryMode: a.recoveryMode,
      installmentAmount: a.installmentAmount,
      date: a.date,
    })),
  };
}

export async function applyAdvanceDeductionToSalary(
  record: ISalaryRecord,
  deductionAmount: number,
  manual: boolean
): Promise<{ allocations: AdvanceAllocation[] }> {
  const advances = await getActiveAdvancesForEmployee(String(record.employeeId));
  const gross = Math.max(0, getGrossBeforeAdvance(record));

  const validation = validateAdvanceDeductionAmount(advances, gross, deductionAmount);
  if (!validation.valid) {
    throw new Error(validation.message ?? "Invalid advance deduction");
  }

  const { totalDeduction, allocations } = allocateCustomAdvanceDeduction(
    advances,
    deductionAmount
  );

  record.advanceDeduction = totalDeduction;
  record.advanceDeductionManual = manual;
  record.finalSalary = calculateFinalSalary({
    monthlySalary: record.baseSalary,
    bonus: record.bonus,
    otherAddition: record.otherAddition + (record.deferredCarryForward ?? 0),
    otherDeduction: record.otherDeduction,
    advanceDeduction: totalDeduction,
  });

  return { allocations };
}

/** Mark one salary paid using saved (or overridden) advance deduction. */
export interface PaySalaryOptions {
  paymentMode: SalaryPaymentMode;
  bankDetails?: ISalaryBankDetails;
  angadiyaDetails?: ISalaryAngadiyaDetails;
}

export async function paySalaryRecord(
  record: ISalaryRecord,
  advanceDeductionOverride?: number,
  options?: PaySalaryOptions
): Promise<void> {
  if (record.paidStatus === SalaryPaidStatus.PAID) {
    throw new Error("Salary already paid");
  }
  if (record.paidStatus !== SalaryPaidStatus.PENDING) {
    throw new Error("Only pending salaries can be paid");
  }

  if (!record.advanceDeductionManual && advanceDeductionOverride === undefined) {
    await recalculateSalaryAdvances(record);
  }

  const deductionAmount =
    advanceDeductionOverride !== undefined
      ? advanceDeductionOverride
      : record.advanceDeduction;

  const { allocations } = await applyAdvanceDeductionToSalary(
    record,
    deductionAmount,
    true
  );

  record.paidStatus = SalaryPaidStatus.PAID;
  record.paidDate = new Date();
  if (options?.paymentMode) {
    record.paymentMode = options.paymentMode;
    if (options.paymentMode === SalaryPaymentMode.BANK) {
      record.bankDetails = options.bankDetails;
      record.set("angadiyaDetails", undefined);
    } else if (options.paymentMode === SalaryPaymentMode.ANGADIYA) {
      record.angadiyaDetails = options.angadiyaDetails;
      record.set("bankDetails", undefined);
    } else {
      record.set("bankDetails", undefined);
      record.set("angadiyaDetails", undefined);
    }
  }
  await record.save();
  await settleDeferredOnPayment(record, record.paidDate ?? new Date());

  if (allocations.length > 0) {
    await applyAdvanceRecoveries(allocations, {
      employeeId: String(record.employeeId),
      salaryRecordId: String(record._id),
      officeId: String(record.officeId),
      month: record.month,
      year: record.year,
      deductedAt: record.paidDate ?? new Date(),
    });
  }
}
