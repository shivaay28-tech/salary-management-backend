import ExcelJS from "exceljs";
import { Readable } from "stream";
import { Response } from "express";
import { Office } from "../models/Office";
import { Employee } from "../models/Employee";
import { EmployeeStatus } from "../types/enums";
import { AuthRequest } from "../middleware/auth";
import { assertOfficeAccess } from "../middleware/rbac";
import { AppError } from "../middleware/errorHandler";
import { getOfficeDocumentFilter } from "../utils/officeFilter";
import { logAudit } from "./auditService";

export const EMPLOYEE_IMPORT_HEADERS = [
  "Full Name",
  "Mobile",
  "Office",
  "Monthly Salary",
  "Status",
  "Date of Joining",
  "Out Date",
] as const;

const HEADER_ALIASES: Record<string, keyof ParsedEmployeeRow> = {
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

interface ParsedEmployeeRow {
  fullName: string;
  mobileNumber: string;
  officeName: string;
  monthlySalary: string;
  status: string;
  dateOfJoining: string;
  outDate: string;
}

export interface EmployeeImportFailure {
  row: number;
  fullName?: string;
  error: string;
}

export interface EmployeeImportResult {
  created: number;
  failed: EmployeeImportFailure[];
}

function normalizeHeader(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object" && "text" in value) {
    return String(value.text).trim().toLowerCase();
  }
  return String(value).trim().toLowerCase();
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null || value === "") return "";
  if (value instanceof Date) {
    return value.toISOString().split("T")[0];
  }
  if (typeof value === "object") {
    if ("result" in value && value.result != null) {
      return cellToString(value.result as ExcelJS.CellValue);
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

function parseDate(value: string): Date | null {
  if (!value) return null;
  const iso = new Date(value);
  if (!Number.isNaN(iso.getTime())) return iso;
  const dmy = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const parsed = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function parseStatus(value: string): EmployeeStatus | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "active") return EmployeeStatus.ACTIVE;
  if (normalized === "inactive") return EmployeeStatus.INACTIVE;
  return null;
}

function isRowEmpty(row: ParsedEmployeeRow): boolean {
  return !row.fullName && !row.mobileNumber && !row.officeName && !row.monthlySalary;
}

export async function sendEmployeeImportTemplate(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const offices = await Office.find({ ...getOfficeDocumentFilter(req) })
    .select("name")
    .sort({ name: 1 });
  const sampleOffice = offices[0]?.name ?? "Office 1";

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Employees");
  sheet.addRow([...EMPLOYEE_IMPORT_HEADERS]);
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

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="employee-import-template.xlsx"'
  );
  await workbook.xlsx.write(res);
  res.end();
}

export async function importEmployeesFromExcel(
  req: AuthRequest,
  fileBuffer: Buffer | Uint8Array
): Promise<EmployeeImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.read(Readable.from(fileBuffer));

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) {
    throw new AppError("Excel file is empty or missing data rows", 400);
  }

  const headerRow = sheet.getRow(1);
  const columnMap = new Map<number, keyof ParsedEmployeeRow>();

  headerRow.eachCell((cell, col) => {
    const key = HEADER_ALIASES[normalizeHeader(cell.value)];
    if (key) columnMap.set(col, key);
  });

  const requiredColumns: (keyof ParsedEmployeeRow)[] = [
    "fullName",
    "mobileNumber",
    "officeName",
    "monthlySalary",
    "dateOfJoining",
  ];
  const mapped = new Set(columnMap.values());
  const missing = requiredColumns.filter((col) => !mapped.has(col));
  if (missing.length > 0) {
    throw new AppError(
      `Missing required columns: ${missing.join(", ")}. Download the template for the correct format.`,
      400
    );
  }

  const offices = await Office.find({ ...getOfficeDocumentFilter(req) })
    .select("name")
    .sort({ name: 1 });
  const officeByName = new Map(
    offices.map((office) => [office.name.trim().toLowerCase(), office._id.toString()])
  );
  const availableOfficeNames = offices.map((office) => office.name).join(", ");

  const result: EmployeeImportResult = { created: 0, failed: [] };

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const parsed: ParsedEmployeeRow = {
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

    if (isRowEmpty(parsed)) continue;

    const fail = (error: string) => {
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
      fail(
        availableOfficeNames
          ? `Office "${parsed.officeName || "(empty)"}" not found. Use one of your assigned offices: ${availableOfficeNames}`
          : `Office "${parsed.officeName || "(empty)"}" not found. No offices are assigned to your account.`
      );
      continue;
    }

    try {
      assertOfficeAccess(req, officeId);
    } catch {
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

    let outDate: Date | undefined;
    if (parsed.outDate) {
      const parsedOutDate = parseDate(parsed.outDate);
      if (!parsedOutDate) {
        fail("Invalid out date (use YYYY-MM-DD)");
        continue;
      }
      outDate = parsedOutDate;
    }

    if (status === EmployeeStatus.INACTIVE && !outDate) {
      fail("Out date is required for inactive employees");
      continue;
    }

    const duplicate = await Employee.findOne({
      mobileNumber: parsed.mobileNumber,
      officeId,
    });
    if (duplicate) {
      fail("Employee with this mobile number already exists in this office");
      continue;
    }

    await Employee.create({
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
    await logAudit(req.user, "Employees Imported", "employees", {
      created: result.created,
      failed: result.failed.length,
    });
  }

  if (result.created === 0 && result.failed.length === 0) {
    throw new AppError("No employee rows found in the Excel file", 400);
  }

  return result;
}
