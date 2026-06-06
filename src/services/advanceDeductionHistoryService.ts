import mongoose from "mongoose";
import { AdvanceDeductionLog } from "../models/AdvanceDeductionLog";
import { SalaryRecord } from "../models/SalaryRecord";
import { SalaryPaidStatus } from "../types/enums";

export interface DeductionHistoryItem {
  id: string;
  advanceId?: string;
  salaryRecordId?: string;
  amount: number;
  month: number;
  year: number;
  deductedAt: string;
  periodLabel: string;
}

export async function getDeductionHistoryForEmployee(
  employeeId: string
): Promise<DeductionHistoryItem[]> {
  const logs = await AdvanceDeductionLog.find({
    employeeId: new mongoose.Types.ObjectId(employeeId),
  })
    .sort({ deductedAt: -1 })
    .lean();

  if (logs.length > 0) {
    return logs.map((log) => ({
      id: log._id.toString(),
      advanceId: log.advanceId.toString(),
      salaryRecordId: log.salaryRecordId.toString(),
      amount: log.amount,
      month: log.month,
      year: log.year,
      deductedAt: log.deductedAt.toISOString(),
      periodLabel: formatPeriod(log.month, log.year),
    }));
  }

  const salaries = await SalaryRecord.find({
    employeeId: new mongoose.Types.ObjectId(employeeId),
    paidStatus: SalaryPaidStatus.PAID,
    advanceDeduction: { $gt: 0 },
  })
    .sort({ year: -1, month: -1 })
    .lean();

  return salaries.map((s) => ({
    id: s._id.toString(),
    salaryRecordId: s._id.toString(),
    amount: s.advanceDeduction,
    month: s.month,
    year: s.year,
    deductedAt: (s.paidDate ?? s.updatedAt).toISOString(),
    periodLabel: formatPeriod(s.month, s.year),
  }));
}

export async function getDeductionHistoryByEmployee(
  employeeIds: string[]
): Promise<Map<string, DeductionHistoryItem[]>> {
  const map = new Map<string, DeductionHistoryItem[]>();

  for (const id of employeeIds) {
    map.set(id, await getDeductionHistoryForEmployee(id));
  }

  return map;
}

function formatPeriod(month: number, year: number): string {
  const name = new Date(year, month - 1).toLocaleString("en", { month: "long" });
  return `${name} ${year}`;
}
