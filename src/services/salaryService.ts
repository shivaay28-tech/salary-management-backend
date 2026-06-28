import mongoose from "mongoose";
import { Advance, IAdvance } from "../models/Advance";
import { Employee } from "../models/Employee";
import { SalaryRecord, ISalaryRecord } from "../models/SalaryRecord";
import { SalaryPaidStatus } from "../types/enums";
import {
  buildPayableEmployeeFilter,
  calculateFinalSalary,
  calculateProRataBaseSalary,
} from "../utils/salary";
import { computeAdvanceDeduction } from "./advanceService";
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

function isBeforePeriod(
  month: number,
  year: number,
  beforeMonth: number,
  beforeYear: number
): boolean {
  return year < beforeYear || (year === beforeYear && month < beforeMonth);
}

function groupAdvancesByEmployee(
  advances: IAdvance[]
): Map<string, IAdvance[]> {
  const map = new Map<string, IAdvance[]>();
  for (const advance of advances) {
    const employeeId = advance.employeeId.toString();
    const list = map.get(employeeId);
    if (list) list.push(advance);
    else map.set(employeeId, [advance]);
  }
  return map;
}

function getUnsettledDeferredForEmployee(
  deferredRecords: ISalaryRecord[],
  employeeId: string,
  month: number,
  year: number
): ISalaryRecord[] {
  return deferredRecords.filter(
    (record) =>
      record.employeeId.toString() === employeeId &&
      isBeforePeriod(record.month, record.year, month, year)
  );
}

function buildSalaryAmounts(
  baseSalary: number,
  bonus: number,
  otherAddition: number,
  otherDeduction: number,
  carryForward: number,
  advances: IAdvance[]
) {
  const grossBeforeAdvance =
    baseSalary + bonus + otherAddition + carryForward - otherDeduction;
  const { totalDeduction } = computeAdvanceDeduction(
    advances,
    Math.max(0, grossBeforeAdvance)
  );
  const finalSalary = calculateFinalSalary({
    monthlySalary: baseSalary,
    bonus,
    otherAddition: otherAddition + carryForward,
    otherDeduction,
    advanceDeduction: totalDeduction,
  });
  return { advanceDeduction: totalDeduction, finalSalary, carryForward };
}

function buildProRataMetadata(
  employee: {
    monthlySalary: number;
    dateOfJoining: Date;
    outDate?: Date;
  },
  month: number,
  year: number
) {
  const proRata = calculateProRataBaseSalary({
    monthlySalary: employee.monthlySalary,
    dateOfJoining: employee.dateOfJoining,
    outDate: employee.outDate,
    month,
    year,
  });

  return {
    proRata,
    fields: {
      baseSalary: proRata.baseSalary,
      fullMonthlySalary: proRata.fullMonthlySalary,
      payableDays: proRata.payableDays,
      daysInMonth: proRata.daysInMonth,
    },
  };
}

