export enum Permission {
  DASHBOARD = "dashboard",
  EMPLOYEES = "employees",
  SALARIES = "salaries",
  ADVANCES = "advances",
  REPORTS = "reports",
}

export const ALL_PERMISSIONS = Object.values(Permission);

export const PERMISSION_LABELS: Record<Permission, string> = {
  [Permission.DASHBOARD]: "Dashboard",
  [Permission.EMPLOYEES]: "Employees",
  [Permission.SALARIES]: "Salaries",
  [Permission.ADVANCES]: "Advances",
  [Permission.REPORTS]: "Reports & Export",
};

export function resolvePermissions(
  permissions?: Permission[] | null
): Permission[] {
  if (permissions && permissions.length > 0) return permissions;
  return ALL_PERMISSIONS;
}
