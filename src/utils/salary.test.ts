import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateProRataBaseSalary,
  getDaysInMonth,
  isEmployeePayableInMonth,
} from "./salary";

function d(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

describe("calculateProRataBaseSalary", () => {
  it("returns full month when joined before month with no exit", () => {
    const result = calculateProRataBaseSalary({
      monthlySalary: 31000,
      dateOfJoining: d("2024-01-01"),
      month: 3,
      year: 2024,
    });

    assert.equal(result.baseSalary, 31000);
    assert.equal(result.payableDays, 31);
    assert.equal(result.daysInMonth, 31);
    assert.equal(result.isProRata, false);
    assert.equal(result.isPayable, true);
  });

  it("prorates mid-month join with inclusive join day", () => {
    const result = calculateProRataBaseSalary({
      monthlySalary: 31000,
      dateOfJoining: d("2024-01-15"),
      month: 1,
      year: 2024,
    });

    assert.equal(result.payableDays, 17);
    assert.equal(result.baseSalary, 17000);
    assert.equal(result.isProRata, true);
    assert.equal(result.isPayable, true);
  });

  it("prorates mid-month exit through out date inclusive", () => {
    const result = calculateProRataBaseSalary({
      monthlySalary: 30000,
      dateOfJoining: d("2023-06-01"),
      outDate: d("2024-03-10"),
      month: 3,
      year: 2024,
    });

    assert.equal(result.payableDays, 10);
    assert.equal(result.baseSalary, 9677);
    assert.equal(result.isProRata, true);
    assert.equal(result.isPayable, true);
  });

  it("prorates join and exit in the same month", () => {
    const result = calculateProRataBaseSalary({
      monthlySalary: 31000,
      dateOfJoining: d("2024-02-10"),
      outDate: d("2024-02-20"),
      month: 2,
      year: 2024,
    });

    assert.equal(result.payableDays, 11);
    assert.equal(result.baseSalary, 11759);
    assert.equal(result.isProRata, true);
    assert.equal(result.isPayable, true);
  });

  it("is not payable when joined after month ends", () => {
    const result = calculateProRataBaseSalary({
      monthlySalary: 25000,
      dateOfJoining: d("2024-03-05"),
      month: 2,
      year: 2024,
    });

    assert.equal(result.isPayable, false);
    assert.equal(result.baseSalary, 0);
    assert.equal(isEmployeePayableInMonth({ dateOfJoining: d("2024-03-05") }, 2, 2024), false);
  });

  it("is not payable when exit is before month starts", () => {
    const result = calculateProRataBaseSalary({
      monthlySalary: 25000,
      dateOfJoining: d("2024-01-01"),
      outDate: d("2024-02-28"),
      month: 3,
      year: 2024,
    });

    assert.equal(result.isPayable, false);
    assert.equal(result.baseSalary, 0);
  });
});

describe("getDaysInMonth", () => {
  it("returns correct days for leap year February", () => {
    assert.equal(getDaysInMonth(2, 2024), 29);
    assert.equal(getDaysInMonth(2, 2023), 28);
  });
});
