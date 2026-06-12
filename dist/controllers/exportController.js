"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportSalaryReport = exportSalaryReport;
exports.exportEmployeeList = exportEmployeeList;
exports.exportAdvanceReport = exportAdvanceReport;
exports.exportAdvanceStatement = exportAdvanceStatement;
exports.exportDeferredStatement = exportDeferredStatement;
exports.exportSkippedStatement = exportSkippedStatement;
const mongoose_1 = __importDefault(require("mongoose"));
const zod_1 = require("zod");
const SalaryRecord_1 = require("../models/SalaryRecord");
const Employee_1 = require("../models/Employee");
const Advance_1 = require("../models/Advance");
const rbac_1 = require("../middleware/rbac");
const errorHandler_1 = require("../middleware/errorHandler");
const officeFilter_1 = require("../utils/officeFilter");
const exportService_1 = require("../services/exportService");
const advanceDeductionHistoryService_1 = require("../services/advanceDeductionHistoryService");
const dateRange_1 = require("../utils/dateRange");
const jamaLabels_1 = require("../constants/jamaLabels");
const enums_1 = require("../types/enums");
const salaryDeferService_1 = require("../services/salaryDeferService");
function salaryEmployeeId(employeeId) {
    if (!employeeId)
        return null;
    if (typeof employeeId === "object" && "_id" in employeeId && employeeId._id) {
        return employeeId._id.toString();
    }
    return employeeId.toString();
}
function filterExportSalariesByDate(records, month, year, dateFrom, dateTo) {
    if (!month || !year || !(0, dateRange_1.hasCustomDateFilter)({ dateFrom, dateTo })) {
        return records;
    }
    const { start, end } = (0, dateRange_1.resolveReportPeriod)({ month, year, dateFrom, dateTo });
    return records.filter((r) => r.paidStatus === enums_1.SalaryPaidStatus.PENDING ||
        r.paidStatus === enums_1.SalaryPaidStatus.DEFERRED ||
        r.paidStatus === enums_1.SalaryPaidStatus.SKIPPED ||
        (r.paidDate && r.paidDate >= start && r.paidDate <= end));
}
function applyExportAdvanceDateFilter(filter, month, year, dateFrom, dateTo) {
    if (!month || !year)
        return;
    const { start, end } = (0, dateRange_1.resolveReportPeriod)({ month, year, dateFrom, dateTo });
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
function employeeToRow(employee) {
    const off = employee.officeId;
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
const exportQuerySchema = zod_1.z.object({
    format: zod_1.z.enum(["excel", "pdf"]),
    month: zod_1.z.coerce.number().optional(),
    year: zod_1.z.coerce.number().optional(),
    officeId: zod_1.z.string().optional(),
    status: zod_1.z.enum(["active", "inactive"]).optional(),
    dateFrom: zod_1.z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    dateTo: zod_1.z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
});
async function exportSalaryReport(req, res) {
    const parsed = exportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        throw new errorHandler_1.AppError("Invalid export parameters");
    }
    const filter = { ...(0, officeFilter_1.getOfficeIdFilter)(req) };
    if (parsed.data.month)
        filter.month = parsed.data.month;
    if (parsed.data.year)
        filter.year = parsed.data.year;
    if (parsed.data.officeId) {
        (0, rbac_1.assertOfficeAccess)(req, parsed.data.officeId);
        filter.officeId = parsed.data.officeId;
    }
    const allRecords = await SalaryRecord_1.SalaryRecord.find(filter)
        .populate("employeeId", "fullName mobileNumber")
        .populate("officeId", "name")
        .sort({ year: -1, month: -1 });
    const records = filterExportSalariesByDate(allRecords, parsed.data.month, parsed.data.year, parsed.data.dateFrom, parsed.data.dateTo);
    records.sort((a, b) => {
        const nameA = a.employeeId?.fullName ?? "";
        const nameB = b.employeeId?.fullName ?? "";
        return nameA.localeCompare(nameB);
    });
    const employeeIds = [
        ...new Set(records
            .map((s) => salaryEmployeeId(s.employeeId))
            .filter((id) => Boolean(id))),
    ];
    const outstandingRows = employeeIds.length > 0
        ? await Advance_1.Advance.aggregate([
            {
                $match: {
                    employeeId: {
                        $in: employeeIds.map((id) => new mongoose_1.default.Types.ObjectId(id)),
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
    const outstandingMap = new Map(outstandingRows.map((row) => [row._id.toString(), row.outstandingAdvance]));
    const monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const paymentModeLabel = (mode) => mode === "bank"
        ? "Bank"
        : mode === "angadiya"
            ? "Angadiya"
            : mode === "cash_in_hand"
                ? "Cash in Hand"
                : "";
    const empInfo = (r) => {
        const emp = r.employeeId;
        const off = r.officeId;
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
        "Full Monthly Salary",
        "Payable Days",
        "Days In Month",
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
    const toAngadiyaRow = (r) => {
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
    const toBankRow = (r) => {
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
    const toCashRow = (r) => {
        const e = empInfo(r);
        return [e.name, e.mobile, e.office, e.month, e.year, r.finalSalary, e.paidDate];
    };
    const toAllRow = (r) => {
        const e = empInfo(r);
        const empId = salaryEmployeeId(r.employeeId);
        return [
            e.name,
            e.mobile,
            e.office,
            e.month,
            e.year,
            r.baseSalary,
            r.fullMonthlySalary ?? r.baseSalary,
            r.payableDays ?? "",
            r.daysInMonth ?? "",
            r.bonus,
            r.otherAddition,
            r.otherDeduction,
            empId ? (outstandingMap.get(empId) ?? 0) : 0,
            r.advanceDeduction,
            r.finalSalary,
            jamaLabels_1.SALARY_STATUS_LABELS[r.paidStatus] ?? r.paidStatus,
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
        await (0, exportService_1.sendExcelMultiSheet)(res, `${filename}.xlsx`, [
            { name: "Angadiya", headers: angadiyaHeaders, rows: angadiyaRows },
            { name: "Bank", headers: bankHeaders, rows: bankRows },
            { name: "Cash in Hand", headers: cashHeaders, rows: cashRows },
            { name: "All Salaries", headers: allHeaders, rows: allRows },
        ]);
    }
    else {
        (0, exportService_1.sendPdf)(res, `${filename}.pdf`, "Monthly Salary Report", allHeaders, allRows);
    }
}
async function exportEmployeeList(req, res) {
    const parsed = exportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        throw new errorHandler_1.AppError("Invalid export parameters");
    }
    const filter = { ...(0, officeFilter_1.getOfficeIdFilter)(req) };
    if (parsed.data.officeId) {
        (0, rbac_1.assertOfficeAccess)(req, parsed.data.officeId);
        filter.officeId = parsed.data.officeId;
    }
    if (parsed.data.status) {
        filter.status = parsed.data.status;
    }
    const employees = await Employee_1.Employee.find(filter)
        .populate("officeId", "name contactNumber")
        .sort({ fullName: 1 });
    const allRows = employees.map((e) => employeeToRow(e));
    const salaryFilter = {
        ...(0, officeFilter_1.getOfficeIdFilter)(req),
        paidStatus: "paid",
    };
    if (parsed.data.officeId)
        salaryFilter.officeId = parsed.data.officeId;
    const paidSalaries = await SalaryRecord_1.SalaryRecord.find(salaryFilter)
        .populate("employeeId", "fullName mobileNumber")
        .populate("officeId", "name")
        .sort({ year: -1, month: -1 });
    const monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const paidEmpInfo = (r) => {
        const emp = r.employeeId;
        const off = r.officeId;
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
    const toEmpAngadiyaRow = (r) => {
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
    const toEmpBankRow = (r) => {
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
    const toEmpCashRow = (r) => {
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
    const officeSuffix = parsed.data.officeId && parsed.data.officeId !== "all"
        ? `-${parsed.data.officeId}`
        : "";
    if (parsed.data.format === "excel") {
        await (0, exportService_1.sendExcelMultiSheet)(res, `employee-details${officeSuffix}.xlsx`, [
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
    }
    else {
        (0, exportService_1.sendPdf)(res, "employees.pdf", "Employee Details", EMPLOYEE_EXPORT_HEADERS, allRows);
    }
}
async function exportAdvanceReport(req, res) {
    const parsed = exportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        throw new errorHandler_1.AppError("Invalid export parameters");
    }
    const filter = { ...(0, officeFilter_1.getOfficeIdFilter)(req) };
    if (parsed.data.officeId) {
        (0, rbac_1.assertOfficeAccess)(req, parsed.data.officeId);
        filter.officeId = parsed.data.officeId;
    }
    if (req.query.employeeId) {
        filter.employeeId = String(req.query.employeeId);
    }
    applyExportAdvanceDateFilter(filter, parsed.data.month, parsed.data.year, parsed.data.dateFrom, parsed.data.dateTo);
    const advances = await Advance_1.Advance.find(filter)
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
        const emp = a.employeeId;
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
        await (0, exportService_1.sendExcel)(res, "advance-report.xlsx", "Advances", headers, rows);
    }
    else {
        (0, exportService_1.sendPdf)(res, "advance-report.pdf", "Advance Report", headers, rows);
    }
}
async function exportAdvanceStatement(req, res) {
    const parsed = exportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        throw new errorHandler_1.AppError("Invalid export parameters");
    }
    const filter = { ...(0, officeFilter_1.getOfficeIdFilter)(req) };
    if (parsed.data.officeId) {
        (0, rbac_1.assertOfficeAccess)(req, parsed.data.officeId);
        filter.officeId = parsed.data.officeId;
    }
    const employeeId = req.query.employeeId;
    if (employeeId) {
        filter.employeeId = employeeId;
    }
    applyExportAdvanceDateFilter(filter, parsed.data.month, parsed.data.year, parsed.data.dateFrom, parsed.data.dateTo);
    const advances = await Advance_1.Advance.find(filter)
        .populate("employeeId", "fullName mobileNumber")
        .populate("officeId", "name")
        .sort({ date: -1 });
    const byEmployeeMap = new Map();
    const detailRows = [];
    for (const a of advances) {
        const emp = a.employeeId;
        const off = a.officeId;
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
        const s = byEmployeeMap.get(empId);
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
    const historyMap = await (0, advanceDeductionHistoryService_1.getDeductionHistoryByEmployee)(empIds);
    const deductionRows = [];
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
    deductionRows.sort((a, b) => String(a[0]).localeCompare(String(b[0])) ||
        String(b[2]).localeCompare(String(a[2])));
    if (parsed.data.format === "excel") {
        await (0, exportService_1.sendExcelMultiSheet)(res, "advance-statement.xlsx", [
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
    }
    else {
        (0, exportService_1.sendPdf)(res, "advance-statement.pdf", "Advance Statement", ["Employee", "Office", "Taken", "Recovered", "Outstanding"], summaryRows);
    }
}
const deferredExportSchema = exportQuerySchema.extend({
    status: zod_1.z.enum(["active", "settled", "all"]).optional(),
});
async function exportDeferredStatement(req, res) {
    const parsed = deferredExportSchema.safeParse(req.query);
    if (!parsed.success) {
        throw new errorHandler_1.AppError("Invalid export parameters");
    }
    if (parsed.data.officeId) {
        (0, rbac_1.assertOfficeAccess)(req, parsed.data.officeId);
    }
    const status = parsed.data.status ?? "active";
    const data = await (0, salaryDeferService_1.buildDeferredSalaryStatement)((0, officeFilter_1.getOfficeIdFilter)(req), {
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
    const lineRows = [];
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
        await (0, exportService_1.sendExcelMultiSheet)(res, `${jamaLabels_1.JAMA_UI.exportFilename}.xlsx`, [
            {
                name: "Summary",
                headers: [
                    "Employee",
                    "Mobile",
                    "Office",
                    jamaLabels_1.JAMA_UI.outstanding,
                    "Settled (History)",
                    "Pending Pay Period",
                    jamaLabels_1.JAMA_UI.inPending,
                    "Pending Net Salary",
                ],
                rows: summaryRows,
            },
            {
                name: jamaLabels_1.JAMA_UI.linesSheet,
                headers: [
                    "Employee",
                    "Office",
                    jamaLabels_1.JAMA_UI.period,
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
    }
    else {
        (0, exportService_1.sendPdf)(res, `${jamaLabels_1.JAMA_UI.exportFilename}.pdf`, jamaLabels_1.JAMA_UI.statementTitle, [
            "Employee",
            "Office",
            "Outstanding",
            "Settled",
            "Pending Period",
            "Carry Amount",
        ], data.byEmployee.map((emp) => [
            emp.fullName,
            emp.officeName,
            emp.totalOutstanding,
            emp.totalSettled,
            emp.pendingCarryPeriod ?? "",
            emp.pendingCarryAmount ?? "",
        ]));
    }
}
async function exportSkippedStatement(req, res) {
    const parsed = deferredExportSchema.safeParse(req.query);
    if (!parsed.success) {
        throw new errorHandler_1.AppError("Invalid export parameters");
    }
    if (parsed.data.officeId) {
        (0, rbac_1.assertOfficeAccess)(req, parsed.data.officeId);
    }
    const data = await (0, salaryDeferService_1.buildSkippedSalaryStatement)((0, officeFilter_1.getOfficeIdFilter)(req), {
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
    const lineRows = [];
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
        await (0, exportService_1.sendExcelMultiSheet)(res, "skipped-salary-statement.xlsx", [
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
    }
    else {
        (0, exportService_1.sendPdf)(res, "skipped-salary-statement.pdf", "Skipped Salary Statement", ["Employee", "Office", "Skipped Months", "Total Waived"], data.byEmployee.map((emp) => [
            emp.fullName,
            emp.officeName,
            emp.skippedCount,
            emp.totalWaived,
        ]));
    }
}
