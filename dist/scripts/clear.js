"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = require("../config/db");
const User_1 = require("../models/User");
const Office_1 = require("../models/Office");
const Employee_1 = require("../models/Employee");
const Advance_1 = require("../models/Advance");
const SalaryRecord_1 = require("../models/SalaryRecord");
const AuditLog_1 = require("../models/AuditLog");
const AdvanceDeductionLog_1 = require("../models/AdvanceDeductionLog");
const UPLOAD_DIR = path_1.default.join(process.cwd(), "uploads", "employees");
async function clear() {
    await (0, db_1.connectDB)();
    const results = await Promise.all([
        AdvanceDeductionLog_1.AdvanceDeductionLog.deleteMany({}),
        SalaryRecord_1.SalaryRecord.deleteMany({}),
        Advance_1.Advance.deleteMany({}),
        Employee_1.Employee.deleteMany({}),
        AuditLog_1.AuditLog.deleteMany({}),
        Office_1.Office.deleteMany({}),
        User_1.User.deleteMany({}),
    ]);
    console.log("Cleared collections:");
    console.log(`  advance_deduction_logs: ${results[0].deletedCount}`);
    console.log(`  salary_records:         ${results[1].deletedCount}`);
    console.log(`  advances:               ${results[2].deletedCount}`);
    console.log(`  employees:              ${results[3].deletedCount}`);
    console.log(`  audit_logs:             ${results[4].deletedCount}`);
    console.log(`  offices:                ${results[5].deletedCount}`);
    console.log(`  users:                  ${results[6].deletedCount}`);
    if (fs_1.default.existsSync(UPLOAD_DIR)) {
        for (const file of fs_1.default.readdirSync(UPLOAD_DIR)) {
            fs_1.default.unlinkSync(path_1.default.join(UPLOAD_DIR, file));
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
