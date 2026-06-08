import mongoose from "mongoose";
import { Employee } from "../models/Employee";
import { SalaryRecord } from "../models/SalaryRecord";
import { EmployeeStatus, SalaryPaidStatus } from "../types/enums";
import { calculateFinalSalary } from "../utils/salary";
import {
  computeAdvanceDeduction,
  getActiveAdvancesForEmployee,
} from "./advanceService";
import { refreshPendingSalaryFromEmployee } from "./salaryRecalcService";
import { applyDeferredCarryForward } from "./salaryDeferService";
import { TokenPayload } from "../utils/jwt";

export interface GenerateSalaryOptions {
  month: number;
  year: number;
  officeId?: string;
  officeIds?: string[];
  bonus?: number;
  otherAddition?: number;
  otherDeduction?: number;
  createdBy: TokenPayload;
}

export async function generateMonthlySalaries(
  options: GenerateSalaryOptions
): Promise<{ created: number; skipped: number }> {
  const { month, year, createdBy } = options;

  const employeeFilter: Record<string, unknown> = {
    status: EmployeeStatus.ACTIVE,
  };

  if (options.officeId) {
    employeeFilter.officeId = options.officeId;
  } else if (options.officeIds?.length) {
    employeeFilter.officeId = { $in: options.officeIds };
  }

  const employees = await Employee.find(employeeFilter);
  let created = 0;
  let skipped = 0;

  for (const employee of employees) {
    const exists = await SalaryRecord.findOne({
      employeeId: employee._id,
      month,
      year,
    });
    if (exists) {
      if (exists.paidStatus === SalaryPaidStatus.PENDING) {
        await refreshPendingSalaryFromEmployee(exists, employee.monthlySalary);
        await applyDeferredCarryForward(exists);
      }
      skipped++;
      continue;
    }

    const bonus = options.bonus ?? 0;
    const otherAddition = options.otherAddition ?? 0;
    const otherDeduction = options.otherDeduction ?? 0;
    const baseSalary = employee.monthlySalary;

    const advances = await getActiveAdvancesForEmployee(employee._id.toString());

    const record = await SalaryRecord.create({
      employeeId: employee._id,
      officeId: employee.officeId,
      month,
      year,
      baseSalary,
      bonus,
      otherAddition,
      otherDeduction,
      advanceDeduction: 0,
      finalSalary: 0,
      paidStatus: SalaryPaidStatus.PENDING,
      createdBy: new mongoose.Types.ObjectId(createdBy.userId),
    });

    await applyDeferredCarryForward(record);

    const grossBeforeAdvance =
      baseSalary +
      bonus +
      otherAddition +
      (record.deferredCarryForward ?? 0) -
      otherDeduction;

    const { totalDeduction, allocations } = computeAdvanceDeduction(
      advances,
      Math.max(0, grossBeforeAdvance)
    );

    record.advanceDeduction = totalDeduction;
    record.finalSalary = calculateFinalSalary({
      monthlySalary: baseSalary,
      bonus,
      otherAddition: otherAddition + (record.deferredCarryForward ?? 0),
      otherDeduction,
      advanceDeduction: totalDeduction,
    });
    await record.save();
    void allocations;
    created++;
  }

  return { created, skipped };
}
