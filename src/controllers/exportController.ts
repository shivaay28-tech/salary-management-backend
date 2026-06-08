import { Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { SalaryRecord } from "../models/SalaryRecord";
import { Employee } from "../models/Employee";
import { Advance } from "../models/Advance";
import { AuthRequest } from "../middleware/auth";
import { assertOfficeAccess } from "../middleware/rbac";
import { AppError } from "../middleware/errorHandler";
import { getOfficeIdFilter } from "../utils/officeFilter";
import { sendExcel, sendExcelMultiSheet, sendPdf } from "../services/exportService";
import { getDeductionHistoryByEmployee } from "../services/advanceDeductionHistoryService";
import { hasCustomDateFilter, resolveReportPeriod } from "../utils/dateRange";
import { SalaryPaidStatus } from "../types/enums";
import {
  buildDeferredSalaryStatement,
  buildSkippedSalaryStatement,
} from "../services/salaryDeferService";
import type { IEmployee } from "../models/Employee";

function filterExportSalariesByDate<
  T extends { paidStatus: string; paidDate?: Date | null },
>(
  records: T[],
  month?: number,
  year?: number,
  dateFrom?: string,
  dateTo?: string
): T[] {
  if (!month || !year || !hasCustomDateFilter({ dateFrom, dateTo })) {
    return records;
  }
  const { start, end } = resolveReportPeriod({ month, year, dateFrom, dateTo });
  return records.filter(
    (r) =>
      r.paidStatus === SalaryPaidStatus.PENDING ||
      r.paidStatus === SalaryPaidStatus.DEFERRED ||
      r.paidStatus === SalaryPaidStatus.SKIPPED ||
      (r.paidDate && r.paidDate >= start && r.paidDate <= end)
  );
}

function applyExportAdvanceDateFilter(
  filter: Record<string, unknown>,
  month?: number,
  year?: number,
  dateFrom?: string,
  dateTo?: string
) {
  if (!month || !year) return;
  const { start, end } = resolveReportPeriod({ month, year, dateFrom, dateTo });
  filter.date = { $gte: start, $lte: end };
}

const EMPLOYEE_EXPORT_HEADERS = [
  "Full Name",
  "Mobile",
  "Office",
  "Monthly Salary",
  "Status",
  "Date of Joining",
  "Out Date",
];

function employeeToRow(employee: IEmployee): (string | number)[] {
  const off = employee.officeId as { name?: string } | null;
  return [
    employee.fullName,
    employee.mobileNumber,
    off?.name ?? "",
    employee.monthlySalary,
    employee.status,
    employee.dateOfJoining.toISOString().split("T")[0],
    employee.outDate ? employee.outDate.toISOString().split("T")[0] : "",
  ];
}

const exportQuerySchema = z.object({
  format: z.enum(["excel", "pdf"]),
  month: z.coerce.number().optional(),
  year: z.coerce.number().optional(),
  officeId: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function exportSalaryReport(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const parsed = exportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("Invalid export parameters");
  }

  const filter: Record<string, unknown> = { ...getOfficeIdFilter(req) };
  if (parsed.data.month) filter.month = parsed.data.month;
  if (parsed.data.year) filter.year = parsed.data.year;
  if (parsed.data.officeId) {
    assertOfficeAccess(req, parsed.data.officeId);
    filter.officeId = parsed.data.officeId;
  }

  const allRecords = await SalaryRecord.find(filter)
    .populate("employeeId", "fullName mobileNumber")
    .populate("officeId", "name")
    .sort({ year: -1, month: -1 });

  const records = filterExportSalariesByDate(
    allRecords,
    parsed.data.month,
    parsed.data.year,
    parsed.data.dateFrom,
    parsed.data.dateTo
  );

  records.sort((a, b) => {
    const nameA = (a.employeeId as { fullName?: string } | null)?.fullName ?? "";
    const nameB = (b.employeeId as { fullName?: string } | null)?.fullName ?? "";
    return nameA.localeCompare(nameB);
  });

  const employeeIds = [
    ...new Set(records.map((s) => s.employeeId._id?.toString() ?? s.employeeId.toString())),
  ];

  const outstandingRows =
    employeeIds.length > 0
      ? await Advance.aggregate([
          {
            $match: {
              employeeId: {
                $in: employeeIds.map((id) => new mongoose.Types.ObjectId(id)),
              },
              isFullyRecovered: false,
              outstandingAmount: { $gt: 0 },
            },
          },
          {
            $group: {
              _id: "$employeeId",
              outstandingAdvance: { $sum: "$outstandingAmount" },
            },
          },
        ])
      : [];

  const outstandingMap = new Map(
    outstandingRows.map((row) => [row._id.toString(), row.outstandingAdvance as number])
  );

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  const paymentModeLabel = (mode?: string) =>
    mode === "bank"
      ? "Bank"
      : mode === "angadiya"
        ? "Angadiya"
        : mode === "cash_in_hand"
          ? "Cash in Hand"
          : "";

  type SalaryRecordRow = (typeof records)[0];

  const empInfo = (r: SalaryRecordRow) => {
    const emp = r.employeeId as { fullName?: string; mobileNumber?: string } | null;
    const off = r.officeId as { name?: string } | null;
    return {
      name: emp?.fullName ?? "",
      mobile: emp?.mobileNumber ?? "",
      office: off?.name ?? "",
      month: monthNames[r.month - 1] ?? r.month,
      year: r.year,
      paidDate: r.paidDate ? r.paidDate.toISOString().split("T")[0] : "",
    };
  };

  const angadiyaHeaders = [
    "Employee",
    "Mobile",
    "Office",
    "Month",
    "Year",
    "Name",
    "Number",
    "Angadiya Number",
    "Amount",
    "City",
    "Paid Date",
  ];

  const bankHeaders = [
    "Employee",
    "Mobile",
    "Office",
    "Month",
    "Year",
    "Net Salary",
    "Bank Name",
    "Account Holder",
    "Account Number",
    "IFSC Code",
    "Branch",
    "Paid Date",
  ];

  const cashHeaders = [
    "Employee",
    "Mobile",
    "Office",
    "Month",
    "Year",
    "Net Salary",
    "Paid Date",
  ];

  const allHeaders = [
    "Employee",
    "Mobile",
    "Office",
    "Month",
    "Year",
    "Base Salary",
    "Bonus",
    "Other Addition",
    "Other Deduction",
    "Outstanding Advance",
    "Advance Deduction",
    "Net Salary",
    "Status",
    "Payment Mode",
    "Paid Date",
    "Remarks",
  ];

  const toAngadiyaRow = (r: SalaryRecordRow) => {
    const e = empInfo(r);
    return [
      e.name,
      e.mobile,
      e.office,
      e.month,
      e.year,
      r.angadiyaDetails?.name ?? "",
      r.angadiyaDetails?.number ?? e.mobile,
      r.angadiyaDetails?.angadiyaNumber ?? "",
      r.angadiyaDetails?.amount ?? r.finalSalary,
      r.angadiyaDetails?.city ?? "",
      e.paidDate,
    ];
  };

  const toBankRow = (r: SalaryRecordRow) => {
    const e = empInfo(r);
    return [
      e.name,
      e.mobile,
      e.office,
      e.month,
      e.year,
      r.finalSalary,
      r.bankDetails?.bankName ?? "",
      r.bankDetails?.accountHolderName ?? "",
      r.bankDetails?.accountNumber ?? "",
      r.bankDetails?.ifscCode ?? "",
      r.bankDetails?.branch ?? "",
      e.paidDate,
    ];
  };

  const toCashRow = (r: SalaryRecordRow) => {
    const e = empInfo(r);
    return [e.name, e.mobile, e.office, e.month, e.year, r.finalSalary, e.paidDate];
  };

  const toAllRow = (r: SalaryRecordRow) => {
    const e = empInfo(r);
    const empId = r.employeeId._id?.toString() ?? r.employeeId.toString();
    return [
      e.name,
      e.mobile,
      e.office,
      e.month,
      e.year,
      r.baseSalary,
      r.bonus,
      r.otherAddition,
      r.otherDeduction,
      outstandingMap.get(empId) ?? 0,
      r.advanceDeduction,
      r.finalSalary,
      r.paidStatus,
      paymentModeLabel(r.paymentMode),
      e.paidDate,
      r.remarks ?? "",
    ];
  };

  const paidRecords = records.filter((r) => r.paidStatus === "paid");
  const angadiyaRows = paidRecords
    .filter((r) => r.paymentMode === "angadiya")
    .map(toAngadiyaRow);
  const bankRows = paidRecords
    .filter((r) => r.paymentMode === "bank")
    .map(toBankRow);
  const cashRows = paidRecords
    .filter((r) => r.paymentMode === "cash_in_hand")
    .map(toCashRow);
  const allRows = records.map(toAllRow);

  const filename = `salaries-${parsed.data.month ?? "all"}-${parsed.data.year ?? "all"}`;

  if (parsed.data.format === "excel") {
    await sendExcelMultiSheet(res, `${filename}.xlsx`, [
      { name: "Angadiya", headers: angadiyaHeaders, rows: angadiyaRows },
      { name: "Bank", headers: bankHeaders, rows: bankRows },
      { name: "Cash in Hand", headers: cashHeaders, rows: cashRows },
      { name: "All Salaries", headers: allHeaders, rows: allRows },
    ]);
  } else {
    sendPdf(res, `${filename}.pdf`, "Monthly Salary Report", allHeaders, allRows);
  }
}

export async function exportEmployeeList(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const parsed = exportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("Invalid export parameters");
  }

  const filter: Record<string, unknown> = { ...getOfficeIdFilter(req) };
  if (parsed.data.officeId) {
    assertOfficeAccess(req, parsed.data.officeId);
    filter.officeId = parsed.data.officeId;
  }
  if (parsed.data.status) {
    filter.status = parsed.data.status;
  }

  const employees = await Employee.find(filter)
    .populate("officeId", "name contactNumber")
    .sort({ fullName: 1 });

  const allRows = employees.map((e) => employeeToRow(e));

  const salaryFilter: Record<string, unknown> = {
    ...getOfficeIdFilter(req),
    paidStatus: "paid",
  };
  if (parsed.data.officeId) salaryFilter.officeId = parsed.data.officeId;

  const paidSalaries = await SalaryRecord.find(salaryFilter)
    .populate("employeeId", "fullName mobileNumber")
    .populate("officeId", "name")
    .sort({ year: -1, month: -1 });

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  type PaidSalaryRow = (typeof paidSalaries)[0];

  const paidEmpInfo = (r: PaidSalaryRow) => {
    const emp = r.employeeId as { fullName?: string; mobileNumber?: string } | null;
    const off = r.officeId as { name?: string } | null;
    return {
      name: emp?.fullName ?? "",
      mobile: emp?.mobileNumber ?? "",
      office: off?.name ?? "",
      month: monthNames[r.month - 1] ?? r.month,
      year: r.year,
      paidDate: r.paidDate ? r.paidDate.toISOString().split("T")[0] : "",
    };
  };

  const empAngadiyaHeaders = [
    "Employee",
    "Mobile",
    "Office",
    "Month",
    "Year",
    "Name",
    "Number",
    "Angadiya Number",
    "Amount",
    "City",
    "Paid Date",
  ];

  const empBankHeaders = [
    "Employee",
    "Mobile",
    "Office",
    "Month",
    "Year",
    "Net Salary",
    "Bank Name",
    "Account Holder",
    "Account Number",
    "IFSC Code",
    "Branch",
    "Paid Date",
  ];

  const empCashHeaders = [
    "Employee",
    "Mobile",
    "Office",
    "Month",
    "Year",
    "Net Salary",
    "Paid Date",
  ];

  const toEmpAngadiyaRow = (r: PaidSalaryRow) => {
    const e = paidEmpInfo(r);
    return [
      e.name,
      e.mobile,
      e.office,
      e.month,
      e.year,
      r.angadiyaDetails?.name ?? "",
      r.angadiyaDetails?.number ?? e.mobile,
      r.angadiyaDetails?.angadiyaNumber ?? "",
      r.angadiyaDetails?.amount ?? r.finalSalary,
      r.angadiyaDetails?.city ?? "",
      e.paidDate,
    ];
  };

  const toEmpBankRow = (r: PaidSalaryRow) => {
    const e = paidEmpInfo(r);
    return [
      e.name,
      e.mobile,
      e.office,
      e.month,
      e.year,
      r.finalSalary,
      r.bankDetails?.bankName ?? "",
      r.bankDetails?.accountHolderName ?? "",
      r.bankDetails?.accountNumber ?? "",
      r.bankDetails?.ifscCode ?? "",
      r.bankDetails?.branch ?? "",
      e.paidDate,
    ];
  };

  const toEmpCashRow = (r: PaidSalaryRow) => {
    const e = paidEmpInfo(r);
    return [e.name, e.mobile, e.office, e.month, e.year, r.finalSalary, e.paidDate];
  };

  const angadiyaRows = paidSalaries
    .filter((r) => r.paymentMode === "angadiya")
    .map(toEmpAngadiyaRow);
  const bankRows = paidSalaries
    .filter((r) => r.paymentMode === "bank")
    .map(toEmpBankRow);
  const cashRows = paidSalaries
    .filter((r) => r.paymentMode === "cash_in_hand")
    .map(toEmpCashRow);

  const officeSuffix =
    parsed.data.officeId && parsed.data.officeId !== "all"
      ? `-${parsed.data.officeId}`
      : "";

  if (parsed.data.format === "excel") {
    await sendExcelMultiSheet(res, `employee-details${officeSuffix}.xlsx`, [
      {
        name: "Angadiya",
        headers: empAngadiyaHeaders,
        rows: angadiyaRows,
      },
      {
        name: "Bank",
        headers: empBankHeaders,
        rows: bankRows,
      },
      {
        name: "Cash in Hand",
        headers: empCashHeaders,
        rows: cashRows,
      },
      {
        name: "All Employees",
        headers: EMPLOYEE_EXPORT_HEADERS,
        rows: allRows,
      },
    ]);
  } else {
    sendPdf(res, "employees.pdf", "Employee Details", EMPLOYEE_EXPORT_HEADERS, allRows);
  }
}

export async function exportAdvanceReport(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const parsed = exportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("Invalid export parameters");
  }

  const filter: Record<string, unknown> = { ...getOfficeIdFilter(req) };
  if (parsed.data.officeId) {
    assertOfficeAccess(req, parsed.data.officeId);
    filter.officeId = parsed.data.officeId;
  }
  if (req.query.employeeId) {
    filter.employeeId = String(req.query.employeeId);
  }
  applyExportAdvanceDateFilter(
    filter,
    parsed.data.month,
    parsed.data.year,
    parsed.data.dateFrom,
    parsed.data.dateTo
  );

  const advances = await Advance.find(filter)
    .populate("employeeId", "fullName")
    .sort({ date: -1 });

  const headers = [
    "Employee",
    "Amount",
    "Recovered",
    "Outstanding",
    "Mode",
    "Date",
  ];
  const rows = advances.map((a) => {
    const emp = a.employeeId as { fullName?: string } | null;
    return [
      emp?.fullName ?? "",
      a.advanceAmount,
      a.amountRecovered,
      a.outstandingAmount,
      a.recoveryMode,
      a.date.toISOString().split("T")[0],
    ];
  });

  if (parsed.data.format === "excel") {
    await sendExcel(res, "advance-report.xlsx", "Advances", headers, rows);
  } else {
    sendPdf(res, "advance-report.pdf", "Advance Report", headers, rows);
  }
}

