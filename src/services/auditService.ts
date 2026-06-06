import { AuditLog } from "../models/AuditLog";
import { TokenPayload } from "../utils/jwt";

export async function logAudit(
  user: TokenPayload,
  action: string,
  module: string,
  details?: Record<string, unknown>
): Promise<void> {
  await AuditLog.create({
    userId: user.userId,
    userEmail: user.email,
    action,
    module,
    details,
  });
}
