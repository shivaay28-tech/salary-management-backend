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
exports.SalaryRecord = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const enums_1 = require("../types/enums");
const bankDetailsSchema = new mongoose_1.Schema({
    bankName: { type: String, required: true },
    accountHolderName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    ifscCode: { type: String, required: true },
    branch: { type: String, required: true },
}, { _id: false });
const angadiyaDetailsSchema = new mongoose_1.Schema({
    angadiyaName: { type: String, required: true },
    contactNumber: { type: String, required: true },
    notes: { type: String },
}, { _id: false });
const salaryRecordSchema = new mongoose_1.Schema({
    employeeId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Employee", required: true },
    officeId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Office", required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true, min: 2000 },
    baseSalary: { type: Number, required: true, min: 0 },
    bonus: { type: Number, default: 0, min: 0 },
    otherAddition: { type: Number, default: 0, min: 0 },
    otherDeduction: { type: Number, default: 0, min: 0 },
    advanceDeduction: { type: Number, default: 0, min: 0 },
    advanceDeductionManual: { type: Boolean, default: false },
    finalSalary: { type: Number, required: true, min: 0 },
    paidStatus: {
        type: String,
        enum: Object.values(enums_1.SalaryPaidStatus),
        default: enums_1.SalaryPaidStatus.PENDING,
    },
    paidDate: { type: Date },
    paymentMode: {
        type: String,
        enum: Object.values(enums_1.SalaryPaymentMode),
    },
    bankDetails: bankDetailsSchema,
    angadiyaDetails: angadiyaDetailsSchema,
    remarks: { type: String },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
salaryRecordSchema.index({ employeeId: 1, month: 1, year: 1 }, { unique: true });
exports.SalaryRecord = mongoose_1.default.model("SalaryRecord", salaryRecordSchema);