export async function exportAdvanceStatement(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const parsed = exportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("Invalid export parameters");
  }

  const filter: Record<string, unknown> = { ...getOfficeIdFilter(req) };
  if (parsed.data.officeId) {
    assertOfficeAccess(req, parsed.data.officeId);
    filter.officeId = parsed.data.officeId;
  }
  const employeeId = req.query.employeeId as string | undefined;
  if (employeeId) {
    filter.employeeId = employeeId;
  }
  applyExportAdvanceDateFilter(
    filter,
    parsed.data.month,
    parsed.data.year,
    parsed.data.dateFrom,
    parsed.data.dateTo
  );

  const advances = await Advance.find(filter)
    .populate("employeeId", "fullName mobileNumber")
    .populate("officeId", "name")
    .sort({ date: -1 });

  type EmpKey = string;
  const byEmployeeMap = new Map<
    EmpKey,
    {
      fullName: string;
      mobile: string;
      office: string;
      taken: number;
      recovered: number;
      outstanding: number;
    }
  >();

  const detailRows: (string | number)[][] = [];

  for (const a of advances) {
    const emp = a.employeeId as { _id?: { toString(): string }; fullName?: string; mobileNumber?: string } | null;
    const off = a.officeId as { name?: string } | null;
    const empId = emp?._id?.toString() ?? a.employeeId.toString();
    const name = emp?.fullName ?? "";

    if (!byEmployeeMap.has(empId)) {
      byEmployeeMap.set(empId, {
        fullName: name,
        mobile: emp?.mobileNumber ?? "",
        office: off?.name ?? "",
        taken: 0,
        recovered: 0,
        outstanding: 0,
      });
    }
    const s = byEmployeeMap.get(empId)!;
    s.taken += a.advanceAmount;
    s.recovered += a.amountRecovered;
    s.outstanding += a.outstandingAmount;

    detailRows.push([
      name,
      off?.name ?? "",
      a.date.toISOString().split("T")[0],
      a.advanceAmount,
      a.amountRecovered,
      a.outstandingAmount,
      a.recoveryMode,
      a.installmentAmount ?? "",
      a.reason,
      a.notes ?? "",
      a.isFullyRecovered ? "Recovered" : "Active",
    ]);
  }

  const summaryRows = Array.from(byEmployeeMap.values())
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .map((e) => [
      e.fullName,
      e.mobile,
      e.office,
      e.taken,
      e.recovered,
      e.outstanding,
    ]);

  const empIds = Array.from(byEmployeeMap.keys());
  const historyMap = await getDeductionHistoryByEmployee(empIds);
  const deductionRows: (string | number)[][] = [];

  for (const [empId, summary] of byEmployeeMap) {
    const deductions = historyMap.get(empId) ?? [];
    for (const d of deductions) {
      deductionRows.push([
        summary.fullName,
        summary.office,
        d.periodLabel,
        d.amount,
        new Date(d.deductedAt).toISOString().split("T")[0],
        d.advanceId ?? "",
      ]);
    }
  }

  deductionRows.sort((a, b) =>
    String(a[0]).localeCompare(String(b[0])) ||
    String(b[2]).localeCompare(String(a[2]))
  );

  if (parsed.data.format === "excel") {
    await sendExcelMultiSheet(res, "advance-statement.xlsx", [
      {
        name: "Summary",
        headers: [
          "Employee",
          "Mobile",
          "Office",
          "Total Taken",
          "Total Recovered",
          "Outstanding",
        ],
        rows: summaryRows,
      },
      {
        name: "Transactions",
        headers: [
          "Employee",
          "Office",
          "Date",
          "Advance",
          "Recovered",
          "Outstanding",
          "Mode",
          "Installment",
          "Reason",
          "Notes",
          "Status",
        ],
        rows: detailRows,
      },
      {
        name: "Salary Deductions",
        headers: [
          "Employee",
          "Office",
          "Salary Month",
          "Deducted Amount",
          "Deducted On",
          "Advance Ref",
        ],
        rows: deductionRows,
      },
    ]);
  } else {
    sendPdf(
      res,
      "advance-statement.pdf",
      "Advance Statement",
      ["Employee", "Office", "Taken", "Recovered", "Outstanding"],
      summaryRows
    );
  }
}

