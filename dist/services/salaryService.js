"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMonthlySalaries = generateMonthlySalaries;
const mongoose_1 = __importDefault(require("mongoose"));
const Employee_1 = require("../models/Employee");
const SalaryRecord_1 = require("../models/SalaryRecord");
const enums_1 = require("../types/enums");
const salary_1 = require("../utils/salary");
const advanceService_1 = require("./advanceService");
const salaryRecalcService_1 = require("./salaryRecalcService");
async function generateMonthlySalaries(options) {
    const { month, year, createdBy } = options;
    const employeeFilter = {
        status: enums_1.EmployeeStatus.ACTIVE,
    };
    if (options.officeId) {
        employeeFilter.officeId = options.officeId;
    }
    else if (options.officeIds?.length) {
        employeeFilter.officeId = { $in: options.officeIds };
    }
    const employees = await Employee_1.Employee.find(employeeFilter);
    let created = 0;
    let skipped = 0;
    for (const employee of employees) {
        const exists = await SalaryRecord_1.SalaryRecord.findOne({
            employeeId: employee._id,
            month,
            year,
        });
        if (exists) {
            if (exists.paidStatus === enums_1.SalaryPaidStatus.PENDING) {
                await (0, salaryRecalcService_1.refreshPendingSalaryFromEmployee)(exists, employee.monthlySalary);
            }
            skipped++;
            continue;
        }
        const bonus = options.bonus ?? 0;
        const otherAddition = options.otherAddition ?? 0;
        const otherDeduction = options.otherDeduction ?? 0;
        const baseSalary = employee.monthlySalary;
        const grossBeforeAdvance = baseSalary + bonus + otherAddition - otherDeduction;
        const advances = await (0, advanceService_1.getActiveAdvancesForEmployee)(employee._id.toString());
        const { totalDeduction, allocations } = (0, advanceService_1.computeAdvanceDeduction)(advances, Math.max(0, grossBeforeAdvance));
        const finalSalary = (0, salary_1.calculateFinalSalary)({
            monthlySalary: baseSalary,
            bonus,
            otherAddition,
            otherDeduction,
            advanceDeduction: totalDeduction,
        });
        await SalaryRecord_1.SalaryRecord.create({
            employeeId: employee._id,
            officeId: employee.officeId,
            month,
            year,
            baseSalary,
            bonus,
            otherAddition,
            otherDeduction,
            advanceDeduction: totalDeduction,
            finalSalary,
            paidStatus: enums_1.SalaryPaidStatus.PENDING,
            createdBy: new mongoose_1.default.Types.ObjectId(createdBy.userId),
        });
        void allocations;
        created++;
    }
    return { created, skipped };
}
