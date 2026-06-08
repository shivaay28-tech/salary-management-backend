"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAdvances = listAdvances;
exports.createAdvance = createAdvance;
exports.getAdvanceStatement = getAdvanceStatement;
exports.getAdvance = getAdvance;
const zod_1 = require("zod");
const Advance_1 = require("../models/Advance");
const Employee_1 = require("../models/Employee");
const enums_1 = require("../types/enums");
const rbac_1 = require("../middleware/rbac");
const errorHandler_1 = require("../middleware/errorHandler");
const auditService_1 = require("../services/auditService");
const officeFilter_1 = require("../utils/officeFilter");
const advanceDeductionHistoryService_1 = require("../services/advanceDeductionHistoryService");
const advanceSchema = zod_1.z
    .object({
    employeeId: zod_1.z.string(),
    advanceAmount: zod_1.z.coerce.number().positive(),
    date: zod_1.z.coerce.date(),
    reason: zod_1.z.string().min(1),
    notes: zod_1.z.string().optional(),
    recoveryMode: zod_1.z.nativeEnum(enums_1.AdvanceRecoveryMode),
    installmentAmount: zod_1.z.coerce.number().positive().optional(),
})
    .refine((data) => data.recoveryMode !== enums_1.AdvanceRecoveryMode.INSTALLMENT ||
    (data.installmentAmount !== undefined && data.installmentAmount > 0), { message: "Installment amount required for installment recovery" })
    .refine((data) => data.recoveryMode !== enums_1.AdvanceRecoveryMode.CUSTOM ||
    data.installmentAmount === undefined, { message: "Installment amount is not used for custom recovery" });
async function listAdvances(req, res) {
    const filter = { ...(0, officeFilter_1.getOfficeIdFilter)(req) };
    if (req.query.officeId) {
        const officeId = String(req.query.officeId);
        (0, rbac_1.assertOfficeAccess)(req, officeId);
        filter.officeId = officeId;
    }
    if (req.query.employeeId) {
        filter.employeeId = String(req.query.employeeId);
    }
    if (req.query.status === "active" || req.query.active === "true") {
        filter.isFullyRecovered = false;
    }
    else if (req.query.status === "recovered") {
        filter.isFullyRecovered = true;
    }
    const advances = await Advance_1.Advance.find(filter)
        .populate("employeeId", "fullName")
        .populate("officeId", "name")
        .sort({ date: -1 });
    res.json({ success: true, data: advances });
}
async function createAdvance(req, res) {
    const parsed = advanceSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new errorHandler_1.AppError(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const employee = await Employee_1.Employee.findById(parsed.data.employeeId);
    if (!employee) {
        throw new errorHandler_1.AppError("Employee not found", 404);
    }
    (0, rbac_1.assertOfficeAccess)(req, employee.officeId.toString());
    const advance = await Advance_1.Advance.create({
        employeeId: employee._id,
        officeId: employee.officeId,
        advanceAmount: parsed.data.advanceAmount,
        date: parsed.data.date,
        reason: parsed.data.reason,
        notes: parsed.data.notes,
        outstandingAmount: parsed.data.advanceAmount,
        recoveryMode: parsed.data.recoveryMode,
        installmentAmount: parsed.data.recoveryMode === enums_1.AdvanceRecoveryMode.INSTALLMENT
            ? parsed.data.installmentAmount
            : undefined,
        amountRecovered: 0,
        isFullyRecovered: false,
        createdBy: req.user.userId,
    });
    if (req.user) {
        await (0, auditService_1.logAudit)(req.user, "Advance Added", "advances", {
            advanceId: advance._id,
            amount: advance.advanceAmount,
        });
    }
    const result = await Advance_1.Advance.findById(advance._id)
        .populate("employeeId", "fullName")
        .populate("officeId", "name");
    res.status(201).json({ success: true, data: result });
}
async function getAdvanceStatement(req, res) {
    const filter = { ...(0, officeFilter_1.getOfficeIdFilter)(req) };
    if (req.query.officeId) {
        const officeId = String(req.query.officeId);
        (0, rbac_1.assertOfficeAccess)(req, officeId);
        filter.officeId = officeId;
    }
    if (req.query.employeeId) {
        filter.employeeId = String(req.query.employeeId);
    }
    if (req.query.status === "active") {
        filter.isFullyRecovered = false;
    }
    else if (req.query.status === "recovered") {
        filter.isFullyRecovered = true;
    }
    const advances = await Advance_1.Advance.find(filter)
        .populate("employeeId", "fullName mobileNumber")
        .populate("officeId", "name")
        .sort({ date: -1 });
    const byEmployeeMap = new Map();
    for (const a of advances) {
        const emp = a.employeeId;
        const off = a.officeId;
        const empId = emp?._id?.toString() ?? a.employeeId.toString();
        if (!byEmployeeMap.has(empId)) {
            byEmployeeMap.set(empId, {
                employeeId: empId,
                fullName: emp?.fullName ?? "Unknown",
                mobileNumber: emp?.mobileNumber ?? "",
                officeName: off?.name ?? "",
                totalTaken: 0,
                totalRecovered: 0,
                totalOutstanding: 0,
                advances: [],
                deductions: [],
            });
        }
        const row = byEmployeeMap.get(empId);
        row.totalTaken += a.advanceAmount;
        row.totalRecovered += a.amountRecovered;
        row.totalOutstanding += a.outstandingAmount;
        row.advances.push({
            id: a._id.toString(),
            date: a.date,
            advanceAmount: a.advanceAmount,
            amountRecovered: a.amountRecovered,
            outstandingAmount: a.outstandingAmount,
            recoveryMode: a.recoveryMode,
            installmentAmount: a.installmentAmount,
            reason: a.reason,
            notes: a.notes,
            status: a.isFullyRecovered ? "Recovered" : "Active",
            deductions: [],
        });
    }
    const byEmployee = Array.from(byEmployeeMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));
    const historyMap = await (0, advanceDeductionHistoryService_1.getDeductionHistoryByEmployee)(byEmployee.map((e) => e.employeeId));
    for (const emp of byEmployee) {
        const allDeductions = historyMap.get(emp.employeeId) ?? [];
        emp.deductions = allDeductions;
        for (const adv of emp.advances) {
            adv.deductions = allDeductions
                .filter((d) => d.advanceId === adv.id)
                .map((d) => ({
                id: d.id,
                amount: d.amount,
                deductedAt: d.deductedAt,
                periodLabel: d.periodLabel,
            }));
        }
    }
    const totals = byEmployee.reduce((acc, e) => ({
        totalTaken: acc.totalTaken + e.totalTaken,
        totalRecovered: acc.totalRecovered + e.totalRecovered,
        totalOutstanding: acc.totalOutstanding + e.totalOutstanding,
    }), { totalTaken: 0, totalRecovered: 0, totalOutstanding: 0 });
    res.json({
        success: true,
        data: {
            generatedAt: new Date().toISOString(),
            employeeCount: byEmployee.length,
            ...totals,
            byEmployee,
        },
    });
}
async function getAdvance(req, res) {
    const advance = await Advance_1.Advance.findById(String(req.params.id))
        .populate("employeeId", "fullName")
        .populate("officeId", "name");
    if (!advance) {
        throw new errorHandler_1.AppError("Advance not found", 404);
    }
    (0, rbac_1.assertOfficeAccess)(req, advance.officeId.toString());
    res.json({ success: true, data: advance });
}
