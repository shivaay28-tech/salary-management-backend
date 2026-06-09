import { EmployeeStatus } from "../types/enums";

export interface SalaryComponents {
  monthlySalary: number;
  bonus?: number;
  otherAddition?: number;
  otherDeduction?: number;
  advanceDeduction?: number;
}

export function calculateFinalSalary(components: SalaryComponents): number {
  const {
    monthlySalary,
    bonus = 0,
    otherAddition = 0,
    otherDeduction = 0,
    advanceDeduction = 0,
  } = components;

  return Math.max(
    0,
    monthlySalary + bonus + otherAddition - otherDeduction - advanceDeduction
  );
}

export interface ProRataEmployeeDates {
  dateOfJoining: Date;
  outDate?: Date | null;
}

export interface ProRataInput extends ProRataEmployeeDates {
  monthlySalary: number;
  month: number;
  year: number;
}

export interface ProRataResult {
  baseSalary: number;
  payableDays: number;
  daysInMonth: number;
  fullMonthlySalary: number;
  isProRata: boolean;
  isPayable: boolean;
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

function toCalendarDate(value: Date): CalendarDate {
  return {
    year: value.getFullYear(),
    month: value.getMonth() + 1,
    day: value.getDate(),
  };
}

function compareCalendar(a: CalendarDate, b: CalendarDate): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

function maxCalendar(a: CalendarDate, b: CalendarDate): CalendarDate {
  return compareCalendar(a, b) >= 0 ? a : b;
}

function minCalendar(a: CalendarDate, b: CalendarDate): CalendarDate {
  return compareCalendar(a, b) <= 0 ? a : b;
}

export function getDaysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

export function getMonthCalendarBounds(
  month: number,
  year: number
): { start: CalendarDate; end: CalendarDate } {
  const daysInMonth = getDaysInMonth(month, year);
  return {
    start: { year, month, day: 1 },
    end: { year, month, day: daysInMonth },
  };
}

export function isEmployeePayableInMonth(
  dates: ProRataEmployeeDates,
  month: number,
  year: number
): boolean {
  return calculateProRataBaseSalary({
    monthlySalary: 0,
    ...dates,
    month,
    year,
  }).isPayable;
}

export function calculateProRataBaseSalary(input: ProRataInput): ProRataResult {
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

export function buildPayableEmployeeFilter(
  month: number,
  year: number,
  officeFilter: Record<string, unknown> = {}
): Record<string, unknown> {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  return {
    ...officeFilter,
    $or: [
      {
        status: EmployeeStatus.ACTIVE,
        dateOfJoining: { $lte: monthEnd },
      },
      {
        status: EmployeeStatus.INACTIVE,
        dateOfJoining: { $lte: monthEnd },
        outDate: { $gte: monthStart, $lte: monthEnd },
      },
    ],
  };
}
