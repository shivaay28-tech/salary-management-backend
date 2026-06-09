import { SalaryPaidStatus } from "../types/enums";

export const JAMA_LABEL = "Jama";

export const SALARY_STATUS_LABELS: Record<SalaryPaidStatus, string> = {
  [SalaryPaidStatus.PENDING]: "Pending",
  [SalaryPaidStatus.PAID]: "Paid",
  [SalaryPaidStatus.DEFERRED]: JAMA_LABEL,
  [SalaryPaidStatus.SKIPPED]: "Skipped",
};

export const JAMA_UI = {
  allOutstanding: "All outstanding jama",
  statementTitle: "Jama Salary Statement",
  outstanding: "Outstanding Jama",
  inPending: "Jama In Pending",
  linesSheet: "Jama Lines",
  period: "Jama Period",
  auditAction: "Salary Jama",
  deferFailed: "Jama failed",
  onlyPending: "Only pending salaries can be marked as jama",
  exportFilename: "jama-salary-statement",
} as const;