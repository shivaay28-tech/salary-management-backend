"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboard = getDashboard;
const Office_1 = require("../models/Office");
const Employee_1 = require("../models/Employee");
const Advance_1 = require("../models/Advance");
const SalaryRecord_1 = require("../models/SalaryRecord");
const enums_1 = require("../types/enums");
const officeFilter_1 = require("../utils/officeFilter");
function parsePeriod(req) {
    const now = new Date();
    let month = now.getMonth() + 1;
    let year = now.getFullYear();
    if (req.query.month) {
        const m = Number(req.query.month);
        if (m >= 1 && m <= 12)
            month = m;
    }
    if (req.query.year) {
        const y = Number(req.query.year);
        if (y >= 2000 && y <= 2100)
            year = y;
    }
    return { month, year };
}
function periodLabel(month, year) {
    return new Date(year, month - 1).toLocaleString("en", {
        month: "short",
        year: "numeric",
    });
}
function getLastNMonths(month, year, count) {
    const result = [];
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
async function getDashboard(req, res) {
    const officeFilter = (0, officeFilter_1.getOfficeIdFilter)(req);
    const { month, year } = parsePeriod(req);
    const trendMonths = getLastNMonths(month, year, 6);
    const trendMatchers = trendMonths.map((p) => ({ month: p.month, year: p.year }));
    const salaryMonthFilter = { month, year, ...officeFilter };
    const [totalOffices, totalEmployees, activeEmployees, outstandingAdvances, monthlySalaries, paidThisMonth, pendingThisMonth, recentSalaries, recentAdvances, recentEmployees, salaryTrendRaw, officeWiseSalary, advanceTrendRaw, advancesInMonth,] = await Promise.all([
        Office_1.Office.countDocuments(req.user?.role === "super_admin"
            ? {}
            : { _id: { $in: req.user?.assignedOfficeIds ?? [] } }),
        Employee_1.Employee.countDocuments(officeFilter),
        Employee_1.Employee.countDocuments({ ...officeFilter, status: enums_1.EmployeeStatus.ACTIVE }),
        Advance_1.Advance.aggregate([
            { $match: { ...officeFilter, isFullyRecovered: false } },
            { $group: { _id: null, total: { $sum: "$outstandingAmount" } } },
        ]),
        SalaryRecord_1.SalaryRecord.aggregate([
            { $match: salaryMonthFilter },
            { $group: { _id: null, total: { $sum: "$finalSalary" } } },
        ]),
        SalaryRecord_1.SalaryRecord.aggregate([
            {
                $match: {
                    ...salaryMonthFilter,
                    paidStatus: enums_1.SalaryPaidStatus.PAID,
                },
            },
            { $group: { _id: null, total: { $sum: "$finalSalary" } } },
        ]),
        SalaryRecord_1.SalaryRecord.aggregate([
            {
                $match: {
                    ...salaryMonthFilter,
                    paidStatus: enums_1.SalaryPaidStatus.PENDING,
                },
            },
            { $group: { _id: null, total: { $sum: "$finalSalary" } } },
        ]),
        SalaryRecord_1.SalaryRecord.find(salaryMonthFilter)
            .populate("employeeId", "fullName")
            .populate("officeId", "name")
            .sort({ updatedAt: -1 })
            .limit(5),
        Advance_1.Advance.find(officeFilter)
            .populate("employeeId", "fullName")
            .sort({ createdAt: -1 })
            .limit(5),
        Employee_1.Employee.find(officeFilter)
            .populate("officeId", "name")
            .sort({ createdAt: -1 })
            .limit(5),
        SalaryRecord_1.SalaryRecord.aggregate([
            { $match: { ...officeFilter, $or: trendMatchers } },
            {
                $group: {
                    _id: { month: "$month", year: "$year" },
                    total: { $sum: "$finalSalary" },
                    paid: {
                        $sum: {
                            $cond: [
                                { $eq: ["$paidStatus", enums_1.SalaryPaidStatus.PAID] },
                                "$finalSalary",
                                0,
                            ],
                        },
                    },
                    pending: {
                        $sum: {
                            $cond: [
                                { $eq: ["$paidStatus", enums_1.SalaryPaidStatus.PENDING] },
                                "$finalSalary",
                                0,
                            ],
                        },
                    },
                },
            },
        ]),
        SalaryRecord_1.SalaryRecord.aggregate([
            { $match: salaryMonthFilter },
            {
                $group: {
                    _id: "$officeId",
                    total: { $sum: "$finalSalary" },
                    paid: {
                        $sum: {
                            $cond: [
                                { $eq: ["$paidStatus", enums_1.SalaryPaidStatus.PAID] },
                                "$finalSalary",
                                0,
                            ],
                        },
                    },
                    pending: {
                        $sum: {
                            $cond: [
                                { $eq: ["$paidStatus", enums_1.SalaryPaidStatus.PENDING] },
                                "$finalSalary",
                                0,
                            ],
                        },
                    },
                },
            },
            { $sort: { total: -1 } },
        ]),
        Advance_1.Advance.aggregate([
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
        Advance_1.Advance.aggregate([
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
    const offices = await Office_1.Office.find({ _id: { $in: officeIds } }).select("name");
    const officeMap = new Map(offices.map((o) => [o._id.toString(), o.name]));
    const trendMap = new Map(salaryTrendRaw.map((s) => [
        `${s._id.month}-${s._id.year}`,
        { total: s.total, paid: s.paid, pending: s.pending },
    ]));
    const salaryTrend = trendMonths.map((p) => {
        const key = `${p.month}-${p.year}`;
        const row = trendMap.get(key);
        return {
            label: periodLabel(p.month, p.year),
            total: row?.total ?? 0,
            paid: row?.paid ?? 0,
            pending: row?.pending ?? 0,
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
                advancesThisMonth: advancesInMonth[0]?.total ?? 0,
            },
            charts: {
                salaryTrend,
                officeWiseSalary: officeWiseSalary.map((o) => ({
                    office: officeMap.get(o._id?.toString() ?? "") ?? "Unknown",
                    total: o.total,
                    paid: o.paid,
                    pending: o.pending,
                })),
                advanceTrend,
                salaryStatus: {
                    paid: paidAmount,
                    pending: pendingAmount,
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
