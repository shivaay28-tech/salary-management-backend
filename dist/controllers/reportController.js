"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.monthlySalaryReport = monthlySalaryReport;
exports.employeePeriodReport = employeePeriodReport;
exports.employeeSalaryHistory = employeeSalaryHistory;
exports.advanceReport = advanceReport;
const zod_1 = require("zod");
const SalaryRecord_1 = require("../models/SalaryRecord");
const Advance_1 = require("../models/Advance");
const Employee_1 = require("../models/Employee");
const enums_1 = require("../types/enums");
const rbac_1 = require("../middleware/rbac");
const errorHandler_1 = require("../middleware/errorHandler");
const officeFilter_1 = require("../utils/officeFilter");
const dateRange_1 = require("../utils/dateRange");
const periodSchema = zod_1.z.object({
    month: zod_1.z.coerce.number().min(1).max(12),
    year: zod_1.z.coerce.number().min(2000),
    officeId: zod_1.z.string().optional(),
    dateFrom: zod_1.z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    dateTo: zod_1.z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
});
function applyOfficeFilter(req, filter, officeId) {
    if (officeId) {
        (0, rbac_1.assertOfficeAccess)(req, officeId);
        filter.officeId = officeId;
    }
}
function applyAdvanceDateRange(filter, parsed) {
    const { start, end } = (0, dateRange_1.resolveReportPeriod)(parsed);
    filter.date = { $gte: start, $lte: end };
}
function filterSalariesByPaidDate(records, parsed) {
    if (!(0, dateRange_1.hasCustomDateFilter)(parsed))
        return records;
    const { start, end } = (0, dateRange_1.resolveReportPeriod)(parsed);
    return records.filter((r) => r.paidStatus === enums_1.SalaryPaidStatus.PENDING ||
        r.paidStatus === enums_1.SalaryPaidStatus.DEFERRED ||
        r.paidStatus === enums_1.SalaryPaidStatus.SKIPPED ||
        (r.paidDate && r.paidDate >= start && r.paidDate <= end));
}
function periodMeta(parsed) {
    const { start, end } = (0, dateRange_1.resolveReportPeriod)(parsed);
    return {
        month: parsed.month,
        year: parsed.year,
        dateFrom: parsed.dateFrom ?? start.toISOString().split("T")[0],
        dateTo: parsed.dateTo ?? end.toISOString().split("T")[0],
    };
}
function salaryPeriodOverlapsRange(month, year, start, end) {
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);
    return periodStart <= end && periodEnd >= start;
}
function filterHistoryByScope(records, parsed) {
    if ((0, dateRange_1.hasCustomDateFilter)(parsed)) {
        const { start, end } = (0, dateRange_1.resolveReportPeriod)({
            month: parsed.month ?? 1,
            year: parsed.year ?? new Date().getFullYear(),
            dateFrom: parsed.dateFrom,
            dateTo: parsed.dateTo,
        });
        return records.filter((r) => salaryPeriodOverlapsRange(r.month, r.year, start, end));
    }
    if (parsed.month && parsed.year) {
        return records.filter((r) => r.month === parsed.month && r.year === parsed.year);
    }
    if (parsed.year) {
        return records.filter((r) => r.year === parsed.year);
    }
    return records;
}
async function monthlySalaryReport(req, res) {
    const parsed = periodSchema.safeParse(req.query);
    if (!parsed.success) {
        throw new errorHandler_1.AppError("Month and year required");
    }
    const filter = {
        month: parsed.data.month,
        year: parsed.data.year,
        ...(0, officeFilter_1.getOfficeIdFilter)(req),
    };
    applyOfficeFilter(req, filter, parsed.data.officeId);
    const allRecords = await SalaryRecord_1.SalaryRecord.find(filter)
        .populate("employeeId", "fullName mobileNumber")
        .populate("officeId", "name")
        .sort({ finalSalary: -1 });
    const records = filterSalariesByPaidDate(allRecords, parsed.data);
    const totalSalary = records.reduce((s, r) => s + r.finalSalary, 0);
    const paidRecords = records.filter((r) => r.paidStatus === enums_1.SalaryPaidStatus.PAID);
    const pendingRecords = records.filter((r) => r.paidStatus === enums_1.SalaryPaidStatus.PENDING);
    const deferredRecords = records.filter((r) => r.paidStatus === enums_1.SalaryPaidStatus.DEFERRED);
    const skippedRecords = records.filter((r) => r.paidStatus === enums_1.SalaryPaidStatus.SKIPPED);
    const totalPaid = paidRecords.reduce((s, r) => s + r.finalSalary, 0);
    const totalPending = pendingRecords.reduce((s, r) => s + r.finalSalary, 0);
    const totalDeferred = deferredRecords.reduce((s, r) => s + r.finalSalary, 0);
    const totalAdvances = records.reduce((s, r) => s + r.advanceDeduction, 0);
    const paymentModes = [
        enums_1.SalaryPaymentMode.BANK,
        enums_1.SalaryPaymentMode.ANGADIYA,
        enums_1.SalaryPaymentMode.CASH_IN_HAND,
    ];
    const paymentBreakdown = paymentModes.map((mode) => {
        const modeRecords = paidRecords.filter((r) => r.paymentMode === mode);
        return {
            mode,
            count: modeRecords.length,
            amount: modeRecords.reduce((s, r) => s + r.finalSalary, 0),
        };
    });
    res.json({
        success: true,
        data: {
            ...periodMeta(parsed.data),
            totalEmployees: records.length,
            paidCount: paidRecords.length,
            pendingCount: pendingRecords.length,
            deferredCount: deferredRecords.length,
            skippedCount: skippedRecords.length,
            totalSalary,
            totalAdvances,
            totalPaid,
            totalPending,
            totalDeferred,
            paymentBreakdown,
            records: records.map((r) => {
                const emp = r.employeeId;
                const off = r.officeId;
                return {
                    _id: r._id,
                    employeeName: emp?.fullName ?? "",
                    employeeMobile: emp?.mobileNumber ?? "",
                    officeName: off?.name ?? "",
                    baseSalary: r.baseSalary,
                    fullMonthlySalary: r.fullMonthlySalary,
                    payableDays: r.payableDays,
                    daysInMonth: r.daysInMonth,
                    bonus: r.bonus,
                    otherAddition: r.otherAddition,
                    otherDeduction: r.otherDeduction,
                    advanceDeduction: r.advanceDeduction,
                    deferredCarryForward: r.deferredCarryForward ?? 0,
                    finalSalary: r.finalSalary,
                    paidStatus: r.paidStatus,
                    remarks: r.remarks,
                    paymentMode: r.paymentMode,
                    paidDate: r.paidDate,
                };
            }),
        },
    });
}
async function employeePeriodReport(req, res) {
    const parsed = periodSchema.safeParse(req.query);
    if (!parsed.success) {
        throw new errorHandler_1.AppError("Month and year required");
    }
    const { start, end } = (0, dateRange_1.resolveReportPeriod)(parsed.data);
    const empFilter = { ...(0, officeFilter_1.getOfficeIdFilter)(req) };
    applyOfficeFilter(req, empFilter, parsed.data.officeId);
    if ((0, dateRange_1.hasCustomDateFilter)(parsed.data)) {
        empFilter.dateOfJoining = { $lte: end };
    }
    const employees = await Employee_1.Employee.find(empFilter)
        .populate("officeId", "name")
        .sort({ fullName: 1 });
    const salaryFilter = {
        month: parsed.data.month,
        year: parsed.data.year,
        ...(0, officeFilter_1.getOfficeIdFilter)(req),
    };
    applyOfficeFilter(req, salaryFilter, parsed.data.officeId);
    const salaries = filterSalariesByPaidDate(await SalaryRecord_1.SalaryRecord.find(salaryFilter), parsed.data);
    const salaryByEmployee = new Map(salaries.map((s) => [s.employeeId.toString(), s]));
    const rows = employees.map((e) => {
        const off = e.officeId;
        const salary = salaryByEmployee.get(e._id.toString());
        return {
            _id: e._id,
            fullName: e.fullName,
            mobileNumber: e.mobileNumber,
            officeName: off?.name ?? "",
            monthlySalary: e.monthlySalary,
            status: e.status,
            dateOfJoining: e.dateOfJoining,
            hasSalaryRecord: !!salary,
            netSalary: salary?.finalSalary,
            paidStatus: salary?.paidStatus,
            paymentMode: salary?.paymentMode,
            advanceDeduction: salary?.advanceDeduction,
            paidDate: salary?.paidDate,
        };
    });
    res.json({
        success: true,
        data: {
            ...periodMeta(parsed.data),
            totalEmployees: rows.length,
            withSalaryCount: rows.filter((r) => r.hasSalaryRecord).length,
            rows,
        },
    });
}
async function employeeSalaryHistory(req, res) {
    const historySchema = zod_1.z.object({
        employeeId: zod_1.z.string().min(1),
        month: zod_1.z.coerce.number().min(1).max(12).optional(),
        year: zod_1.z.coerce.number().min(2000).optional(),
        dateFrom: zod_1.z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
        dateTo: zod_1.z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
    });
    const parsed = historySchema.safeParse(req.query);
    if (!parsed.success) {
        throw new errorHandler_1.AppError("Employee id required");
    }
    const employee = await Employee_1.Employee.findById(parsed.data.employeeId).populate("officeId", "name");
    if (!employee) {
        throw new errorHandler_1.AppError("Employee not found", 404);
    }
    (0, rbac_1.assertOfficeAccess)(req, employee.officeId.toString());
    const allRecords = await SalaryRecord_1.SalaryRecord.find({
        employeeId: parsed.data.employeeId,
    })
        .sort({ year: -1, month: -1 })
        .select("month year baseSalary bonus otherAddition otherDeduction advanceDeduction deferredCarryForward finalSalary paidDate paidStatus paymentMode remarks settledWithSalaryId");
    const records = filterHistoryByScope(allRecords, parsed.data);
    const paidRecords = records.filter((r) => r.paidStatus === enums_1.SalaryPaidStatus.PAID);
    const pendingRecords = records.filter((r) => r.paidStatus === enums_1.SalaryPaidStatus.PENDING);
    const deferredRecords = records.filter((r) => r.paidStatus === enums_1.SalaryPaidStatus.DEFERRED);
    const skippedRecords = records.filter((r) => r.paidStatus === enums_1.SalaryPaidStatus.SKIPPED);
    const totalPaid = paidRecords.reduce((s, r) => s + r.finalSalary, 0);
    const totalPending = pendingRecords.reduce((s, r) => s + r.finalSalary, 0);
    const totalDeferred = deferredRecords.reduce((s, r) => s + r.finalSalary, 0);
    const totalAdvanceDed = records.reduce((s, r) => s + r.advanceDeduction, 0);
    const scopeLabel = (0, dateRange_1.hasCustomDateFilter)(parsed.data)
        ? `${parsed.data.dateFrom} – ${parsed.data.dateTo ?? parsed.data.dateFrom}`
        : parsed.data.month && parsed.data.year
            ? new Date(parsed.data.year, parsed.data.month - 1).toLocaleString("en", {
                month: "long",
                year: "numeric",
            })
            : parsed.data.year
                ? String(parsed.data.year)
                : "All time";
    const off = employee.officeId;
    res.json({
        success: true,
        data: {
            scope: scopeLabel,
            year: parsed.data.year,
            employee: {
                id: employee._id,
                fullName: employee.fullName,
                mobileNumber: employee.mobileNumber,
                monthlySalary: employee.monthlySalary,
                officeName: off?.name ?? "",
            },
            summary: {
                totalRecords: records.length,
                paidCount: paidRecords.length,
                pendingCount: pendingRecords.length,
                deferredCount: deferredRecords.length,
                skippedCount: skippedRecords.length,
                totalPaid,
                totalPending,
                totalDeferred,
                totalAdvanceDed,
            },
            history: records.map((r) => ({
                month: r.month,
                year: r.year,
                baseSalary: r.baseSalary,
                bonus: r.bonus,
                otherAddition: r.otherAddition,
                otherDeduction: r.otherDeduction,
                advanceDeduction: r.advanceDeduction,
                deferredCarryForward: r.deferredCarryForward ?? 0,
                netSalary: r.finalSalary,
                paidDate: r.paidDate,
                paidStatus: r.paidStatus,
                paymentMode: r.paymentMode,
                remarks: r.remarks,
                settledViaLaterMonth: Boolean(r.settledWithSalaryId),
            })),
        },
    });
}
async function advanceReport(req, res) {
    const parsed = periodSchema.safeParse(req.query);
    if (!parsed.success) {
        throw new errorHandler_1.AppError("Month and year required");
    }
    const filter = { ...(0, officeFilter_1.getOfficeIdFilter)(req) };
    applyOfficeFilter(req, filter, parsed.data.officeId);
    applyAdvanceDateRange(filter, parsed.data);
    const advances = await Advance_1.Advance.find(filter)
        .populate("employeeId", "fullName")
        .populate("officeId", "name")
        .sort({ date: -1 });
    const report = advances.map((a) => {
        const emp = a.employeeId;
        const off = a.officeId;
        return {
            employee: emp && typeof emp === "object" && "fullName" in emp
                ? { fullName: emp.fullName }
                : null,
            officeName: off?.name ?? "",
            advanceTaken: a.advanceAmount,
            amountRecovered: a.amountRecovered,
            outstandingBalance: a.outstandingAmount,
            recoveryMode: a.recoveryMode,
            isFullyRecovered: a.isFullyRecovered,
            date: a.date,
            reason: a.reason,
        };
    });
    const summary = {
        totalAdvances: advances.length,
        totalTaken: advances.reduce((s, a) => s + a.advanceAmount, 0),
        totalRecovered: advances.reduce((s, a) => s + a.amountRecovered, 0),
        totalOutstanding: advances.reduce((s, a) => s + a.outstandingAmount, 0),
        activeCount: advances.filter((a) => !a.isFullyRecovered).length,
    };
    res.json({
        success: true,
        data: {
            ...periodMeta(parsed.data),
            summary,
            rows: report,
        },
    });
}
