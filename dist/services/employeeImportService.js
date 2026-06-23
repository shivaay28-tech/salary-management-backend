"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMPLOYEE_IMPORT_HEADERS = void 0;
exports.sendEmployeeImportTemplate = sendEmployeeImportTemplate;
exports.importEmployeesFromExcel = importEmployeesFromExcel;
const exceljs_1 = __importDefault(require("exceljs"));
const stream_1 = require("stream");
const Office_1 = require("../models/Office");
const Employee_1 = require("../models/Employee");
const enums_1 = require("../types/enums");
const rbac_1 = require("../middleware/rbac");
const errorHandler_1 = require("../middleware/errorHandler");
const officeFilter_1 = require("../utils/officeFilter");
const auditService_1 = require("./auditService");
exports.EMPLOYEE_IMPORT_HEADERS = [
    "Full Name",
    "Mobile",
    "Office",
    "Monthly Salary",
    "Status",
    "Date of Joining",
    "Out Date",
];
const HEADER_ALIASES = {
    "full name": "fullName",
    name: "fullName",
    mobile: "mobileNumber",
    "mobile number": "mobileNumber",
    phone: "mobileNumber",
    office: "officeName",
    "office name": "officeName",
    "monthly salary": "monthlySalary",
    salary: "monthlySalary",
    status: "status",
    "date of joining": "dateOfJoining",
    joining: "dateOfJoining",
    "join date": "dateOfJoining",
    "out date": "outDate",
};
function normalizeHeader(value) {
    if (value == null)
        return "";
    if (typeof value === "object" && "text" in value) {
        return String(value.text).trim().toLowerCase();
    }
    return String(value).trim().toLowerCase();
}
function cellToString(value) {
    if (value == null || value === "")
        return "";
    if (value instanceof Date) {
        return value.toISOString().split("T")[0];
    }
    if (typeof value === "object") {
        if ("result" in value && value.result != null) {
            return cellToString(value.result);
        }
        if ("text" in value) {
            return String(value.text).trim();
        }
        if ("richText" in value && Array.isArray(value.richText)) {
            return value.richText.map((part) => part.text).join("").trim();
        }
    }
    const raw = String(value).trim();
    if (/^\d+(\.0+)?$/.test(raw)) {
        return raw.replace(/\.0+$/, "");
    }
    return raw;
}
function parseDate(value) {
    if (!value)
        return null;
    const iso = new Date(value);
    if (!Number.isNaN(iso.getTime()))
        return iso;
    const dmy = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) {
        const parsed = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
        if (!Number.isNaN(parsed.getTime()))
            return parsed;
    }
    return null;
}
function parseStatus(value) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === "active")
        return enums_1.EmployeeStatus.ACTIVE;
    if (normalized === "inactive")
        return enums_1.EmployeeStatus.INACTIVE;
    return null;
}
function isRowEmpty(row) {
    return !row.fullName && !row.mobileNumber && !row.officeName && !row.monthlySalary;
}
async function sendEmployeeImportTemplate(req, res) {
    const offices = await Office_1.Office.find({ ...(0, officeFilter_1.getOfficeDocumentFilter)(req) })
        .select("name")
        .sort({ name: 1 });
    const sampleOffice = offices[0]?.name ?? "Office 1";
    const workbook = new exceljs_1.default.Workbook();
    const sheet = workbook.addWorksheet("Employees");
    sheet.addRow([...exports.EMPLOYEE_IMPORT_HEADERS]);
    sheet.addRow([
        "Ramesh Patel",
        "9876500001",
        sampleOffice,
        25000,
        "active",
        "2024-01-15",
        "",
    ]);
    sheet.getRow(1).font = { bold: true };
    sheet.columns = [
        { width: 22 },
        { width: 14 },
        { width: 18 },
        { width: 14 },
        { width: 10 },
        { width: 16 },
        { width: 12 },
    ];
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="employee-import-template.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
}
async function importEmployeesFromExcel(req, fileBuffer) {
    const workbook = new exceljs_1.default.Workbook();
    await workbook.xlsx.read(stream_1.Readable.from(fileBuffer));
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount < 2) {
        throw new errorHandler_1.AppError("Excel file is empty or missing data rows", 400);
    }
    const headerRow = sheet.getRow(1);
    const columnMap = new Map();
    headerRow.eachCell((cell, col) => {
        const key = HEADER_ALIASES[normalizeHeader(cell.value)];
        if (key)
            columnMap.set(col, key);
    });
    const requiredColumns = [
        "fullName",
        "mobileNumber",
        "officeName",
        "monthlySalary",
        "dateOfJoining",
    ];
    const mapped = new Set(columnMap.values());
    const missing = requiredColumns.filter((col) => !mapped.has(col));
    if (missing.length > 0) {
        throw new errorHandler_1.AppError(`Missing required columns: ${missing.join(", ")}. Download the template for the correct format.`, 400);
    }
    const offices = await Office_1.Office.find({ ...(0, officeFilter_1.getOfficeDocumentFilter)(req) })
        .select("name")
        .sort({ name: 1 });
    const officeByName = new Map(offices.map((office) => [office.name.trim().toLowerCase(), office._id.toString()]));
    const availableOfficeNames = offices.map((office) => office.name).join(", ");
    const result = { created: 0, failed: [] };
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
        const row = sheet.getRow(rowNumber);
        const parsed = {
            fullName: "",
            mobileNumber: "",
            officeName: "",
            monthlySalary: "",
            status: "",
            dateOfJoining: "",
            outDate: "",
        };
        columnMap.forEach((field, col) => {
            parsed[field] = cellToString(row.getCell(col).value);
        });
        if (isRowEmpty(parsed))
            continue;
        const fail = (error) => {
            result.failed.push({
                row: rowNumber,
                fullName: parsed.fullName || undefined,
                error,
            });
        };
        if (parsed.fullName.length < 2) {
            fail("Full name must be at least 2 characters");
            continue;
        }
        if (parsed.mobileNumber.length < 10) {
            fail("Mobile number must be at least 10 digits");
            continue;
        }
        const officeId = officeByName.get(parsed.officeName.trim().toLowerCase());
        if (!officeId) {
            fail(availableOfficeNames
                ? `Office "${parsed.officeName || "(empty)"}" not found. Use one of your assigned offices: ${availableOfficeNames}`
                : `Office "${parsed.officeName || "(empty)"}" not found. No offices are assigned to your account.`);
            continue;
        }
        try {
            (0, rbac_1.assertOfficeAccess)(req, officeId);
        }
        catch {
            fail("You do not have access to this office");
            continue;
        }
        const monthlySalary = Number(parsed.monthlySalary);
        if (Number.isNaN(monthlySalary) || monthlySalary < 0) {
            fail("Monthly salary must be a valid number");
            continue;
        }
        const dateOfJoining = parseDate(parsed.dateOfJoining);
        if (!dateOfJoining) {
            fail("Invalid date of joining (use YYYY-MM-DD)");
            continue;
        }
        const status = parseStatus(parsed.status);
        if (!status) {
            fail('Status must be "active" or "inactive"');
            continue;
        }
        let outDate;
        if (parsed.outDate) {
            const parsedOutDate = parseDate(parsed.outDate);
            if (!parsedOutDate) {
                fail("Invalid out date (use YYYY-MM-DD)");
                continue;
            }
            outDate = parsedOutDate;
        }
        if (status === enums_1.EmployeeStatus.INACTIVE && !outDate) {
            fail("Out date is required for inactive employees");
            continue;
        }
        const duplicate = await Employee_1.Employee.findOne({
            mobileNumber: parsed.mobileNumber,
            officeId,
        });
        if (duplicate) {
            fail("Employee with this mobile number already exists in this office");
            continue;
        }
        await Employee_1.Employee.create({
            fullName: parsed.fullName,
            mobileNumber: parsed.mobileNumber,
            officeId,
            monthlySalary,
            dateOfJoining,
            status,
            outDate,
        });
        result.created++;
    }
    if (req.user && result.created > 0) {
        await (0, auditService_1.logAudit)(req.user, "Employees Imported", "employees", {
            created: result.created,
            failed: result.failed.length,
        });
    }
    if (result.created === 0 && result.failed.length === 0) {
        throw new errorHandler_1.AppError("No employee rows found in the Excel file", 400);
    }
    return result;
}
