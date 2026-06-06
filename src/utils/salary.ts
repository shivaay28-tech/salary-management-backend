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
