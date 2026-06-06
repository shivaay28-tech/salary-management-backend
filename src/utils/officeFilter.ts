import { UserRole } from "../types/enums";
import { AuthRequest } from "../middleware/auth";

export function getOfficeIdFilter(req: AuthRequest): Record<string, unknown> {
  if (!req.user || req.user.role === UserRole.SUPER_ADMIN) {
    return {};
  }
  return { officeId: { $in: req.user.assignedOfficeIds } };
}

export function getOfficeIdsForQuery(req: AuthRequest): string[] | null {
  if (!req.user || req.user.role === UserRole.SUPER_ADMIN) return null;
  return req.user.assignedOfficeIds;
}
