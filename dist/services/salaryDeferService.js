"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUnsettledDeferredRecords = getUnsettledDeferredRecords;
exports.clearCarryForwardLinks = clearCarryForwardLinks;
exports.applyDeferredCarryForward = applyDeferredCarryForward;
exports.deferSalaryRecord = deferSalaryRecord;
exports.skipSalaryRecord = skipSalaryRecord;
exports.buildDeferredSalaryStatement = buildDeferredSalaryStatement;
exports.buildSkippedSalaryStatement = buildSkippedSalaryStatement;
exports.settleDeferredOnPayment = settleDeferredOnPayment;
const jamaLabels_1 = require("../constants/jamaLabels");
const SalaryRecord_1 = require("../models/SalaryRecord");
const enums_1 = require("../types/enums");
const salary_1 = require("../utils/salary");
const salaryRecalcService_1 = require("./salaryRecalcService");
function isBeforePeriod(month, year, beforeMonth, beforeYear) {
    return year < beforeYear || (year === beforeYear && month < beforeMonth);
}
async function getUnsettledDeferredRecords(employeeId, beforeMonth, beforeYear) {
    const records = await SalaryRecord_1.SalaryRecord.find({
        employeeId,
        paidStatus: enums_1.SalaryPaidStatus.DEFERRED,
        carriedToSalaryId: { $exists: false },
    });
    return records.filter((r) => isBeforePeriod(r.month, r.year, beforeMonth, beforeYear));
}
async function clearCarryForwardLinks(recordId) {
    await SalaryRecord_1.SalaryRecord.updateMany({ carriedToSalaryId: recordId }, { $unset: { carriedToSalaryId: 1 } });
}
async function applyDeferredCarryForward(record) {
    if (record.paidStatus !== enums_1.SalaryPaidStatus.PENDING) {
        return record;
    }
    await clearCarryForwardLinks(record._id);
    const deferredRecords = await getUnsettledDeferredRecords(String(record.employeeId), record.month, record.year);
    const carryForward = deferredRecords.reduce((sum, r) => sum + r.finalSalary, 0);
    record.deferredCarryForward = carryForward;
    record.settledDeferredIds = deferredRecords.map((r) => r._id);
    for (const deferred of deferredRecords) {
        deferred.carriedToSalaryId = record._id;
        await deferred.save();
    }
    if (!record.advanceDeductionManual) {
        return (0, salaryRecalcService_1.recalculateSalaryAdvances)(record);
    }
    record.finalSalary = (0, salary_1.calculateFinalSalary)({
        monthlySalary: record.baseSalary,
        bonus: record.bonus,
        otherAddition: record.otherAddition + carryForward,
        otherDeduction: record.otherDeduction,
        advanceDeduction: record.advanceDeduction,
    });
    await record.save();
    return record;
}
async function deferSalaryRecord(record, remarks, deferredUntilMonth, deferredUntilYear) {
    if (record.paidStatus !== enums_1.SalaryPaidStatus.PENDING) {
        throw new Error(jamaLabels_1.JAMA_UI.onlyPending);
    }
    record.paidStatus = enums_1.SalaryPaidStatus.DEFERRED;
    if (remarks !== undefined)
        record.remarks = remarks;
    if (deferredUntilMonth)
        record.deferredUntilMonth = deferredUntilMonth;
    if (deferredUntilYear)
        record.deferredUntilYear = deferredUntilYear;
    await record.save();
    return record;
}
async function skipSalaryRecord(record, remarks) {
    if (record.paidStatus !== enums_1.SalaryPaidStatus.PENDING) {
        throw new Error("Only pending salaries can be skipped");
    }
    if (!remarks.trim()) {
        throw new Error("Reason is required when skipping salary");
    }
    if (record.settledDeferredIds?.length) {
        await SalaryRecord_1.SalaryRecord.updateMany({ _id: { $in: record.settledDeferredIds } }, { $unset: { carriedToSalaryId: 1 } });
    }
    record.paidStatus = enums_1.SalaryPaidStatus.SKIPPED;
    record.finalSalary = 0;
    record.advanceDeduction = 0;
    record.deferredCarryForward = 0;
    record.settledDeferredIds = [];
    record.remarks = remarks.trim();
    await record.save();
    return record;
}
function salaryPeriodLabel(month, year) {
    return new Date(year, month - 1).toLocaleString("en", {
        month: "long",
        year: "numeric",
    });
}
function employeeIdFromRecord(record) {
    const emp = record.employeeId;
    if (emp && typeof emp === "object" && "_id" in emp && emp._id) {
        return emp._id.toString();
    }
    return String(record.employeeId);
}
function employeeNameFromRecord(record) {
    const emp = record.employeeId;
    if (emp && typeof emp === "object" && "fullName" in emp) {
        return emp.fullName ?? "Unknown";
    }
    return "Unknown";
}
function employeeMobileFromRecord(record) {
    const emp = record.employeeId;
    if (emp && typeof emp === "object" && "mobileNumber" in emp) {
        return emp.mobileNumber ?? "";
    }
    return "";
}
function officeNameFromRecord(record) {
    const off = record.officeId;
    if (off && typeof off === "object" && "name" in off) {
        return off.name ?? "";
    }
    return "";
}
function carriedToLabel(record) {
    const carried = record.carriedToSalaryId;
    if (!carried || typeof carried !== "object" || !("month" in carried))
        return undefined;
    if (!carried.month || !carried.year)
        return undefined;
    return salaryPeriodLabel(carried.month, carried.year);
}
function settledInLabel(record) {
    const settled = record.settledWithSalaryId;
    if (!settled || typeof settled !== "object" || !("month" in settled))
        return undefined;
    if (!settled.month || !settled.year)
        return undefined;
    return salaryPeriodLabel(settled.month, settled.year);
}
function buildScopeLabel(options, status) {
    if (status === "active") {
        return jamaLabels_1.JAMA_UI.allOutstanding;
    }
    if (options.month && options.year) {
        return salaryPeriodLabel(options.month, options.year);
    }
    if (options.year) {
        return String(options.year);
    }
    return "All time";
}
async function buildDeferredSalaryStatement(officeFilter, options = {}) {
    const officeScopedFilter = { ...officeFilter };
    if (options.officeId)
        officeScopedFilter.officeId = options.officeId;
    if (options.employeeId)
        officeScopedFilter.employeeId = options.employeeId;
    const settledPeriodFilter = { ...officeScopedFilter };
    if (options.year)
        settledPeriodFilter.year = options.year;
    if (options.month)
        settledPeriodFilter.month = options.month;
    const status = options.status ?? "active";
    const recordQueries = [];
    // Outstanding deferred: always show full liability (office scope only).
    if (status === "active" || status === "all") {
        recordQueries.push(SalaryRecord_1.SalaryRecord.find({
            ...officeScopedFilter,
            paidStatus: enums_1.SalaryPaidStatus.DEFERRED,
        })
            .populate("employeeId", "fullName mobileNumber")
            .populate("officeId", "name")
            .populate("carriedToSalaryId", "month year paidStatus")
            .sort({ year: -1, month: -1 })
            .lean());
    }
    // Settled via later month: optional year / month filter on original deferred period.
    if (status === "settled" || status === "all") {
        recordQueries.push(SalaryRecord_1.SalaryRecord.find({
            ...settledPeriodFilter,
            paidStatus: enums_1.SalaryPaidStatus.PAID,
            settledWithSalaryId: { $exists: true },
        })
            .populate("employeeId", "fullName mobileNumber")
            .populate("officeId", "name")
            .populate("settledWithSalaryId", "month year paidDate")
            .sort({ year: -1, month: -1 })
            .lean());
    }
    const recordGroups = await Promise.all(recordQueries);
    const records = recordGroups.flat();
    const pendingCarryRecords = status === "active" || status === "all"
        ? (await SalaryRecord_1.SalaryRecord.find({
            ...officeScopedFilter,
            paidStatus: enums_1.SalaryPaidStatus.PENDING,
            deferredCarryForward: { $gt: 0 },
        })
            .populate("employeeId", "fullName mobileNumber")
            .populate("officeId", "name")
            .sort({ year: -1, month: -1 })
            .lean())
        : [];
    const byEmployeeMap = new Map();
    const ensureEmployee = (record) => {
        const empId = employeeIdFromRecord(record);
        if (!byEmployeeMap.has(empId)) {
            byEmployeeMap.set(empId, {
                employeeId: empId,
                fullName: employeeNameFromRecord(record),
                mobileNumber: employeeMobileFromRecord(record),
                officeName: officeNameFromRecord(record),
                totalOutstanding: 0,
                totalSettled: 0,
                entries: [],
            });
        }
        return byEmployeeMap.get(empId);
    };
    for (const record of records) {
        const emp = ensureEmployee(record);
        const carriedTo = carriedToLabel(record);
        const settledIn = settledInLabel(record);
        const isSettled = record.paidStatus === enums_1.SalaryPaidStatus.PAID;
        const entry = {
            id: String(record._id),
            month: record.month,
            year: record.year,
            periodLabel: salaryPeriodLabel(record.month, record.year),
            amount: record.finalSalary,
            remarks: record.remarks,
            lineStatus: isSettled
                ? "settled"
                : carriedTo
                    ? "carried_forward"
                    : "open",
            carriedToPeriod: carriedTo,
            settledInPeriod: settledIn,
            settledOn: record.paidDate
                ? new Date(record.paidDate).toISOString().split("T")[0]
                : undefined,
            deferredAt: record.updatedAt
                ? new Date(record.updatedAt).toISOString().split("T")[0]
                : undefined,
        };
        emp.entries.push(entry);
        if (isSettled) {
            emp.totalSettled += record.finalSalary;
        }
        else {
            emp.totalOutstanding += record.finalSalary;
        }
    }
    let totalPendingCarry = 0;
    for (const pending of pendingCarryRecords) {
        const emp = ensureEmployee(pending);
        const carry = pending.deferredCarryForward ?? 0;
        totalPendingCarry += carry;
        emp.pendingCarryPeriod = salaryPeriodLabel(pending.month, pending.year);
        emp.pendingCarryAmount = carry;
        emp.pendingNetSalary = pending.finalSalary;
    }
    const byEmployee = Array.from(byEmployeeMap.values())
        .map((emp) => ({
        ...emp,
        entries: emp.entries.sort((a, b) => b.year - a.year || b.month - a.month),
    }))
        .filter((emp) => emp.entries.length > 0 || emp.pendingCarryAmount)
        .sort((a, b) => a.fullName.localeCompare(b.fullName));
    const totals = byEmployee.reduce((acc, emp) => ({
        totalOutstanding: acc.totalOutstanding + emp.totalOutstanding,
        totalSettled: acc.totalSettled + emp.totalSettled,
    }), { totalOutstanding: 0, totalSettled: 0 });
    return {
        generatedAt: new Date().toISOString(),
        scope: buildScopeLabel(options, status),
        employeeCount: byEmployee.length,
        totalOutstanding: totals.totalOutstanding,
        totalSettled: totals.totalSettled,
        totalPendingCarry,
        byEmployee,
    };
}
async function buildSkippedSalaryStatement(officeFilter, options = {}) {
    const filter = {
        ...officeFilter,
        paidStatus: enums_1.SalaryPaidStatus.SKIPPED,
    };
    if (options.officeId)
        filter.officeId = options.officeId;
    if (options.employeeId)
        filter.employeeId = options.employeeId;
    if (options.year)
        filter.year = options.year;
    if (options.month)
        filter.month = options.month;
    const records = (await SalaryRecord_1.SalaryRecord.find(filter)
        .populate("employeeId", "fullName mobileNumber")
        .populate("officeId", "name")
        .sort({ year: -1, month: -1 })
        .lean());
    const byEmployeeMap = new Map();
    for (const record of records) {
        const empId = employeeIdFromRecord(record);
        if (!byEmployeeMap.has(empId)) {
            byEmployeeMap.set(empId, {
                employeeId: empId,
                fullName: employeeNameFromRecord(record),
                mobileNumber: employeeMobileFromRecord(record),
                officeName: officeNameFromRecord(record),
                skippedCount: 0,
                totalWaived: 0,
                entries: [],
            });
        }
        const emp = byEmployeeMap.get(empId);
        const waivedAmount = record.baseSalary;
        emp.skippedCount += 1;
        emp.totalWaived += waivedAmount;
        emp.entries.push({
            id: String(record._id),
            month: record.month,
            year: record.year,
            periodLabel: salaryPeriodLabel(record.month, record.year),
            waivedAmount,
            remarks: record.remarks,
            skippedAt: record.updatedAt
                ? new Date(record.updatedAt).toISOString().split("T")[0]
                : undefined,
        });
    }
    const byEmployee = Array.from(byEmployeeMap.values())
        .map((emp) => ({
        ...emp,
        entries: emp.entries.sort((a, b) => b.year - a.year || b.month - a.month),
    }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName));
    const totalWaived = byEmployee.reduce((s, e) => s + e.totalWaived, 0);
    const totalSkipped = byEmployee.reduce((s, e) => s + e.skippedCount, 0);
    const scope = options.month && options.year
        ? salaryPeriodLabel(options.month, options.year)
        : options.year
            ? String(options.year)
            : "All time";
    return {
        generatedAt: new Date().toISOString(),
        scope,
        employeeCount: byEmployee.length,
        totalSkipped,
        totalWaived,
        byEmployee,
    };
}
async function settleDeferredOnPayment(record, paidDate) {
    if (!record.settledDeferredIds?.length)
        return;
    await SalaryRecord_1.SalaryRecord.updateMany({
        _id: { $in: record.settledDeferredIds },
        paidStatus: enums_1.SalaryPaidStatus.DEFERRED,
    }, {
        $set: {
            paidStatus: enums_1.SalaryPaidStatus.PAID,
            paidDate,
            settledWithSalaryId: record._id,
            paymentMode: record.paymentMode,
        },
    });
}
