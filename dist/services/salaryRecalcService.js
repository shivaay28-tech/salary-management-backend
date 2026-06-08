"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recalculateFinalSalaryKeepingAdvance = recalculateFinalSalaryKeepingAdvance;
exports.refreshPendingSalaryFromEmployee = refreshPendingSalaryFromEmployee;
exports.recalculateSalaryAdvances = recalculateSalaryAdvances;
exports.recalculatePendingSalaries = recalculatePendingSalaries;
const SalaryRecord_1 = require("../models/SalaryRecord");
const enums_1 = require("../types/enums");
const salary_1 = require("../utils/salary");
const advanceService_1 = require("./advanceService");
function recalculateFinalSalaryKeepingAdvance(record) {
    record.finalSalary = (0, salary_1.calculateFinalSalary)({
        monthlySalary: record.baseSalary,
        bonus: record.bonus,
        otherAddition: record.otherAddition,
        otherDeduction: record.otherDeduction,
        advanceDeduction: record.advanceDeduction,
    });
}
/** Refresh a pending salary from employee base pay; keep manual advance deduction. */
async function refreshPendingSalaryFromEmployee(record, monthlySalary) {
    if (record.paidStatus === enums_1.SalaryPaidStatus.PAID) {
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
async function recalculateSalaryAdvances(record) {
    if (record.paidStatus === enums_1.SalaryPaidStatus.PAID ||
        record.advanceDeductionManual) {
        return record;
    }
    const employeeId = String(record.employeeId);
    const advances = await (0, advanceService_1.getActiveAdvancesForEmployee)(employeeId);
    const grossBeforeAdvance = record.baseSalary +
        record.bonus +
        record.otherAddition -
        record.otherDeduction;
    const { totalDeduction } = (0, advanceService_1.computeAdvanceDeduction)(advances, Math.max(0, grossBeforeAdvance));
    const finalSalary = (0, salary_1.calculateFinalSalary)({
        monthlySalary: record.baseSalary,
        bonus: record.bonus,
        otherAddition: record.otherAddition,
        otherDeduction: record.otherDeduction,
        advanceDeduction: totalDeduction,
    });
    if (record.advanceDeduction !== totalDeduction ||
        record.finalSalary !== finalSalary) {
        record.advanceDeduction = totalDeduction;
        record.finalSalary = finalSalary;
        await record.save();
    }
    return record;
}
async function recalculatePendingSalaries(filter) {
    const pending = await SalaryRecord_1.SalaryRecord.find({
        ...filter,
        paidStatus: enums_1.SalaryPaidStatus.PENDING,
    });
    for (const record of pending) {
        await recalculateSalaryAdvances(record);
    }
}
