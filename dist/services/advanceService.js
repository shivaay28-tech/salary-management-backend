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
exports.computeAdvanceDeduction = computeAdvanceDeduction;
exports.applyAdvanceRecoveries = applyAdvanceRecoveries;
exports.getActiveAdvancesForEmployee = getActiveAdvancesForEmployee;
exports.getTotalOutstanding = getTotalOutstanding;
exports.allocateCustomAdvanceDeduction = allocateCustomAdvanceDeduction;
exports.validateAdvanceDeductionAmount = validateAdvanceDeductionAmount;
const mongoose_1 = __importDefault(require("mongoose"));
const Advance_1 = require("../models/Advance");
const enums_1 = require("../types/enums");
function computeAdvanceDeduction(advances, availableAmount) {
    const active = advances
        .filter((a) => !a.isFullyRecovered && a.outstandingAmount > 0)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    let remaining = Math.max(0, availableAmount);
    const allocations = [];
    let totalDeduction = 0;
    for (const advance of active) {
        if (remaining <= 0)
            break;
        let deduct = 0;
        if (advance.recoveryMode === enums_1.AdvanceRecoveryMode.FULL) {
            deduct = Math.min(advance.outstandingAmount, remaining);
        }
        else if (advance.recoveryMode === enums_1.AdvanceRecoveryMode.INSTALLMENT) {
            const installment = advance.installmentAmount ?? 0;
            deduct = Math.min(advance.outstandingAmount, installment, remaining);
        }
        else {
            // Custom: deducted manually when marking salary paid
            deduct = 0;
        }
        if (deduct > 0) {
            allocations.push({ advanceId: advance._id, amount: deduct });
            totalDeduction += deduct;
            remaining -= deduct;
        }
    }
    return { totalDeduction, allocations };
}
async function applyAdvanceRecoveries(allocations, logContext) {
    const { AdvanceDeductionLog } = await Promise.resolve().then(() => __importStar(require("../models/AdvanceDeductionLog")));
    for (const { advanceId, amount } of allocations) {
        const advance = await Advance_1.Advance.findById(advanceId);
        if (!advance)
            continue;
        advance.amountRecovered += amount;
        advance.outstandingAmount = Math.max(0, advance.outstandingAmount - amount);
        if (advance.outstandingAmount <= 0) {
            advance.outstandingAmount = 0;
            advance.isFullyRecovered = true;
        }
        await advance.save();
        if (logContext && amount > 0) {
            await AdvanceDeductionLog.create({
                employeeId: logContext.employeeId,
                advanceId: advance._id,
                salaryRecordId: logContext.salaryRecordId,
                officeId: logContext.officeId,
                amount,
                month: logContext.month,
                year: logContext.year,
                deductedAt: logContext.deductedAt,
            });
        }
    }
}
async function getActiveAdvancesForEmployee(employeeId) {
    return Advance_1.Advance.find({
        employeeId: new mongoose_1.default.Types.ObjectId(employeeId),
        isFullyRecovered: false,
        outstandingAmount: { $gt: 0 },
    }).sort({ date: 1 });
}
function getTotalOutstanding(advances) {
    return advances
        .filter((a) => !a.isFullyRecovered && a.outstandingAmount > 0)
        .reduce((sum, a) => sum + a.outstandingAmount, 0);
}
/** Distribute a fixed deduction across advances (oldest first). */
function allocateCustomAdvanceDeduction(advances, deductionAmount) {
    const active = advances
        .filter((a) => !a.isFullyRecovered && a.outstandingAmount > 0)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    let remaining = Math.max(0, deductionAmount);
    const allocations = [];
    let totalDeduction = 0;
    for (const advance of active) {
        if (remaining <= 0)
            break;
        const deduct = Math.min(advance.outstandingAmount, remaining);
        if (deduct > 0) {
            allocations.push({ advanceId: advance._id, amount: deduct });
            totalDeduction += deduct;
            remaining -= deduct;
        }
    }
    return { totalDeduction, allocations };
}
function validateAdvanceDeductionAmount(advances, grossBeforeAdvance, requestedAmount) {
    const outstanding = getTotalOutstanding(advances);
    const maxAllowed = Math.min(Math.max(0, grossBeforeAdvance), outstanding);
    if (requestedAmount < 0) {
        return { valid: false, message: "Advance deduction cannot be negative", maxAllowed };
    }
    if (requestedAmount > grossBeforeAdvance) {
        return {
            valid: false,
            message: `Cannot deduct more than gross salary (₹${grossBeforeAdvance})`,
            maxAllowed,
        };
    }
    if (requestedAmount > outstanding) {
        return {
            valid: false,
            message: `Cannot deduct more than outstanding advance (₹${outstanding})`,
            maxAllowed,
        };
    }
    return { valid: true, maxAllowed };
}
