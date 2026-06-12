"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMonthlySalaries = generateMonthlySalaries;
const mongoose_1 = __importDefault(require("mongoose"));
const Advance_1 = require("../models/Advance");
const Employee_1 = require("../models/Employee");
const SalaryRecord_1 = require("../models/SalaryRecord");
const enums_1 = require("../types/enums");
const salary_1 = require("../utils/salary");
const advanceService_1 = require("./advanceService");
function isBeforePeriod(month, year, beforeMonth, beforeYear) {
    return year < beforeYear || (year === beforeYear && month < beforeMonth);
}
function groupAdvancesByEmployee(advances) {
    const map = new Map();
    for (const advance of advances) {
        const employeeId = advance.employeeId.toString();
        const list = map.get(employeeId);
        if (list)
            list.push(advance);
        else
            map.set(employeeId, [advance]);
    }
    return map;
}
function getUnsettledDeferredForEmployee(deferredRecords, employeeId, month, year) {
    return deferredRecords.filter((record) => record.employeeId.toString() === employeeId &&
        isBeforePeriod(record.month, record.year, month, year));
}
function buildSalaryAmounts(baseSalary, bonus, otherAddition, otherDeduction, carryForward, advances) {
    const grossBeforeAdvance = baseSalary + bonus + otherAddition + carryForward - otherDeduction;
    const { totalDeduction } = (0, advanceService_1.computeAdvanceDeduction)(advances, Math.max(0, grossBeforeAdvance));
    const finalSalary = (0, salary_1.calculateFinalSalary)({
        monthlySalary: baseSalary,
        bonus,
        otherAddition: otherAddition + carryForward,
        otherDeduction,
        advanceDeduction: totalDeduction,
    });
    return { advanceDeduction: totalDeduction, finalSalary, carryForward };
}
function buildProRataMetadata(employee, month, year) {
    const proRata = (0, salary_1.calculateProRataBaseSalary)({
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
async function generateMonthlySalaries(options) {
    const { month, year, createdBy } = options;
    const officeFilter = {};
    if (options.officeId) {
        officeFilter.officeId = options.officeId;
    }
    else if (options.officeIds != null) {
        if (options.officeIds.length === 0) {
            return { created: 0, skipped: 0 };
        }
        officeFilter.officeId = { $in: options.officeIds };
    }
    const employees = await Employee_1.Employee.find((0, salary_1.buildPayableEmployeeFilter)(month, year, officeFilter)).lean();
    if (employees.length === 0) {
        return { created: 0, skipped: 0 };
    }
    const employeeIds = employees.map((employee) => employee._id);
    const [existingRecords, allAdvances, allDeferred] = await Promise.all([
        SalaryRecord_1.SalaryRecord.find({ employeeId: { $in: employeeIds }, month, year }),
        Advance_1.Advance.find({
            employeeId: { $in: employeeIds },
            isFullyRecovered: false,
            outstandingAmount: { $gt: 0 },
        }).sort({ date: 1 }),
        SalaryRecord_1.SalaryRecord.find({
            employeeId: { $in: employeeIds },
            paidStatus: enums_1.SalaryPaidStatus.DEFERRED,
            carriedToSalaryId: { $exists: false },
        }),
    ]);
    const existingMap = new Map(existingRecords.map((record) => [record.employeeId.toString(), record]));
    const advancesByEmployee = groupAdvancesByEmployee(allAdvances);
    const bonus = options.bonus ?? 0;
    const otherAddition = options.otherAddition ?? 0;
    const otherDeduction = options.otherDeduction ?? 0;
    const createdById = new mongoose_1.default.Types.ObjectId(createdBy.userId);
    const recordsToInsert = [];
    const recordsToUpdate = [];
    const pendingRecordIds = [];
    const deferredLinkOps = [];
    let created = 0;
    let skipped = 0;
    for (const employee of employees) {
        const employeeId = employee._id.toString();
        const { proRata, fields: proRataFields } = buildProRataMetadata(employee, month, year);
        if (!proRata.isPayable) {
            continue;
        }
        const existing = existingMap.get(employeeId);
        const deferredForEmployee = getUnsettledDeferredForEmployee(allDeferred, employeeId, month, year);
        const carryForward = deferredForEmployee.reduce((sum, record) => sum + record.finalSalary, 0);
        const settledDeferredIds = deferredForEmployee.map((record) => record._id);
        const advances = advancesByEmployee.get(employeeId) ?? [];
        if (existing) {
            if (existing.paidStatus === enums_1.SalaryPaidStatus.PENDING) {
                pendingRecordIds.push(existing._id);
                const update = {
                    ...proRataFields,
                    deferredCarryForward: carryForward,
                    settledDeferredIds,
                };
                if (existing.advanceDeductionManual) {
                    const finalSalary = (0, salary_1.calculateFinalSalary)({
                        monthlySalary: proRataFields.baseSalary,
                        bonus: existing.bonus,
                        otherAddition: existing.otherAddition + carryForward,
                        otherDeduction: existing.otherDeduction,
                        advanceDeduction: existing.advanceDeduction,
                    });
                    update.finalSalary = finalSalary;
                }
                else {
                    const amounts = buildSalaryAmounts(proRataFields.baseSalary, existing.bonus, existing.otherAddition, existing.otherDeduction, carryForward, advances);
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
        const amounts = buildSalaryAmounts(proRataFields.baseSalary, bonus, otherAddition, otherDeduction, carryForward, advances);
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
            paidStatus: enums_1.SalaryPaidStatus.PENDING,
            deferredCarryForward: carryForward,
            settledDeferredIds,
            createdBy: createdById,
            _employeeIdKey: employeeId,
            _deferredIds: deferredForEmployee.map((record) => record._id),
        });
        created++;
    }
    if (pendingRecordIds.length > 0) {
        await SalaryRecord_1.SalaryRecord.updateMany({ carriedToSalaryId: { $in: pendingRecordIds } }, { $unset: { carriedToSalaryId: 1 } });
    }
    if (recordsToUpdate.length > 0) {
        await SalaryRecord_1.SalaryRecord.bulkWrite(recordsToUpdate);
    }
    if (recordsToInsert.length > 0) {
        const insertPayload = recordsToInsert.map(({ _employeeIdKey: _e, _deferredIds: _d, ...record }) => record);
        const inserted = await SalaryRecord_1.SalaryRecord.insertMany(insertPayload, {
            ordered: false,
        });
        for (let i = 0; i < inserted.length; i++) {
            const meta = recordsToInsert[i];
            const insertedId = inserted[i]._id;
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
        await SalaryRecord_1.SalaryRecord.bulkWrite(deferredLinkOps);
    }
    return { created, skipped };
}
