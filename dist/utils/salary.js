"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateFinalSalary = calculateFinalSalary;
exports.getDaysInMonth = getDaysInMonth;
exports.getMonthCalendarBounds = getMonthCalendarBounds;
exports.isEmployeePayableInMonth = isEmployeePayableInMonth;
exports.calculateProRataBaseSalary = calculateProRataBaseSalary;
exports.buildPayableEmployeeFilter = buildPayableEmployeeFilter;
const enums_1 = require("../types/enums");
function calculateFinalSalary(components) {
    const { monthlySalary, bonus = 0, otherAddition = 0, otherDeduction = 0, advanceDeduction = 0, } = components;
    return Math.max(0, monthlySalary + bonus + otherAddition - otherDeduction - advanceDeduction);
}
function toCalendarDate(value) {
    return {
        year: value.getFullYear(),
        month: value.getMonth() + 1,
        day: value.getDate(),
    };
}
function compareCalendar(a, b) {
    if (a.year !== b.year)
        return a.year - b.year;
    if (a.month !== b.month)
        return a.month - b.month;
    return a.day - b.day;
}
function maxCalendar(a, b) {
    return compareCalendar(a, b) >= 0 ? a : b;
}
function minCalendar(a, b) {
    return compareCalendar(a, b) <= 0 ? a : b;
}
function getDaysInMonth(month, year) {
    return new Date(year, month, 0).getDate();
}
function getMonthCalendarBounds(month, year) {
    const daysInMonth = getDaysInMonth(month, year);
    return {
        start: { year, month, day: 1 },
        end: { year, month, day: daysInMonth },
    };
}
function isEmployeePayableInMonth(dates, month, year) {
    return calculateProRataBaseSalary({
        monthlySalary: 0,
        ...dates,
        month,
        year,
    }).isPayable;
}
function calculateProRataBaseSalary(input) {
    const { monthlySalary, dateOfJoining, outDate, month, year } = input;
    const daysInMonth = getDaysInMonth(month, year);
    const { start: monthStart, end: monthEnd } = getMonthCalendarBounds(month, year);
    const join = toCalendarDate(dateOfJoining);
    const out = outDate ? toCalendarDate(outDate) : null;
    if (compareCalendar(join, monthEnd) > 0) {
        return {
            baseSalary: 0,
            payableDays: 0,
            daysInMonth,
            fullMonthlySalary: monthlySalary,
            isProRata: false,
            isPayable: false,
        };
    }
    if (out && compareCalendar(out, monthStart) < 0) {
        return {
            baseSalary: 0,
            payableDays: 0,
            daysInMonth,
            fullMonthlySalary: monthlySalary,
            isProRata: false,
            isPayable: false,
        };
    }
    const periodStart = maxCalendar(monthStart, join);
    const periodEnd = out ? minCalendar(monthEnd, out) : monthEnd;
    if (compareCalendar(periodStart, periodEnd) > 0) {
        return {
            baseSalary: 0,
            payableDays: 0,
            daysInMonth,
            fullMonthlySalary: monthlySalary,
            isProRata: false,
            isPayable: false,
        };
    }
    const payableDays = periodEnd.day - periodStart.day + 1;
    const baseSalary = Math.round((monthlySalary / daysInMonth) * payableDays);
    const isProRata = payableDays < daysInMonth;
    return {
        baseSalary,
        payableDays,
        daysInMonth,
        fullMonthlySalary: monthlySalary,
        isProRata,
        isPayable: payableDays > 0,
    };
}
function buildPayableEmployeeFilter(month, year, officeFilter = {}) {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
    return {
        ...officeFilter,
        $or: [
            {
                status: enums_1.EmployeeStatus.ACTIVE,
                dateOfJoining: { $lte: monthEnd },
            },
            {
                status: enums_1.EmployeeStatus.INACTIVE,
                dateOfJoining: { $lte: monthEnd },
                outDate: { $gte: monthStart, $lte: monthEnd },
            },
        ],
    };
}
