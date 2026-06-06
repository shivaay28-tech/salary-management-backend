import mongoose, { Document, Schema } from "mongoose";
import { AdvanceRecoveryMode } from "../types/enums";

export interface IAdvance extends Document {
  employeeId: mongoose.Types.ObjectId;
  officeId: mongoose.Types.ObjectId;
  advanceAmount: number;
  date: Date;
  reason: string;
  notes?: string;
  outstandingAmount: number;
  recoveryMode: AdvanceRecoveryMode;
  installmentAmount?: number;
  amountRecovered: number;
  isFullyRecovered: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const advanceSchema = new Schema<IAdvance>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    officeId: { type: Schema.Types.ObjectId, ref: "Office", required: true },
    advanceAmount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true },
    reason: { type: String, required: true },
    notes: { type: String },
    outstandingAmount: { type: Number, required: true, min: 0 },
    recoveryMode: {
      type: String,
      enum: Object.values(AdvanceRecoveryMode),
      required: true,
    },
    installmentAmount: { type: Number, min: 0 },
    amountRecovered: { type: Number, default: 0, min: 0 },
    isFullyRecovered: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

advanceSchema.index({ employeeId: 1, isFullyRecovered: 1 });

export const Advance = mongoose.model<IAdvance>("Advance", advanceSchema);
