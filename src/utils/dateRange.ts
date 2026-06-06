export function getMonthDateRange(month: number, year: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

export function resolveReportPeriod(query: {
  month: number;
  year: number;
  dateFrom?: string;
  dateTo?: string;
}) {
  if (query.dateFrom) {
    const start = new Date(`${query.dateFrom}T00:00:00`);
    const end = new Date(
      `${query.dateTo ?? query.dateFrom}T23:59:59.999`
    );
    return { start, end };
  }
  return getMonthDateRange(query.month, query.year);
}

export function hasCustomDateFilter(query: {
  dateFrom?: string;
  dateTo?: string;
}) {
  return Boolean(query.dateFrom);
}
