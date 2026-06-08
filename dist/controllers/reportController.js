"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.monthlySalaryReport = monthlySalaryReport;
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
const periodSchema = zod_1.z.object({
    month: zod_1.z.coerce.number().min(1).max(12),
    year: zod_1.z.coerce.number().min(2000),
    officeId: zod_1.z.string().optional(),
});
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
    if (parsed.data.officeId) {
        (0, rbac_1.assertOfficeAccess)(req, parsed.data.officeId);
        filter.officeId = parsed.data.officeId;
    }
    const records = await SalaryRecord_1.SalaryRecord.find(filter).populate("employeeId", "fullName");
    const totalSalary = records.reduce((s, r) => s + r.finalSalary, 0);
    const totalPaid = records
        .filter((r) => r.paidStatus === enums_1.SalaryPaidStatus.PAID)
        .reduce((s, r) => s + r.finalSalary, 0);
    const totalPending = totalSalary - totalPaid;
    const totalAdvances = records.reduce((s, r) => s + r.advanceDeduction, 0);
    res.json({
        success: true,
        data: {
            month: parsed.data.month,
            year: parsed.data.year,
            totalEmployees: records.length,
            totalSalary,
            totalAdvances,
            totalPaid,
            totalPending,
            records,
        },
    });
}
async function employeeSalaryHistory(req, res) {
    const employeeId = String(req.query.employeeId ?? "");
    if (!employeeId) {
        throw new errorHandler_1.AppError("employeeId required");
    }
    const employee = await Employee_1.Employee.findById(employeeId);
    if (!employee) {
        throw new errorHandler_1.AppError("Employee not found", 404);
    }
    (0, rbac_1.assertOfficeAccess)(req, employee.officeId.toString());
    const records = await SalaryRecord_1.SalaryRecord.find({ employeeId })
        .sort({ year: -1, month: -1 })
        .select("month year finalSalary advanceDeduction paidDate paidStatus baseSalary bonus");
    res.json({
        success: true,
        data: {
            employee: {
                id: employee._id,
                fullName: employee.fullName,
            },
            history: records.map((r) => ({
                month: r.month,
                year: r.year,
                salary: r.finalSalary,
                advanceDeduction: r.advanceDeduction,
                netSalary: r.finalSalary,
                paidDate: r.paidDate,
                paidStatus: r.paidStatus,
            })),
        },
    });
}
async function advanceReport(req, res) {
    const filter = { ...(0, officeFilter_1.getOfficeIdFilter)(req) };
    if (req.query.officeId) {
        const officeId = String(req.query.officeId);
        (0, rbac_1.assertOfficeAccess)(req, officeId);
        filter.officeId = officeId;
    }
    const advances = await Advance_1.Advance.find(filter)
        .populate("employeeId", "fullName")
        .populate("officeId", "name")
        .sort({ date: -1 });
    const report = advances.map((a) => {
        const emp = a.employeeId;
        return {
            employee: emp && typeof emp === "object" && "fullName" in emp
                ? { fullName: emp.fullName }
                : null,
            advanceTaken: a.advanceAmount,
            amountRecovered: a.amountRecovered,
            outstandingBalance: a.outstandingAmount,
            recoveryMode: a.recoveryMode,
            date: a.date,
        };
    });
    res.json({ success: true, data: report });
}
