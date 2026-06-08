import mongoose, { Document, Schema } from "mongoose";
import { SalaryPaidStatus, SalaryPaymentMode } from "../types/enums";

export interface ISalaryBankDetails {
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  branch: string;
}

export interface ISalaryAngadiyaDetails {
  name: string;
  number: string;
  angadiyaNumber: string;
  amount: number;
  city: string;
}

const bankDetailsSchema = new Schema<ISalaryBankDetails>(
  {
    bankName: { type: String, required: true },
    accountHolderName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    ifscCode: { type: String, required: true },
    branch: { type: String, required: true },
  },
  { _id: false }
);

const angadiyaDetailsSchema = new Schema<ISalaryAngadiyaDetails>(
  {
    name: { type: String, required: true },
    number: { type: String, required: true },
    angadiyaNumber: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    city: { type: String, required: true },
  },
  { _id: false }
);

export interface ISalaryRecord extends Document {
  employeeId: mongoose.Types.ObjectId;
  officeId: mongoose.Types.ObjectId;
  month: number;
  year: number;
  baseSalary: number;
  bonus: number;
  otherAddition: number;
  otherDeduction: number;
  advanceDeduction: number;
  advanceDeductionManual: boolean;
  finalSalary: number;
  paidStatus: SalaryPaidStatus;
  paidDate?: Date;
  paymentMode?: SalaryPaymentMode;
  bankDetails?: ISalaryBankDetails;
  angadiyaDetails?: ISalaryAngadiyaDetails;
  remarks?: string;
  deferredCarryForward?: number;
  settledDeferredIds?: mongoose.Types.ObjectId[];
  carriedToSalaryId?: mongoose.Types.ObjectId;
  settledWithSalaryId?: mongoose.Types.ObjectId;
  deferredUntilMonth?: number;
  deferredUntilYear?: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const salaryRecordSchema = new Schema<ISalaryRecord>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    officeId: { type: Schema.Types.ObjectId, ref: "Office", required: true },
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
      enum: Object.values(SalaryPaidStatus),
      default: SalaryPaidStatus.PENDING,
    },
    paidDate: { type: Date },
    paymentMode: {
      type: String,
      enum: Object.values(SalaryPaymentMode),
    },
    bankDetails: bankDetailsSchema,
    angadiyaDetails: angadiyaDetailsSchema,
    remarks: { type: String },
    deferredCarryForward: { type: Number, default: 0, min: 0 },
    settledDeferredIds: [{ type: Schema.Types.ObjectId, ref: "SalaryRecord" }],
    carriedToSalaryId: { type: Schema.Types.ObjectId, ref: "SalaryRecord" },
    settledWithSalaryId: { type: Schema.Types.ObjectId, ref: "SalaryRecord" },
    deferredUntilMonth: { type: Number, min: 1, max: 12 },
    deferredUntilYear: { type: Number, min: 2000 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

salaryRecordSchema.index(
  { employeeId: 1, month: 1, year: 1 },
  { unique: true }
);

export const SalaryRecord = mongoose.model<ISalaryRecord>(
  "SalaryRecord",
  salaryRecordSchema
);
