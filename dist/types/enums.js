"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SalaryPaymentMode = exports.AdvanceRecoveryMode = exports.SalaryPaidStatus = exports.EmployeeStatus = exports.OfficeStatus = exports.UserRole = void 0;
var UserRole;
(function (UserRole) {
    UserRole["SUPER_ADMIN"] = "super_admin";
    UserRole["SUB_ADMIN"] = "sub_admin";
})(UserRole || (exports.UserRole = UserRole = {}));
var OfficeStatus;
(function (OfficeStatus) {
    OfficeStatus["ACTIVE"] = "active";
    OfficeStatus["INACTIVE"] = "inactive";
})(OfficeStatus || (exports.OfficeStatus = OfficeStatus = {}));
var EmployeeStatus;
(function (EmployeeStatus) {
    EmployeeStatus["ACTIVE"] = "active";
    EmployeeStatus["INACTIVE"] = "inactive";
})(EmployeeStatus || (exports.EmployeeStatus = EmployeeStatus = {}));
var SalaryPaidStatus;
(function (SalaryPaidStatus) {
    SalaryPaidStatus["PENDING"] = "pending";
    SalaryPaidStatus["PAID"] = "paid";
    SalaryPaidStatus["DEFERRED"] = "deferred";
    SalaryPaidStatus["SKIPPED"] = "skipped";
})(SalaryPaidStatus || (exports.SalaryPaidStatus = SalaryPaidStatus = {}));
var AdvanceRecoveryMode;
(function (AdvanceRecoveryMode) {
    AdvanceRecoveryMode["FULL"] = "full";
    AdvanceRecoveryMode["INSTALLMENT"] = "installment";
    AdvanceRecoveryMode["CUSTOM"] = "custom";
})(AdvanceRecoveryMode || (exports.AdvanceRecoveryMode = AdvanceRecoveryMode = {}));
var SalaryPaymentMode;
(function (SalaryPaymentMode) {
    SalaryPaymentMode["BANK"] = "bank";
    SalaryPaymentMode["ANGADIYA"] = "angadiya";
    SalaryPaymentMode["CASH_IN_HAND"] = "cash_in_hand";
})(SalaryPaymentMode || (exports.SalaryPaymentMode = SalaryPaymentMode = {}));
