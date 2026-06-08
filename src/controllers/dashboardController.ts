import { Response } from "express";
import mongoose from "mongoose";
import { Office } from "../models/Office";
import { Employee } from "../models/Employee";
import { Advance } from "../models/Advance";
import { SalaryRecord } from "../models/SalaryRecord";
import { EmployeeStatus, SalaryPaidStatus } from "../types/enums";
import { AuthRequest } from "../middleware/auth";
import { getOfficeIdFilter } from "../utils/officeFilter";

function parsePeriod(req: AuthRequest): { month: number; year: number } {
  const now = new Date();
  let month = now.getMonth() + 1;
  let year = now.getFullYear();

  if (req.query.month) {
    const m = Number(req.query.month);
    if (m >= 1 && m <= 12) month = m;
  }
  if (req.query.year) {
    const y = Number(req.query.year);
    if (y >= 2000 && y <= 2100) year = y;
  }

  return { month, year };
}

function periodLabel(month: number, year: number): string {
  return new Date(year, month - 1).toLocaleString("en", {
    month: "short",
    year: "numeric",
  });
}

function getLastNMonths(
  month: number,
  year: number,
  count: number
): Array<{ month: number; year: number }> {
  const result: Array<{ month: number; year: number }> = [];
  let m = month;
  let y = year;

  for (let i = 0; i < count; i++) {
    result.unshift({ month: m, year: y });
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }

  return result;
}

