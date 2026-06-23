import mongoose, { Document, Schema } from "mongoose";
import { UserRole } from "../types/enums";
import { ALL_PERMISSIONS, Permission } from "../types/permissions";

export interface IUser extends Document {
  name: string;
  username: string;
  email?: string;
  password: string;
  role: UserRole;
  assignedOfficeIds: mongoose.Types.ObjectId[];
  permissions: Permission[];
  isActive: boolean;
  refreshToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: Object.values(UserRole),
      required: true,
    },
    assignedOfficeIds: [
      { type: Schema.Types.ObjectId, ref: "Office", default: [] },
    ],
    permissions: {
      type: [String],
      enum: ALL_PERMISSIONS,
      default: ALL_PERMISSIONS,
    },
    isActive: { type: Boolean, default: true },
    refreshToken: { type: String, select: false },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>("User", userSchema);
