import mongoose, { Document, Schema } from "mongoose";
import { EmployeeStatus, SalaryPaymentMode } from "../types/enums";

export interface IBankDetails {
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  branch: string;
}

export interface IAngadiyaDetails {
  name: string;
  number: string;
  angadiyaNumber: string;
  amount: number;
  city: string;
}

export interface IEmployee extends Document {
  fullName: string;
  mobileNumber: string;
  photoUrl?: string;
  dateOfJoining: Date;
  officeId: mongoose.Types.ObjectId;
  status: EmployeeStatus;
  outDate?: Date;
  monthlySalary: number;
  paymentMode?: SalaryPaymentMode;
  bankDetails?: IBankDetails;
  angadiyaDetails?: IAngadiyaDetails;
  createdAt: Date;
  updatedAt: Date;
}

const bankDetailsSchema = new Schema<IBankDetails>(
  {
    bankName: { type: String, required: true },
    accountHolderName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    ifscCode: { type: String, required: true },
    branch: { type: String, required: true },
  },
  { _id: false }
);

const angadiyaDetailsSchema = new Schema<IAngadiyaDetails>(
  {
    name: { type: String, required: true },
    number: { type: String, required: true },
    angadiyaNumber: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    city: { type: String, required: true },
  },
  { _id: false }
);

const employeeSchema = new Schema<IEmployee>(
  {
    fullName: { type: String, required: true, trim: true },
    mobileNumber: { type: String, required: true, trim: true },
    photoUrl: { type: String },
    dateOfJoining: { type: Date, required: true },
    officeId: { type: Schema.Types.ObjectId, ref: "Office", required: true },
    status: {
      type: String,
      enum: Object.values(EmployeeStatus),
      default: EmployeeStatus.ACTIVE,
    },
    outDate: { type: Date },
    monthlySalary: { type: Number, required: true, min: 0 },
    paymentMode: {
      type: String,
      enum: Object.values(SalaryPaymentMode),
    },
    bankDetails: bankDetailsSchema,
    angadiyaDetails: angadiyaDetailsSchema,
  },
  { timestamps: true }
);

employeeSchema.index({ officeId: 1, status: 1 });

export const Employee = mongoose.model<IEmployee>("Employee", employeeSchema);
