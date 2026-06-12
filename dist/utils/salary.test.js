"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const salary_1 = require("./salary");
function d(iso) {
    return new Date(`${iso}T12:00:00`);
}
(0, node_test_1.describe)("calculateProRataBaseSalary", () => {
    (0, node_test_1.it)("returns full month when joined before month with no exit", () => {
        const result = (0, salary_1.calculateProRataBaseSalary)({
            monthlySalary: 31000,
            dateOfJoining: d("2024-01-01"),
            month: 3,
            year: 2024,
        });
        strict_1.default.equal(result.baseSalary, 31000);
        strict_1.default.equal(result.payableDays, 31);
        strict_1.default.equal(result.daysInMonth, 31);
        strict_1.default.equal(result.isProRata, false);
        strict_1.default.equal(result.isPayable, true);
    });
    (0, node_test_1.it)("prorates mid-month join with inclusive join day", () => {
        const result = (0, salary_1.calculateProRataBaseSalary)({
            monthlySalary: 31000,
            dateOfJoining: d("2024-01-15"),
            month: 1,
            year: 2024,
        });
        strict_1.default.equal(result.payableDays, 17);
        strict_1.default.equal(result.baseSalary, 17000);
        strict_1.default.equal(result.isProRata, true);
        strict_1.default.equal(result.isPayable, true);
    });
    (0, node_test_1.it)("prorates mid-month exit through out date inclusive", () => {
        const result = (0, salary_1.calculateProRataBaseSalary)({
            monthlySalary: 30000,
            dateOfJoining: d("2023-06-01"),
            outDate: d("2024-03-10"),
            month: 3,
            year: 2024,
        });
        strict_1.default.equal(result.payableDays, 10);
        strict_1.default.equal(result.baseSalary, 9677);
        strict_1.default.equal(result.isProRata, true);
        strict_1.default.equal(result.isPayable, true);
    });
    (0, node_test_1.it)("prorates join and exit in the same month", () => {
        const result = (0, salary_1.calculateProRataBaseSalary)({
            monthlySalary: 31000,
            dateOfJoining: d("2024-02-10"),
            outDate: d("2024-02-20"),
            month: 2,
            year: 2024,
        });
        strict_1.default.equal(result.payableDays, 11);
        strict_1.default.equal(result.baseSalary, 11759);
        strict_1.default.equal(result.isProRata, true);
        strict_1.default.equal(result.isPayable, true);
    });
    (0, node_test_1.it)("is not payable when joined after month ends", () => {
        const result = (0, salary_1.calculateProRataBaseSalary)({
            monthlySalary: 25000,
            dateOfJoining: d("2024-03-05"),
            month: 2,
            year: 2024,
        });
        strict_1.default.equal(result.isPayable, false);
        strict_1.default.equal(result.baseSalary, 0);
        strict_1.default.equal((0, salary_1.isEmployeePayableInMonth)({ dateOfJoining: d("2024-03-05") }, 2, 2024), false);
    });
    (0, node_test_1.it)("is not payable when exit is before month starts", () => {
        const result = (0, salary_1.calculateProRataBaseSalary)({
            monthlySalary: 25000,
            dateOfJoining: d("2024-01-01"),
            outDate: d("2024-02-28"),
            month: 3,
            year: 2024,
        });
        strict_1.default.equal(result.isPayable, false);
        strict_1.default.equal(result.baseSalary, 0);
    });
});
(0, node_test_1.describe)("getDaysInMonth", () => {
    (0, node_test_1.it)("returns correct days for leap year February", () => {
        strict_1.default.equal((0, salary_1.getDaysInMonth)(2, 2024), 29);
        strict_1.default.equal((0, salary_1.getDaysInMonth)(2, 2023), 28);
    });
});
