import fs from "fs";
import path from "path";
import { connectDB } from "../config/db";
import { User } from "../models/User";
import { Office } from "../models/Office";
import { Employee } from "../models/Employee";
import { Advance } from "../models/Advance";
import { SalaryRecord } from "../models/SalaryRecord";
import { AuditLog } from "../models/AuditLog";
import { AdvanceDeductionLog } from "../models/AdvanceDeductionLog";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "employees");

async function clear(): Promise<void> {
  await connectDB();

  const results = await Promise.all([
    AdvanceDeductionLog.deleteMany({}),
    SalaryRecord.deleteMany({}),
    Advance.deleteMany({}),
    Employee.deleteMany({}),
    AuditLog.deleteMany({}),
    Office.deleteMany({}),
    User.deleteMany({}),
  ]);

  console.log("Cleared collections:");
  console.log(`  advance_deduction_logs: ${results[0].deletedCount}`);
  console.log(`  salary_records:         ${results[1].deletedCount}`);
  console.log(`  advances:               ${results[2].deletedCount}`);
  console.log(`  employees:              ${results[3].deletedCount}`);
  console.log(`  audit_logs:             ${results[4].deletedCount}`);
  console.log(`  offices:                ${results[5].deletedCount}`);
  console.log(`  users:                  ${results[6].deletedCount}`);

  if (fs.existsSync(UPLOAD_DIR)) {
    for (const file of fs.readdirSync(UPLOAD_DIR)) {
      fs.unlinkSync(path.join(UPLOAD_DIR, file));
    }
    console.log("  employee photos: cleared");
  }

  console.log("\nAll data cleared.");
  process.exit(0);
}

clear().catch((err) => {
  console.error(err);
  process.exit(1);
});