const deferredExportSchema = exportQuerySchema.extend({
  status: z.enum(["active", "settled", "all"]).optional(),
});

export async function exportDeferredStatement(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const parsed = deferredExportSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("Invalid export parameters");
  }

  if (parsed.data.officeId) {
    assertOfficeAccess(req, parsed.data.officeId);
  }

  const status = parsed.data.status ?? "active";
  const data = await buildDeferredSalaryStatement(getOfficeIdFilter(req), {
    officeId: parsed.data.officeId,
    employeeId: req.query.employeeId ? String(req.query.employeeId) : undefined,
    status,
    month: status === "settled" ? parsed.data.month : undefined,
    year: status === "settled" || status === "all" ? parsed.data.year : undefined,
  });

  const summaryRows = data.byEmployee.map((emp) => [
    emp.fullName,
    emp.mobileNumber,
    emp.officeName,
    emp.totalOutstanding,
    emp.totalSettled,
    emp.pendingCarryPeriod ?? "",
    emp.pendingCarryAmount ?? "",
    emp.pendingNetSalary ?? "",
  ]);

  const lineRows: (string | number)[][] = [];
  for (const emp of data.byEmployee) {
    for (const entry of emp.entries) {
      lineRows.push([
        emp.fullName,
        emp.officeName,
        entry.periodLabel,
        entry.amount,
        entry.lineStatus,
        entry.carriedToPeriod ?? "",
        entry.settledInPeriod ?? "",
        entry.settledOn ?? "",
        entry.remarks ?? "",
      ]);
    }
  }

  if (parsed.data.format === "excel") {
    await sendExcelMultiSheet(res, "deferred-salary-statement.xlsx", [
      {
        name: "Summary",
        headers: [
          "Employee",
          "Mobile",
          "Office",
          "Outstanding Deferred",
          "Settled (History)",
          "Pending Pay Period",
          "Deferred In Pending",
          "Pending Net Salary",
        ],
        rows: summaryRows,
      },
      {
        name: "Deferred Lines",
        headers: [
          "Employee",
          "Office",
          "Deferred Period",
          "Amount",
          "Status",
          "Carried To",
          "Settled In",
          "Settled On",
          "Remarks",
        ],
        rows: lineRows,
      },
    ]);
  } else {
    sendPdf(
      res,
      "deferred-salary-statement.pdf",
      "Deferred Salary Statement",
      [
        "Employee",
        "Office",
        "Outstanding",
        "Settled",
        "Pending Period",
        "Carry Amount",
      ],
      data.byEmployee.map((emp) => [
        emp.fullName,
        emp.officeName,
        emp.totalOutstanding,
        emp.totalSettled,
        emp.pendingCarryPeriod ?? "",
        emp.pendingCarryAmount ?? "",
      ])
    );
  }
}