export async function getDashboard(req: AuthRequest, res: Response): Promise<void> {
  const officeFilter = getOfficeIdFilter(req);
  const { month, year } = parsePeriod(req);
  const trendMonths = getLastNMonths(month, year, 6);
  const trendMatchers = trendMonths.map((p) => ({ month: p.month, year: p.year }));

  const salaryMonthFilter = { month, year, ...officeFilter };

  const [
    totalOffices,
    totalEmployees,
    activeEmployees,
    outstandingAdvances,
    monthlySalaries,
    paidThisMonth,
    pendingThisMonth,
    deferredThisMonth,
    skippedThisMonth,
    recentSalaries,
    recentAdvances,
    recentEmployees,
    salaryTrendRaw,
    officeWiseSalary,
    advanceTrendRaw,
    advancesInMonth,
  ] = await Promise.all([
    Office.countDocuments(
      req.user?.role === "super_admin"
        ? {}
        : {
            _id: {
              $in: (req.user?.assignedOfficeIds ?? []).map(
                (id) => new mongoose.Types.ObjectId(id)
              ),
            },
          }
    ),
    Employee.countDocuments(officeFilter),
    Employee.countDocuments({ ...officeFilter, status: EmployeeStatus.ACTIVE }),
    Advance.aggregate([
      { $match: { ...officeFilter, isFullyRecovered: false } },
      { $group: { _id: null, total: { $sum: "$outstandingAmount" } } },
    ]),
    SalaryRecord.aggregate([
      { $match: salaryMonthFilter },
      { $group: { _id: null, total: { $sum: "$finalSalary" } } },
    ]),
    SalaryRecord.aggregate([
      {
        $match: {
          ...salaryMonthFilter,
          paidStatus: SalaryPaidStatus.PAID,
        },
      },
      { $group: { _id: null, total: { $sum: "$finalSalary" } } },
    ]),
    SalaryRecord.aggregate([
      {
        $match: {
          ...salaryMonthFilter,
          paidStatus: SalaryPaidStatus.PENDING,
        },
      },
      { $group: { _id: null, total: { $sum: "$finalSalary" }, count: { $sum: 1 } } },
    ]),
    SalaryRecord.aggregate([
      {
        $match: {
          ...salaryMonthFilter,
          paidStatus: SalaryPaidStatus.DEFERRED,
        },
      },
      { $group: { _id: null, total: { $sum: "$finalSalary" }, count: { $sum: 1 } } },
    ]),
    SalaryRecord.aggregate([
      {
        $match: {
          ...salaryMonthFilter,
          paidStatus: SalaryPaidStatus.SKIPPED,
        },
      },
      { $group: { _id: null, count: { $sum: 1 } } },
    ]),
    SalaryRecord.find(salaryMonthFilter)
      .populate("employeeId", "fullName")
      .populate("officeId", "name")
      .sort({ updatedAt: -1 })
      .limit(5),
    Advance.find(officeFilter)
      .populate("employeeId", "fullName")
      .sort({ createdAt: -1 })
      .limit(5),
    Employee.find(officeFilter)
      .populate("officeId", "name")
      .sort({ createdAt: -1 })
      .limit(5),
    SalaryRecord.aggregate([
      { $match: { ...officeFilter, $or: trendMatchers } },
      {
        $group: {
          _id: { month: "$month", year: "$year" },
          total: { $sum: "$finalSalary" },
          paid: {
            $sum: {
              $cond: [
                { $eq: ["$paidStatus", SalaryPaidStatus.PAID] },
                "$finalSalary",
                0,
              ],
            },
          },
          pending: {
            $sum: {
              $cond: [
                { $eq: ["$paidStatus", SalaryPaidStatus.PENDING] },
                "$finalSalary",
                0,
              ],
            },
          },
          deferred: {
            $sum: {
              $cond: [
                { $eq: ["$paidStatus", SalaryPaidStatus.DEFERRED] },
                "$finalSalary",
                0,
              ],
            },
          },
          skipped: {
            $sum: {
              $cond: [{ $eq: ["$paidStatus", SalaryPaidStatus.SKIPPED] }, 1, 0],
            },
          },
        },
      },
    ]),
    SalaryRecord.aggregate([
      { $match: salaryMonthFilter },
      {
        $group: {
          _id: "$officeId",
          total: { $sum: "$finalSalary" },
          paid: {
            $sum: {
              $cond: [
                { $eq: ["$paidStatus", SalaryPaidStatus.PAID] },
                "$finalSalary",
                0,
              ],
            },
          },
          pending: {
            $sum: {
              $cond: [
                { $eq: ["$paidStatus", SalaryPaidStatus.PENDING] },
                "$finalSalary",
                0,
              ],
            },
          },
          deferred: {
            $sum: {
              $cond: [
                { $eq: ["$paidStatus", SalaryPaidStatus.DEFERRED] },
                "$finalSalary",
                0,
              ],
            },
          },
        },
      },
      { $sort: { total: -1 } },
    ]),
    Advance.aggregate([
      { $match: officeFilter },
      {
        $group: {
          _id: {
            month: { $month: "$date" },
            year: { $year: "$date" },
          },
          total: { $sum: "$advanceAmount" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]),
    Advance.aggregate([
      {
        $match: {
          ...officeFilter,
          $expr: {
            $and: [
              { $eq: [{ $month: "$date" }, month] },
              { $eq: [{ $year: "$date" }, year] },
            ],
          },
        },
      },
      { $group: { _id: null, total: { $sum: "$advanceAmount" } } },
    ]),
  ]);

  const officeIds = officeWiseSalary.map((o) => o._id);
  const offices = await Office.find({ _id: { $in: officeIds } }).select("name");
  const officeMap = new Map(offices.map((o) => [o._id.toString(), o.name]));

  const trendMap = new Map(
    salaryTrendRaw.map((s) => [
      `${s._id.month}-${s._id.year}`,
      {
        total: s.total,
        paid: s.paid,
        pending: s.pending,
        deferred: s.deferred ?? 0,
        skipped: s.skipped ?? 0,
      },
    ])
  );

  const salaryTrend = trendMonths.map((p) => {
    const key = `${p.month}-${p.year}`;
    const row = trendMap.get(key);
    return {
      label: periodLabel(p.month, p.year),
      total: row?.total ?? 0,
      paid: row?.paid ?? 0,
      pending: row?.pending ?? 0,
      deferred: row?.deferred ?? 0,
      skipped: row?.skipped ?? 0,
    };
  });

  const advanceTrend = advanceTrendRaw
    .slice(-6)
    .map((a) => ({
      label: periodLabel(a._id.month, a._id.year),
      total: a.total,
    }));

  const paidAmount = paidThisMonth[0]?.total ?? 0;
  const pendingAmount = pendingThisMonth[0]?.total ?? 0;
  const deferredAmount = deferredThisMonth[0]?.total ?? 0;
  const deferredCount = deferredThisMonth[0]?.count ?? 0;
  const skippedCount = skippedThisMonth[0]?.count ?? 0;

  res.json({
    success: true,
    data: {
      period: {
        month,
        year,
        label: periodLabel(month, year),
      },
      cards: {
        totalOffices,
        totalEmployees,
        activeEmployees,
        totalMonthlySalary: monthlySalaries[0]?.total ?? 0,
        totalOutstandingAdvances: outstandingAdvances[0]?.total ?? 0,
        paidSalaryThisMonth: paidAmount,
        pendingSalaryThisMonth: pendingAmount,
        deferredSalaryThisMonth: deferredAmount,
        deferredCountThisMonth: deferredCount,
        skippedCountThisMonth: skippedCount,
        advancesThisMonth: advancesInMonth[0]?.total ?? 0,
      },
      charts: {
        salaryTrend,
        officeWiseSalary: officeWiseSalary.map((o) => ({
          office: officeMap.get(o._id?.toString() ?? "") ?? "Unknown",
          total: o.total,
          paid: o.paid,
          pending: o.pending,
          deferred: o.deferred ?? 0,
        })),
        advanceTrend,
        salaryStatus: {
          paid: paidAmount,
          pending: pendingAmount,
          deferred: deferredAmount,
          skipped: skippedCount,
        },
      },
      recent: {
        salaries: recentSalaries,
        advances: recentAdvances,
        employees: recentEmployees,
      },
    },
  });
}
