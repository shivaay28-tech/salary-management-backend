"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportSalaryReport = exportSalaryReport;
exports.exportEmployeeList = exportEmployeeList;
exports.exportAdvanceReport = exportAdvanceReport;
exports.exportAdvanceStatement = exportAdvanceStatement;
const zod_1 = require("zod");
const SalaryRecord_1 = require("../models/SalaryRecord");
const Employee_1 = require("../models/Employee");
const Advance_1 = require("../models/Advance");
const rbac_1 = require("../middleware/rbac");
const errorHandler_1 = require("../middleware/errorHandler");
const officeFilter_1 = require("../utils/officeFilter");
const exportService_1 = require("../services/exportService");
const advanceDeductionHistoryService_1 = require("../services/advanceDeductionHistoryService");
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
    const records = await SalaryRecord_1.SalaryRecord.find(filter)
        .populate("employeeId", "fullName mobileNumber")
        .populate("officeId", "name")
        .sort({ year: -1, month: -1 });
    records.sort((a, b) => {
        const nameA = a.employeeId?.fullName ?? "";
        const nameB = b.employeeId?.fullName ?? "";
        return nameA.localeCompare(nameB);
    });
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
        "Advance Deduction",
        "Net Salary",
        "Status",
        "Payment Mode",
        "Bank Name",
        "Account Holder",
        "Account Number",
        "IFSC Code",
        "Branch",
        "Angadiya Name",
        "Angadiya Contact",
        "Angadiya Notes",
        "Paid Date",
        "Remarks",
    ];
    const paymentHeaders = [
        "Employee",
        "Mobile",
        "Office",
        "Month",
        "Year",
        "Net Salary",
        "Payment Mode",
        "Bank Name",
        "Account Holder",
        "Account Number",
        "IFSC Code",
        "Branch",
        "Angadiya Name",
        "Angadiya Contact",
        "Angadiya Notes",
        "Paid Date",
    ];
    const toAllRow = (r) => {
        const emp = r.employeeId;
        const off = r.officeId;
        return [
            emp?.fullName ?? "",
            emp?.mobileNumber ?? "",
            off?.name ?? "",
            monthNames[r.month - 1] ?? r.month,
            r.year,
            r.baseSalary,
            r.bonus,
            r.otherAddition,
            r.otherDeduction,
            r.advanceDeduction,
            r.finalSalary,
            r.paidStatus,
            paymentModeLabel(r.paymentMode),
            r.bankDetails?.bankName ?? "",
            r.bankDetails?.accountHolderName ?? "",
            r.bankDetails?.accountNumber ?? "",
            r.bankDetails?.ifscCode ?? "",
            r.bankDetails?.branch ?? "",
            r.angadiyaDetails?.angadiyaName ?? "",
            r.angadiyaDetails?.contactNumber ?? "",
            r.angadiyaDetails?.notes ?? "",
            r.paidDate ? r.paidDate.toISOString().split("T")[0] : "",
            r.remarks ?? "",
        ];
    };
    const toPaymentRow = (r) => {
        const emp = r.employeeId;
        const off = r.officeId;
        return [
            emp?.fullName ?? "",
            emp?.mobileNumber ?? "",
            off?.name ?? "",
            monthNames[r.month - 1] ?? r.month,
            r.year,
            r.finalSalary,
            paymentModeLabel(r.paymentMode),
            r.bankDetails?.bankName ?? "",
            r.bankDetails?.accountHolderName ?? "",
            r.bankDetails?.accountNumber ?? "",
            r.bankDetails?.ifscCode ?? "",
            r.bankDetails?.branch ?? "",
            r.angadiyaDetails?.angadiyaName ?? "",
            r.angadiyaDetails?.contactNumber ?? "",
            r.angadiyaDetails?.notes ?? "",
            r.paidDate ? r.paidDate.toISOString().split("T")[0] : "",
        ];
    };
    const allRows = records.map(toAllRow);
    const paidRecords = records.filter((r) => r.paidStatus === "paid");
    const angadiyaRows = paidRecords
        .filter((r) => r.paymentMode === "angadiya")
        .map(toPaymentRow);
    const bankRows = paidRecords
        .filter((r) => r.paymentMode === "bank")
        .map(toPaymentRow);
    const cashRows = paidRecords
        .filter((r) => r.paymentMode === "cash_in_hand")
        .map(toPaymentRow);
    const filename = `salaries-${parsed.data.month ?? "all"}-${parsed.data.year ?? "all"}`;
    if (parsed.data.format === "excel") {
        await (0, exportService_1.sendExcelMultiSheet)(res, `${filename}.xlsx`, [
            { name: "Angadiya", headers: paymentHeaders, rows: angadiyaRows },
            { name: "Bank", headers: paymentHeaders, rows: bankRows },
            { name: "Cash in Hand", headers: paymentHeaders, rows: cashRows },
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
    const salaryToRow = (r) => {
        const emp = r.employeeId;
        const off = r.officeId;
        return [
            emp?.fullName ?? "",
            emp?.mobileNumber ?? "",
            off?.name ?? "",
            r.month,
            r.year,
            r.finalSalary,
            r.paymentMode === "bank"
                ? "Bank"
                : r.paymentMode === "angadiya"
                    ? "Angadiya"
                    : r.paymentMode === "cash_in_hand"
                        ? "Cash in Hand"
                        : "",
            r.bankDetails?.bankName ?? "",
            r.bankDetails?.accountHolderName ?? "",
            r.bankDetails?.accountNumber ?? "",
            r.bankDetails?.ifscCode ?? "",
            r.bankDetails?.branch ?? "",
            r.angadiyaDetails?.angadiyaName ?? "",
            r.angadiyaDetails?.contactNumber ?? "",
            r.angadiyaDetails?.notes ?? "",
            r.paidDate ? r.paidDate.toISOString().split("T")[0] : "",
        ];
    };
    const salaryPayHeaders = [
        "Employee",
        "Mobile",
        "Office",
        "Month",
        "Year",
        "Net Salary",
        "Payment Mode",
        "Bank Name",
        "Account Holder",
        "Account Number",
        "IFSC Code",
        "Branch",
        "Angadiya Name",
        "Angadiya Contact",
        "Angadiya Notes",
        "Paid Date",
    ];
    const angadiyaRows = paidSalaries
        .filter((r) => r.paymentMode === "angadiya")
        .map(salaryToRow);
    const bankRows = paidSalaries
        .filter((r) => r.paymentMode === "bank")
        .map(salaryToRow);
    const cashRows = paidSalaries
        .filter((r) => r.paymentMode === "cash_in_hand")
        .map(salaryToRow);
    const officeSuffix = parsed.data.officeId && parsed.data.officeId !== "all"
        ? `-${parsed.data.officeId}`
        : "";
    if (parsed.data.format === "excel") {
        await (0, exportService_1.sendExcelMultiSheet)(res, `employee-details${officeSuffix}.xlsx`, [
            {
                name: "Angadiya",
                headers: salaryPayHeaders,
                rows: angadiyaRows,
            },
            {
                name: "Bank",
                headers: salaryPayHeaders,
                rows: bankRows,
            },
            {
                name: "Cash in Hand",
                headers: salaryPayHeaders,
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
