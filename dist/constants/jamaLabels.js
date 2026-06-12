"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JAMA_UI = exports.SALARY_STATUS_LABELS = exports.JAMA_LABEL = void 0;
const enums_1 = require("../types/enums");
exports.JAMA_LABEL = "Jama";
exports.SALARY_STATUS_LABELS = {
    [enums_1.SalaryPaidStatus.PENDING]: "Pending",
    [enums_1.SalaryPaidStatus.PAID]: "Paid",
    [enums_1.SalaryPaidStatus.DEFERRED]: exports.JAMA_LABEL,
    [enums_1.SalaryPaidStatus.SKIPPED]: "Skipped",
};
exports.JAMA_UI = {
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
};
