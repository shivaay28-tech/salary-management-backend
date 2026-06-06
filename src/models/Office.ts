import mongoose, { Document, Schema } from "mongoose";
import { OfficeStatus } from "../types/enums";

export interface IOffice extends Document {
  name: string;
  contactNumber: string;
  status: OfficeStatus;
  createdAt: Date;
  updatedAt: Date;
}

const officeSchema = new Schema<IOffice>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    contactNumber: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: Object.values(OfficeStatus),
      default: OfficeStatus.ACTIVE,
    },
  },
  { timestamps: true }
);

export const Office = mongoose.model<IOffice>("Office", officeSchema);
