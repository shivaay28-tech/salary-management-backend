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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSalaries = listSalaries;
exports.getSalaryAdvanceInfo = getSalaryAdvanceInfo;
exports.generateSalaries = generateSalaries;
exports.updateSalary = updateSalary;
exports.markSalaryPaid = markSalaryPaid;
exports.markAllSalariesPaid = markAllSalariesPaid;
exports.getDeferredStatement = getDeferredStatement;
exports.getSkippedStatement = getSkippedStatement;
exports.deferSalary = deferSalary;
exports.skipSalary = skipSalary;
exports.getSalary = getSalary;
const mongoose_1 = __importDefault(require("mongoose"));
const zod_1 = require("zod");
const SalaryRecord_1 = require("../models/SalaryRecord");
const Advance_1 = require("../models/Advance");
const enums_1 = require("../types/enums");
const rbac_1 = require("../middleware/rbac");
const errorHandler_1 = require("../middleware/errorHandler");
const auditService_1 = require("../services/auditService");
const salaryService_1 = require("../services/salaryService");
const officeFilter_1 = require("../utils/officeFilter");
const salaryAdvanceService_1 = require("../services/salaryAdvanceService");
const jamaLabels_1 = require("../constants/jamaLabels");
const salaryDeferService_1 = require("../services/salaryDeferService");
const updateSalarySchema = zod_1.z.object({
    bonus: zod_1.z.coerce.number().min(0).optional(),
    otherAddition: zod_1.z.coerce.number().min(0).optional(),
    otherDeduction: zod_1.z.coerce.number().min(0).optional(),
    advanceDeduction: zod_1.z.coerce.number().min(0).optional(),
    remarks: zod_1.z.string().optional(),
});
const payBankSchema = zod_1.z.object({
    bankName: zod_1.z.string().min(1),
    accountHolderName: zod_1.z.string().min(1),
    accountNumber: zod_1.z.string().min(1),
    ifscCode: zod_1.z.string().min(1),
    branch: zod_1.z.string().min(1),
});
const payAngadiyaSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    number: zod_1.z.string().min(10),
    angadiyaNumber: zod_1.z.string().min(1),
    amount: zod_1.z.coerce.number().min(0),
    city: zod_1.z.string().min(1),
});
const paySalarySchema = zod_1.z
    .object({
    advanceDeduction: zod_1.z.coerce.number().min(0).optional(),
    paymentMode: zod_1.z.nativeEnum(enums_1.SalaryPaymentMode),
    bankDetails: payBankSchema.optional(),
    angadiyaDetails: payAngadiyaSchema.optional(),
})
    .superRefine((data, ctx) => {
    if (data.paymentMode === enums_1.SalaryPaymentMode.BANK && !data.bankDetails) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "Bank details required for bank payment",
            path: ["bankDetails"],
        });
    }
    if (data.paymentMode === enums_1.SalaryPaymentMode.ANGADIYA && !data.angadiyaDetails) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "Angadiya details required for angadiya payment",
            path: ["angadiyaDetails"],
        });
    }
});
const generateSchema = zod_1.z.object({
    month: zod_1.z.coerce.number().min(1).max(12),
    year: zod_1.z.coerce.number().min(2000),
    officeId: zod_1.z.string().optional(),
    bonus: zod_1.z.coerce.number().min(0).optional(),
    otherAddition: zod_1.z.coerce.number().min(0).optional(),
    otherDeduction: zod_1.z.coerce.number().min(0).optional(),
});
const deferSalarySchema = zod_1.z.object({
    remarks: zod_1.z.string().optional(),
    deferredUntilMonth: zod_1.z.coerce.number().min(1).max(12).optional(),
    deferredUntilYear: zod_1.z.coerce.number().min(2000).optional(),
});
const skipSalarySchema = zod_1.z.object({
    remarks: zod_1.z.string().min(1, "Reason is required"),
});
const payAllSchema = zod_1.z.object({
    month: zod_1.z.coerce.number().min(1).max(12),
    year: zod_1.z.coerce.number().min(2000),
    officeId: zod_1.z.string().optional(),
    paymentMode: zod_1.z.nativeEnum(enums_1.SalaryPaymentMode),
});
async function listSalaries(req, res) {
    const filter = { ...(0, officeFilter_1.getOfficeIdFilter)(req) };
    if (req.query.month)
        filter.month = Number(req.query.month);
    if (req.query.year)
        filter.year = Number(req.query.year);
    if (req.query.officeId) {
        const officeId = String(req.query.officeId);
        (0, rbac_1.assertOfficeAccess)(req, officeId);
        filter.officeId = officeId;
    }
    if (req.query.paidStatus)
        filter.paidStatus = String(req.query.paidStatus);
    if (req.query.employeeId)
        filter.employeeId = String(req.query.employeeId);
    const salaries = await SalaryRecord_1.SalaryRecord.find(filter)
        .populate("employeeId", "fullName monthlySalary dateOfJoining outDate")
        .populate("officeId", "name")
        .sort({ year: -1, month: -1 });
    const employeeIds = [
        ...new Set(salaries
            .map((s) => {
            const emp = s.employeeId;
            if (!emp)
                return null;
            if (typeof emp === "object" && "_id" in emp && emp._id) {
                return emp._id.toString();
            }
            return emp.toString();
        })
            .filter((id) => Boolean(id))),
    ];
    const outstandingRows = employeeIds.length > 0
        ? await Advance_1.Advance.aggregate([
            {
                $match: {
                    employeeId: {
                        $in: employeeIds.map((id) => new mongoose_1.default.Types.ObjectId(id)),
                    },
                    isFullyRecovered: false,
                    outstandingAmount: { $gt: 0 },
                },
            },
            {
                $group: {
                    _id: "$employeeId",
                    outstandingAdvance: { $sum: "$outstandingAmount" },
                },
            },
        ])
        : [];
    const outstandingMap = new Map(outstandingRows.map((row) => [row._id.toString(), row.outstandingAdvance]));
    const data = salaries.map((s) => {
        const emp = s.employeeId;
        let empId = null;
        if (emp) {
            if (typeof emp === "object" && "_id" in emp && emp._id) {
                empId = emp._id.toString();
            }
            else {
                empId = emp.toString();
            }
        }
        const json = s.toObject();
        return {
            ...json,
            employeeId: emp ?? json.employeeId,
            outstandingAdvance: empId ? (outstandingMap.get(empId) ?? 0) : 0,
        };
    });
    res.json({ success: true, data });
}
async function getSalaryAdvanceInfo(req, res) {
    const record = await SalaryRecord_1.SalaryRecord.findById(String(req.params.id));
    if (!record) {
        throw new errorHandler_1.AppError("Salary record not found", 404);
    }
    (0, rbac_1.assertOfficeAccess)(req, record.officeId.toString());
    const summary = await (0, salaryAdvanceService_1.getSalaryAdvanceSummary)(String(record.employeeId), record);
    res.json({
        success: true,
        data: {
            ...summary,
            currentDeduction: record.advanceDeduction,
            isManual: record.advanceDeductionManual,
            finalSalary: record.finalSalary,
        },
    });
}
async function generateSalaries(req, res) {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new errorHandler_1.AppError(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    if (parsed.data.officeId) {
        (0, rbac_1.assertOfficeAccess)(req, parsed.data.officeId);
    }
    const officeIds = (0, officeFilter_1.getOfficeIdsForQuery)(req) ?? undefined;
    const result = await (0, salaryService_1.generateMonthlySalaries)({
        month: parsed.data.month,
        year: parsed.data.year,
        officeId: parsed.data.officeId,
        officeIds: parsed.data.officeId ? undefined : officeIds,
        bonus: parsed.data.bonus,
        otherAddition: parsed.data.otherAddition,
        otherDeduction: parsed.data.otherDeduction,
        createdBy: req.user,
    });
    if (req.user) {
        await (0, auditService_1.logAudit)(req.user, "Salaries Generated", "salaries", {
            month: parsed.data.month,
            year: parsed.data.year,
            ...result,
        });
    }
    res.status(201).json({ success: true, data: result });
}
async function updateSalary(req, res) {
    const parsed = updateSalarySchema.safeParse(req.body);
    if (!parsed.success) {
        throw new errorHandler_1.AppError("Invalid input");
    }
    const record = await SalaryRecord_1.SalaryRecord.findById(String(req.params.id));
    if (!record) {
        throw new errorHandler_1.AppError("Salary record not found", 404);
    }
    (0, rbac_1.assertOfficeAccess)(req, record.officeId.toString());
    if (record.paidStatus === enums_1.SalaryPaidStatus.PAID ||
        record.paidStatus === enums_1.SalaryPaidStatus.DEFERRED ||
        record.paidStatus === enums_1.SalaryPaidStatus.SKIPPED) {
        throw new errorHandler_1.AppError("Cannot edit this salary record", 400);
    }
    if (parsed.data.bonus !== undefined)
        record.bonus = parsed.data.bonus;
    if (parsed.data.otherAddition !== undefined) {
        record.otherAddition = parsed.data.otherAddition;
    }
    if (parsed.data.otherDeduction !== undefined) {
        record.otherDeduction = parsed.data.otherDeduction;
    }
    if (parsed.data.remarks !== undefined)
        record.remarks = parsed.data.remarks;
    try {
        if (parsed.data.advanceDeduction !== undefined) {
            await (0, salaryAdvanceService_1.applyAdvanceDeductionToSalary)(record, parsed.data.advanceDeduction, true);
        }
        else if (!record.advanceDeductionManual) {
            const { recalculateSalaryAdvances } = await Promise.resolve().then(() => __importStar(require("../services/salaryRecalcService")));
            await recalculateSalaryAdvances(record);
        }
        else {
            await (0, salaryAdvanceService_1.applyAdvanceDeductionToSalary)(record, record.advanceDeduction, true);
        }
    }
    catch (err) {
        throw new errorHandler_1.AppError(err instanceof Error ? err.message : "Invalid deduction", 400);
    }
    await record.save();
    if (req.user) {
        await (0, auditService_1.logAudit)(req.user, "Salary Updated", "salaries", {
            salaryId: record._id,
            advanceDeduction: record.advanceDeduction,
        });
    }
    const result = await SalaryRecord_1.SalaryRecord.findById(record._id)
        .populate("employeeId", "fullName")
        .populate("officeId", "name");
    res.json({ success: true, data: result });
}
async function markSalaryPaid(req, res) {
    const parsed = paySalarySchema.safeParse(req.body);
    if (!parsed.success) {
        throw new errorHandler_1.AppError("Invalid input");
    }
    const record = await SalaryRecord_1.SalaryRecord.findById(String(req.params.id));
    if (!record) {
        throw new errorHandler_1.AppError("Salary record not found", 404);
    }
    (0, rbac_1.assertOfficeAccess)(req, record.officeId.toString());
    try {
        await (0, salaryAdvanceService_1.paySalaryRecord)(record, parsed.data.advanceDeduction, {
            paymentMode: parsed.data.paymentMode,
            bankDetails: parsed.data.bankDetails,
            angadiyaDetails: parsed.data.angadiyaDetails,
        });
    }
    catch (err) {
        throw new errorHandler_1.AppError(err instanceof Error ? err.message : "Payment failed", 400);
    }
    if (req.user) {
        await (0, auditService_1.logAudit)(req.user, "Salary Paid", "salaries", {
            salaryId: record._id,
            advanceDeduction: record.advanceDeduction,
            paymentMode: parsed.data.paymentMode,
        });
    }
    const result = await SalaryRecord_1.SalaryRecord.findById(record._id)
        .populate("employeeId", "fullName")
        .populate("officeId", "name");
    res.json({ success: true, data: result });
}
async function markAllSalariesPaid(req, res) {
    const parsed = payAllSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new errorHandler_1.AppError(parsed.error.issues[0]?.message ?? "Month and year required");
    }
    if (parsed.data.officeId) {
        (0, rbac_1.assertOfficeAccess)(req, parsed.data.officeId);
    }
    const filter = {
        month: parsed.data.month,
        year: parsed.data.year,
        paidStatus: enums_1.SalaryPaidStatus.PENDING,
        ...(0, officeFilter_1.getOfficeIdFilter)(req),
    };
    if (parsed.data.officeId) {
        filter.officeId = parsed.data.officeId;
    }
    const pending = await SalaryRecord_1.SalaryRecord.find(filter).sort({ createdAt: 1 });
    if (pending.length === 0) {
        res.json({
            success: true,
            data: { paid: 0, failed: [], message: "No pending salaries to pay" },
        });
        return;
    }
    let paid = 0;
    const failed = [];
    for (const record of pending) {
        try {
            await (0, salaryAdvanceService_1.paySalaryRecord)(record, undefined, {
                paymentMode: parsed.data.paymentMode,
            });
            paid++;
        }
        catch (err) {
            failed.push({
                id: record._id.toString(),
                employeeId: record.employeeId.toString(),
                error: err instanceof Error ? err.message : "Payment failed",
            });
        }
    }
    if (req.user) {
        await (0, auditService_1.logAudit)(req.user, "Bulk Salaries Paid", "salaries", {
            month: parsed.data.month,
            year: parsed.data.year,
            paid,
            failed: failed.length,
        });
    }
    res.json({
        success: true,
        data: {
            paid,
            failed,
            total: pending.length,
        },
    });
}
async function getDeferredStatement(req, res) {
    if (req.query.officeId) {
        (0, rbac_1.assertOfficeAccess)(req, String(req.query.officeId));
    }
    const status = req.query.status === "settled" || req.query.status === "all"
        ? req.query.status
        : "active";
    const data = await (0, salaryDeferService_1.buildDeferredSalaryStatement)((0, officeFilter_1.getOfficeIdFilter)(req), {
        officeId: req.query.officeId ? String(req.query.officeId) : undefined,
        employeeId: req.query.employeeId ? String(req.query.employeeId) : undefined,
        status,
        month: req.query.month ? Number(req.query.month) : undefined,
        year: req.query.year ? Number(req.query.year) : undefined,
    });
    res.json({ success: true, data });
}
async function getSkippedStatement(req, res) {
    if (req.query.officeId) {
        (0, rbac_1.assertOfficeAccess)(req, String(req.query.officeId));
    }
    const data = await (0, salaryDeferService_1.buildSkippedSalaryStatement)((0, officeFilter_1.getOfficeIdFilter)(req), {
        officeId: req.query.officeId ? String(req.query.officeId) : undefined,
        employeeId: req.query.employeeId ? String(req.query.employeeId) : undefined,
        year: req.query.year ? Number(req.query.year) : undefined,
        month: req.query.month ? Number(req.query.month) : undefined,
    });
    res.json({ success: true, data });
}
async function deferSalary(req, res) {
    const parsed = deferSalarySchema.safeParse(req.body);
    if (!parsed.success) {
        throw new errorHandler_1.AppError("Invalid input");
    }
    const record = await SalaryRecord_1.SalaryRecord.findById(String(req.params.id));
    if (!record) {
        throw new errorHandler_1.AppError("Salary record not found", 404);
    }
    (0, rbac_1.assertOfficeAccess)(req, record.officeId.toString());
    try {
        await (0, salaryDeferService_1.deferSalaryRecord)(record, parsed.data.remarks, parsed.data.deferredUntilMonth, parsed.data.deferredUntilYear);
    }
    catch (err) {
        throw new errorHandler_1.AppError(err instanceof Error ? err.message : jamaLabels_1.JAMA_UI.deferFailed, 400);
    }
    if (req.user) {
        await (0, auditService_1.logAudit)(req.user, jamaLabels_1.JAMA_UI.auditAction, "salaries", {
            salaryId: record._id,
            month: record.month,
            year: record.year,
            amount: record.finalSalary,
        });
    }
    const result = await SalaryRecord_1.SalaryRecord.findById(record._id)
        .populate("employeeId", "fullName")
        .populate("officeId", "name");
    res.json({ success: true, data: result });
}
async function skipSalary(req, res) {
    const parsed = skipSalarySchema.safeParse(req.body);
    if (!parsed.success) {
        throw new errorHandler_1.AppError(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const record = await SalaryRecord_1.SalaryRecord.findById(String(req.params.id));
    if (!record) {
        throw new errorHandler_1.AppError("Salary record not found", 404);
    }
    (0, rbac_1.assertOfficeAccess)(req, record.officeId.toString());
    try {
        await (0, salaryDeferService_1.skipSalaryRecord)(record, parsed.data.remarks);
    }
    catch (err) {
        throw new errorHandler_1.AppError(err instanceof Error ? err.message : "Skip failed", 400);
    }
    if (req.user) {
        await (0, auditService_1.logAudit)(req.user, "Salary Skipped (Waived)", "salaries", {
            salaryId: record._id,
            month: record.month,
            year: record.year,
            remarks: parsed.data.remarks,
        });
    }
    const result = await SalaryRecord_1.SalaryRecord.findById(record._id)
        .populate("employeeId", "fullName")
        .populate("officeId", "name");
    res.json({ success: true, data: result });
}
async function getSalary(req, res) {
    const record = await SalaryRecord_1.SalaryRecord.findById(String(req.params.id))
        .populate("employeeId", "fullName bankDetails angadiyaDetails")
        .populate("officeId", "name");
    if (!record) {
        throw new errorHandler_1.AppError("Salary record not found", 404);
    }
    (0, rbac_1.assertOfficeAccess)(req, record.officeId.toString());
    res.json({ success: true, data: record });
}
