"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGrossBeforeAdvance = getGrossBeforeAdvance;
exports.getSalaryAdvanceSummary = getSalaryAdvanceSummary;
exports.applyAdvanceDeductionToSalary = applyAdvanceDeductionToSalary;
exports.paySalaryRecord = paySalaryRecord;
const enums_1 = require("../types/enums");
const salary_1 = require("../utils/salary");
const salaryRecalcService_1 = require("./salaryRecalcService");
const salaryDeferService_1 = require("./salaryDeferService");
const advanceService_1 = require("./advanceService");
const advanceService_2 = require("./advanceService");
function getGrossBeforeAdvance(record) {
    return (record.baseSalary +
        record.bonus +
        record.otherAddition +
        (record.deferredCarryForward ?? 0) -
        record.otherDeduction);
}
async function getSalaryAdvanceSummary(employeeId, record) {
    const advances = await (0, advanceService_2.getActiveAdvancesForEmployee)(employeeId);
    const grossBeforeAdvance = Math.max(0, getGrossBeforeAdvance(record));
    const totalOutstanding = (0, advanceService_2.getTotalOutstanding)(advances);
    const { totalDeduction: suggestedAuto } = (0, advanceService_2.computeAdvanceDeduction)(advances, grossBeforeAdvance);
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
async function applyAdvanceDeductionToSalary(record, deductionAmount, manual) {
    const advances = await (0, advanceService_2.getActiveAdvancesForEmployee)(String(record.employeeId));
    const gross = Math.max(0, getGrossBeforeAdvance(record));
    const validation = (0, advanceService_2.validateAdvanceDeductionAmount)(advances, gross, deductionAmount);
    if (!validation.valid) {
        throw new Error(validation.message ?? "Invalid advance deduction");
    }
    const { totalDeduction, allocations } = (0, advanceService_2.allocateCustomAdvanceDeduction)(advances, deductionAmount);
    record.advanceDeduction = totalDeduction;
    record.advanceDeductionManual = manual;
    record.finalSalary = (0, salary_1.calculateFinalSalary)({
        monthlySalary: record.baseSalary,
        bonus: record.bonus,
        otherAddition: record.otherAddition + (record.deferredCarryForward ?? 0),
        otherDeduction: record.otherDeduction,
        advanceDeduction: totalDeduction,
    });
    return { allocations };
}
async function paySalaryRecord(record, advanceDeductionOverride, options) {
    if (record.paidStatus === enums_1.SalaryPaidStatus.PAID) {
        throw new Error("Salary already paid");
    }
    if (record.paidStatus !== enums_1.SalaryPaidStatus.PENDING) {
        throw new Error("Only pending salaries can be paid");
    }
    if (!record.advanceDeductionManual && advanceDeductionOverride === undefined) {
        await (0, salaryRecalcService_1.recalculateSalaryAdvances)(record);
    }
    const deductionAmount = advanceDeductionOverride !== undefined
        ? advanceDeductionOverride
        : record.advanceDeduction;
    const { allocations } = await applyAdvanceDeductionToSalary(record, deductionAmount, true);
    record.paidStatus = enums_1.SalaryPaidStatus.PAID;
    record.paidDate = new Date();
    if (options?.paymentMode) {
        record.paymentMode = options.paymentMode;
        if (options.paymentMode === enums_1.SalaryPaymentMode.BANK) {
            record.bankDetails = options.bankDetails;
            record.set("angadiyaDetails", undefined);
        }
        else if (options.paymentMode === enums_1.SalaryPaymentMode.ANGADIYA) {
            record.angadiyaDetails = options.angadiyaDetails;
            record.set("bankDetails", undefined);
        }
        else {
            record.set("bankDetails", undefined);
            record.set("angadiyaDetails", undefined);
        }
    }
    await record.save();
    await (0, salaryDeferService_1.settleDeferredOnPayment)(record, record.paidDate ?? new Date());
    if (allocations.length > 0) {
        await (0, advanceService_1.applyAdvanceRecoveries)(allocations, {
            employeeId: String(record.employeeId),
            salaryRecordId: String(record._id),
            officeId: String(record.officeId),
            month: record.month,
            year: record.year,
            deductedAt: record.paidDate ?? new Date(),
        });
    }
}
