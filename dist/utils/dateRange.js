"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMonthDateRange = getMonthDateRange;
exports.resolveReportPeriod = resolveReportPeriod;
exports.hasCustomDateFilter = hasCustomDateFilter;
function getMonthDateRange(month, year) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    return { start, end };
}
function resolveReportPeriod(query) {
    if (query.dateFrom) {
        const start = new Date(`${query.dateFrom}T00:00:00`);
        const end = new Date(`${query.dateTo ?? query.dateFrom}T23:59:59.999`);
        return { start, end };
    }
    return getMonthDateRange(query.month, query.year);
}
function hasCustomDateFilter(query) {
    return Boolean(query.dateFrom);
}
