import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";
import bwipjs from "bwip-js";

export const BRAND = rgb(0.52, 0.25, 0.07);
export const INK = rgb(0.12, 0.1, 0.09);
export const MUTED = rgb(0.42, 0.38, 0.36);
export const LINE = rgb(0.85, 0.82, 0.79);

/** Standard PDF fonts only cover WinAnsi — normalise anything outside it. */
export function safe(text: string) {
  return text
    .replaceAll("₹", "Rs. ")
    .replaceAll("≥", ">=")
    .replaceAll("≤", "<=")
    .replaceAll("→", "->")
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, "");
}

export async function newDoc() {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const emblemBytes = await readFile(path.join(process.cwd(), "public", "brand", "emblem.png"));
  const emblem = await pdf.embedPng(emblemBytes);
  return { pdf, regular, bold, emblem };
}

export async function qrPng(pdf: PDFDocument, text: string) {
  const buf = await QRCode.toBuffer(text, { margin: 1, width: 300, errorCorrectionLevel: "M" });
  return pdf.embedPng(buf);
}

export async function barcodePng(pdf: PDFDocument, text: string) {
  const buf = await bwipjs.toBuffer({ bcid: "code128", text, scale: 3, height: 9, includetext: false });
  return pdf.embedPng(buf);
}

export function text(page: PDFPage, s: string, x: number, y: number, font: PDFFont, size = 9, color = INK) {
  page.drawText(safe(s), { x, y, size, font, color });
}

export function fit(s: string, font: PDFFont, size: number, max: number) {
  let out = safe(s);
  if (font.widthOfTextAtSize(out, size) <= max) return out;
  while (out.length > 1 && font.widthOfTextAtSize(out + "…", size) > max) out = out.slice(0, -1);
  return out + "…";
}

export function centered(page: PDFPage, s: string, y: number, font: PDFFont, size: number, color = INK) {
  const w = font.widthOfTextAtSize(safe(s), size);
  page.drawText(safe(s), { x: (page.getWidth() - w) / 2, y, size, font, color });
}

export function universityHeader(page: PDFPage, f: { regular: PDFFont; bold: PDFFont; emblem: import("pdf-lib").PDFImage }, title: string) {
  const { width, height } = page.getSize();
  page.drawImage(f.emblem, { x: 40, y: height - 102, width: 64, height: 64 });
  centered(page, "NATIONAL LAW UNIVERSITY AND JUDICIAL ACADEMY, ASSAM", height - 56, f.bold, 13, BRAND);
  centered(page, "Hajo Road, Amingaon, Kamrup (Rural), Guwahati - 781031, Assam", height - 72, f.regular, 8.5, MUTED);
  centered(page, "Office of the Controller of Examinations", height - 85, f.regular, 8.5, MUTED);
  page.drawRectangle({ x: 40, y: height - 128, width: width - 80, height: 20, color: BRAND });
  centered(page, title, height - 122, f.bold, 11, rgb(1, 1, 1));
  return height - 140;
}

export function istDate(iso: string | Date) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

export function istTime(iso: string | Date) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}