export async function generateMonthlySalaries(
  options: GenerateSalaryOptions
): Promise<{ created: number; skipped: number }> {
  const { month, year, createdBy } = options;

  const officeFilter: Record<string, unknown> = {};
  if (options.officeId) {
    officeFilter.officeId = options.officeId;
  } else if (options.officeIds != null) {
    if (options.officeIds.length === 0) {
      return { created: 0, skipped: 0 };
    }
    officeFilter.officeId = { $in: options.officeIds };
  }

  const employees = await Employee.find(
    buildPayableEmployeeFilter(month, year, officeFilter)
  ).lean();
  if (employees.length === 0) {
    await SalaryRecord.deleteMany({
      ...officeFilter,
      month,
      year,
      paidStatus: SalaryPaidStatus.PENDING,
    });
    return { created: 0, skipped: 0 };
  }

  const employeeIds = employees.map((employee) => employee._id);

  await SalaryRecord.deleteMany({
    ...officeFilter,
    month,
    year,
    paidStatus: SalaryPaidStatus.PENDING,
    employeeId: { $nin: employeeIds },
  });

  const [existingRecords, allAdvances, allDeferred] = await Promise.all([
    SalaryRecord.find({ employeeId: { $in: employeeIds }, month, year }),
    Advance.find({
      employeeId: { $in: employeeIds },
      isFullyRecovered: false,
      outstandingAmount: { $gt: 0 },
    }).sort({ date: 1 }),
    SalaryRecord.find({
      employeeId: { $in: employeeIds },
      paidStatus: SalaryPaidStatus.DEFERRED,
      carriedToSalaryId: { $exists: false },
    }),
  ]);

  const existingMap = new Map(
    existingRecords.map((record) => [record.employeeId.toString(), record])
  );
  const advancesByEmployee = groupAdvancesByEmployee(allAdvances);

  const bonus = options.bonus ?? 0;
  const otherAddition = options.otherAddition ?? 0;
  const otherDeduction = options.otherDeduction ?? 0;
  const createdById = new mongoose.Types.ObjectId(createdBy.userId);

  const recordsToInsert: Record<string, unknown>[] = [];
  const recordsToUpdate: {
    updateOne: {
      filter: { _id: mongoose.Types.ObjectId };
      update: { $set: Record<string, unknown> };
    };
  }[] = [];
  const pendingRecordIds: mongoose.Types.ObjectId[] = [];
  const deferredLinkOps: {
    updateOne: {
      filter: { _id: mongoose.Types.ObjectId };
      update: { $set: { carriedToSalaryId: mongoose.Types.ObjectId } };
    };
  }[] = [];

  let created = 0;
  let skipped = 0;

  for (const employee of employees) {
    const employeeId = employee._id.toString();
    const { proRata, fields: proRataFields } = buildProRataMetadata(
      employee,
      month,
      year
    );

    if (!proRata.isPayable) {
      continue;
    }

    const existing = existingMap.get(employeeId);
    const deferredForEmployee = getUnsettledDeferredForEmployee(
      allDeferred,
      employeeId,
      month,
      year
    );
    const carryForward = deferredForEmployee.reduce(
      (sum, record) => sum + record.finalSalary,
      0
    );
    const settledDeferredIds = deferredForEmployee.map(
      (record) => record._id as mongoose.Types.ObjectId
    );
    const advances = advancesByEmployee.get(employeeId) ?? [];

    if (existing) {
      if (existing.paidStatus === SalaryPaidStatus.PENDING) {
        pendingRecordIds.push(existing._id as mongoose.Types.ObjectId);

        const update: Record<string, unknown> = {
          ...proRataFields,
          deferredCarryForward: carryForward,
          settledDeferredIds,
        };

        if (existing.advanceDeductionManual) {
          const finalSalary = calculateFinalSalary({
            monthlySalary: proRataFields.baseSalary,
            bonus: existing.bonus,
            otherAddition: existing.otherAddition + carryForward,
            otherDeduction: existing.otherDeduction,
            advanceDeduction: existing.advanceDeduction,
          });
          update.finalSalary = finalSalary;
        } else {
          const amounts = buildSalaryAmounts(
            proRataFields.baseSalary,
            existing.bonus,
            existing.otherAddition,
            existing.otherDeduction,
            carryForward,
            advances
          );
          update.advanceDeduction = amounts.advanceDeduction;
          update.finalSalary = amounts.finalSalary;
        }

        recordsToUpdate.push({
          updateOne: {
            filter: { _id: existing._id },
            update: { $set: update },
          },
        });

        for (const deferred of deferredForEmployee) {
          deferredLinkOps.push({
            updateOne: {
              filter: { _id: deferred._id },
              update: { $set: { carriedToSalaryId: existing._id } },
            },
          });
        }
      }
      skipped++;
      continue;
    }

    const amounts = buildSalaryAmounts(
      proRataFields.baseSalary,
      bonus,
      otherAddition,
      otherDeduction,
      carryForward,
      advances
    );

    recordsToInsert.push({
      employeeId: employee._id,
      officeId: employee.officeId,
      month,
      year,
      ...proRataFields,
      bonus,
      otherAddition,
      otherDeduction,
      advanceDeduction: amounts.advanceDeduction,
      finalSalary: amounts.finalSalary,
      paidStatus: SalaryPaidStatus.PENDING,
      deferredCarryForward: carryForward,
      settledDeferredIds,
      createdBy: createdById,
      _employeeIdKey: employeeId,
      _deferredIds: deferredForEmployee.map((record) => record._id),
    });
    created++;
  }

  if (pendingRecordIds.length > 0) {
    await SalaryRecord.updateMany(
      { carriedToSalaryId: { $in: pendingRecordIds } },
      { $unset: { carriedToSalaryId: 1 } }
    );
  }

  if (recordsToUpdate.length > 0) {
    await SalaryRecord.bulkWrite(recordsToUpdate);
  }

  if (recordsToInsert.length > 0) {
    const insertPayload = recordsToInsert.map(
      ({ _employeeIdKey: _e, _deferredIds: _d, ...record }) => record
    );
    const inserted = await SalaryRecord.insertMany(insertPayload, {
      ordered: false,
    });

    for (let i = 0; i < inserted.length; i++) {
      const meta = recordsToInsert[i] as {
        _deferredIds?: mongoose.Types.ObjectId[];
      };
      const insertedId = inserted[i]._id as mongoose.Types.ObjectId;
      for (const deferredId of meta._deferredIds ?? []) {
        deferredLinkOps.push({
          updateOne: {
            filter: { _id: deferredId },
            update: { $set: { carriedToSalaryId: insertedId } },
          },
        });
      }
    }
  }

  if (deferredLinkOps.length > 0) {
    await SalaryRecord.bulkWrite(deferredLinkOps);
  }

  return { created, skipped };
}
