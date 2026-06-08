"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDeductionHistoryForEmployee = getDeductionHistoryForEmployee;
exports.getDeductionHistoryByEmployee = getDeductionHistoryByEmployee;
const mongoose_1 = __importDefault(require("mongoose"));
const AdvanceDeductionLog_1 = require("../models/AdvanceDeductionLog");
const SalaryRecord_1 = require("../models/SalaryRecord");
const enums_1 = require("../types/enums");
async function getDeductionHistoryForEmployee(employeeId) {
    const logs = await AdvanceDeductionLog_1.AdvanceDeductionLog.find({
        employeeId: new mongoose_1.default.Types.ObjectId(employeeId),
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
    const salaries = await SalaryRecord_1.SalaryRecord.find({
        employeeId: new mongoose_1.default.Types.ObjectId(employeeId),
        paidStatus: enums_1.SalaryPaidStatus.PAID,
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
async function getDeductionHistoryByEmployee(employeeIds) {
    const map = new Map();
    for (const id of employeeIds) {
        map.set(id, await getDeductionHistoryForEmployee(id));
    }
    return map;
}
function formatPeriod(month, year) {
    const name = new Date(year, month - 1).toLocaleString("en", { month: "long" });
    return `${name} ${year}`;
}