export async function exportSkippedStatement(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const parsed = deferredExportSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("Invalid export parameters");
  }

  if (parsed.data.officeId) {
    assertOfficeAccess(req, parsed.data.officeId);
  }

  const data = await buildSkippedSalaryStatement(getOfficeIdFilter(req), {
    officeId: parsed.data.officeId,
    employeeId: req.query.employeeId ? String(req.query.employeeId) : undefined,
    year: parsed.data.year,
    month: parsed.data.month,
  });

  const summaryRows = data.byEmployee.map((emp) => [
    emp.fullName,
    emp.mobileNumber,
    emp.officeName,
    emp.skippedCount,
    emp.totalWaived,
  ]);

  const lineRows: (string | number)[][] = [];
  for (const emp of data.byEmployee) {
    for (const entry of emp.entries) {
      lineRows.push([
        emp.fullName,
        emp.officeName,
        entry.periodLabel,
        entry.waivedAmount,
        entry.skippedAt ?? "",
        entry.remarks ?? "",
      ]);
    }
  }

  if (parsed.data.format === "excel") {
    await sendExcelMultiSheet(res, "skipped-salary-statement.xlsx", [
      {
        name: "Summary",
        headers: [
          "Employee",
          "Mobile",
          "Office",
          "Skipped Months",
          "Total Waived",
        ],
        rows: summaryRows,
      },
      {
        name: "Skipped Lines",
        headers: [
          "Employee",
          "Office",
          "Period",
          "Waived Amount",
          "Skipped On",
          "Reason",
        ],
        rows: lineRows,
      },
    ]);
  } else {
    sendPdf(
      res,
      "skipped-salary-statement.pdf",
      "Skipped Salary Statement",
      ["Employee", "Office", "Skipped Months", "Total Waived"],
      data.byEmployee.map((emp) => [
        emp.fullName,
        emp.officeName,
        emp.skippedCount,
        emp.totalWaived,
      ])
    );
  }
}
