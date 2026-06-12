"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyAdvanceDeductionToRecord = applyAdvanceDeductionToRecord;
exports.recalculateFinalSalaryKeepingAdvance = recalculateFinalSalaryKeepingAdvance;
exports.refreshPendingSalaryFromEmployee = refreshPendingSalaryFromEmployee;
exports.recalculateSalaryAdvances = recalculateSalaryAdvances;
exports.recalculatePendingSalaries = recalculatePendingSalaries;
const SalaryRecord_1 = require("../models/SalaryRecord");
const enums_1 = require("../types/enums");
const salary_1 = require("../utils/salary");
const advanceService_1 = require("./advanceService");
function carryForwardAddition(record) {
    return record.deferredCarryForward ?? 0;
}
function applyAdvanceDeductionToRecord(record, advances) {
    const grossBeforeAdvance = record.baseSalary +
        record.bonus +
        record.otherAddition +
        carryForwardAddition(record) -
        record.otherDeduction;
    const { totalDeduction } = (0, advanceService_1.computeAdvanceDeduction)(advances, Math.max(0, grossBeforeAdvance));
    record.advanceDeduction = totalDeduction;
    record.finalSalary = (0, salary_1.calculateFinalSalary)({
        monthlySalary: record.baseSalary,
        bonus: record.bonus,
        otherAddition: record.otherAddition + carryForwardAddition(record),
        otherDeduction: record.otherDeduction,
        advanceDeduction: totalDeduction,
    });
}
function recalculateFinalSalaryKeepingAdvance(record) {
    record.finalSalary = (0, salary_1.calculateFinalSalary)({
        monthlySalary: record.baseSalary,
        bonus: record.bonus,
        otherAddition: record.otherAddition + carryForwardAddition(record),
        otherDeduction: record.otherDeduction,
        advanceDeduction: record.advanceDeduction,
    });
}
/** Refresh a pending salary from employee base pay; keep manual advance deduction. */
async function refreshPendingSalaryFromEmployee(record, monthlySalary) {
    if (record.paidStatus === enums_1.SalaryPaidStatus.PAID ||
        record.paidStatus === enums_1.SalaryPaidStatus.SKIPPED ||
        record.paidStatus === enums_1.SalaryPaidStatus.DEFERRED) {
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
        record.otherAddition +
        carryForwardAddition(record) -
        record.otherDeduction;
    const { totalDeduction } = (0, advanceService_1.computeAdvanceDeduction)(advances, Math.max(0, grossBeforeAdvance));
    const finalSalary = (0, salary_1.calculateFinalSalary)({
        monthlySalary: record.baseSalary,
        bonus: record.bonus,
        otherAddition: record.otherAddition + carryForwardAddition(record),
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
    const { applyDeferredCarryForward } = await Promise.resolve().then(() => __importStar(require("./salaryDeferService")));
    const pending = await SalaryRecord_1.SalaryRecord.find({
        ...filter,
        paidStatus: enums_1.SalaryPaidStatus.PENDING,
    });
    for (const record of pending) {
        await applyDeferredCarryForward(record);
    }
}
