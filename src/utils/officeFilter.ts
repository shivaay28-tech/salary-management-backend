import mongoose from "mongoose";
import { UserRole } from "../types/enums";
import { AuthRequest } from "../middleware/auth";

export function getOfficeIdFilter(req: AuthRequest): Record<string, unknown> {
  if (!req.user || req.user.role === UserRole.SUPER_ADMIN) {
    return {};
  }

  const officeIds = (req.user.assignedOfficeIds ?? []).filter(Boolean);
  if (officeIds.length === 0) {
    return { officeId: { $in: [] } };
  }

  return {
    officeId: {
      $in: officeIds.map((id) => new mongoose.Types.ObjectId(id)),
    },
  };
}

export function getOfficeIdsForQuery(req: AuthRequest): string[] | null {
  if (!req.user || req.user.role === UserRole.SUPER_ADMIN) return null;
  return (req.user.assignedOfficeIds ?? []).filter(Boolean);
}
