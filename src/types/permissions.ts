export enum Permission {
  DASHBOARD = "dashboard",
  OFFICES = "offices",
  EMPLOYEES = "employees",
  SALARIES = "salaries",
  ADVANCES = "advances",
  REPORTS = "reports",
  USERS = "users",
  AUDIT_LOGS = "audit_logs",
}

export const ALL_PERMISSIONS = Object.values(Permission);

export const PERMISSION_LABELS: Record<Permission, string> = {
  [Permission.DASHBOARD]: "Dashboard",
  [Permission.OFFICES]: "Offices",
  [Permission.EMPLOYEES]: "Employees",
  [Permission.SALARIES]: "Salaries",
  [Permission.ADVANCES]: "Advances",
  [Permission.REPORTS]: "Reports & Export",
  [Permission.USERS]: "Sub Admins",
  [Permission.AUDIT_LOGS]: "Audit Logs",
};

export function resolvePermissions(
  permissions?: Permission[] | null
): Permission[] {
  if (permissions && permissions.length > 0) return permissions;
  return ALL_PERMISSIONS;
}
