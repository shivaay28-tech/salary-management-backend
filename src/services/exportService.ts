import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { Response } from "express";

export async function sendExcel(
  res: Response,
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number)[][]
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true };

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

export async function sendExcelMultiSheet(
  res: Response,
  filename: string,
  sheets: { name: string; headers: string[]; rows: (string | number)[][] }[]
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  for (const { name, headers, rows } of sheets) {
    const sheet = workbook.addWorksheet(name);
    sheet.addRow(headers);
    rows.forEach((row) => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true };
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

export function sendPdf(
  res: Response,
  filename: string,
  title: string,
  headers: string[],
  rows: (string | number)[][]
): void {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ margin: 40, size: "A4" });
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
