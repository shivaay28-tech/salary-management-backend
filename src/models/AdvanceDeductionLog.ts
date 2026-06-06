import mongoose, { Document, Schema } from "mongoose";

export interface IAdvanceDeductionLog extends Document {
  employeeId: mongoose.Types.ObjectId;
  advanceId: mongoose.Types.ObjectId;
  salaryRecordId: mongoose.Types.ObjectId;
  officeId: mongoose.Types.ObjectId;
  amount: number;
  month: number;
  year: number;
  deductedAt: Date;
  createdAt: Date;
}

const advanceDeductionLogSchema = new Schema<IAdvanceDeductionLog>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    advanceId: { type: Schema.Types.ObjectId, ref: "Advance", required: true },
    salaryRecordId: {
      type: Schema.Types.ObjectId,
      ref: "SalaryRecord",
      required: true,
    },
    officeId: { type: Schema.Types.ObjectId, ref: "Office", required: true },
    amount: { type: Number, required: true, min: 0 },
    month: { type: Number, required: true },
    year: { type: Number, required: true },
    deductedAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

advanceDeductionLogSchema.index({ employeeId: 1, deductedAt: -1 });
advanceDeductionLogSchema.index({ advanceId: 1, deductedAt: -1 });

export const AdvanceDeductionLog = mongoose.model<IAdvanceDeductionLog>(
  "AdvanceDeductionLog",
  advanceDeductionLogSchema
);
