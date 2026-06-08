"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendExcel = sendExcel;
exports.sendExcelMultiSheet = sendExcelMultiSheet;
exports.sendPdf = sendPdf;
const exceljs_1 = __importDefault(require("exceljs"));
const pdfkit_1 = __importDefault(require("pdfkit"));
async function sendExcel(res, filename, sheetName, headers, rows) {
    const workbook = new exceljs_1.default.Workbook();
    const sheet = workbook.addWorksheet(sheetName);
    sheet.addRow(headers);
    rows.forEach((row) => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true };
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
}
async function sendExcelMultiSheet(res, filename, sheets) {
    const workbook = new exceljs_1.default.Workbook();
    for (const { name, headers, rows } of sheets) {
        const sheet = workbook.addWorksheet(name);
        sheet.addRow(headers);
        rows.forEach((row) => sheet.addRow(row));
        sheet.getRow(1).font = { bold: true };
    }
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
}
function sendPdf(res, filename, title, headers, rows) {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    const doc = new pdfkit_1.default({ margin: 40, size: "A4" });
    doc.pipe(res);
    doc.fontSize(16).text(title, { align: "center" });
    doc.moveDown();
    const colWidth = (doc.page.width - 80) / headers.length;
    let y = doc.y;
    doc.fontSize(9).font("Helvetica-Bold");
    headers.forEach((h, i) => {
        doc.text(h, 40 + i * colWidth, y, { width: colWidth, align: "left" });
    });
    y += 16;
    doc.font("Helvetica");
    rows.forEach((row) => {
        if (y > doc.page.height - 60) {
            doc.addPage();
            y = 40;
        }
        row.forEach((cell, i) => {
            doc.text(String(cell), 40 + i * colWidth, y, {
                width: colWidth,
                align: "left",
            });
        });
        y += 14;
    });
    doc.end();
}
