"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateFinalSalary = calculateFinalSalary;
function calculateFinalSalary(components) {
    const { monthlySalary, bonus = 0, otherAddition = 0, otherDeduction = 0, advanceDeduction = 0, } = components;
    return Math.max(0, monthlySalary + bonus + otherAddition - otherDeduction - advanceDeduction);
}
