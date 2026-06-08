"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateEmployeeCode = generateEmployeeCode;
const Employee_1 = require("../models/Employee");
async function generateEmployeeCode() {
    const last = await Employee_1.Employee.findOne()
        .sort({ createdAt: -1 })
        .select("employeeCode")
        .lean();
    if (!last?.employeeCode) {
        return "EMP0001";
    }
    const match = last.employeeCode.match(/EMP(\d+)/);
    const num = match ? parseInt(match[1], 10) + 1 : 1;
    return `EMP${String(num).padStart(4, "0")}`;
}
