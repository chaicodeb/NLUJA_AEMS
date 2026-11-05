import { degrees, rgb } from "pdf-lib";
import type { GradeSheetPayload } from "../results/workflow";
import { appUrl, signHash } from "../docs";
import { BRAND, LINE, MUTED, barcodePng, centered, fit, istDate, istTime, newDoc, qrPng, text, universityHeader } from "./common";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export async function renderGradeSheet(doc: { verifyCode: string; payloadHash: string; issuedAt: Date; payload: unknown; isDuplicate: boolean }) {
  const p = doc.payload as GradeSheetPayload;
  const f = await newDoc();
  const page = f.pdf.addPage([595.28, 841.89]);
  const { width } = page.getSize();
  let y = universityHeader(page, f, `GRADE SHEET — SEMESTER ${ROMAN[p.semester] ?? p.semester}`);
  centered(page, p.exam.name, y - 4, f.bold, 10);
  y -= 24;

  if (doc.isDuplicate) {
    page.drawText("DUPLICATE", { x: 150, y: 380, size: 90, font: f.bold, color: rgb(0.85, 0.2, 0.2), opacity: 0.12, rotate: degrees(35) });
  }

  const left: [string, string][] = [
    ["Name", p.student.name],
    ["Roll No.", p.student.rollNo],
    ["Programme", p.student.programme],
  ];
  const right: [string, string][] = [
    ["University UID", p.student.uid],
    ["ABC ID", p.student.abcId ?? "—"],
    ["Batch", p.student.batch],
  ];
  left.forEach(([k, v], i) => {
    text(page, k, 40, y - i * 15, f.regular, 8.5, MUTED);
    text(page, fit(v, f.bold, 9, 215), 100, y - i * 15, f.bold, 9);
  });
  right.forEach(([k, v], i) => {
    text(page, k, 330, y - i * 15, f.regular, 8.5, MUTED);
    text(page, fit(v, f.bold, 9, 160), 400, y - i * 15, f.bold, 9);
  });
  const bar = await barcodePng(f.pdf, p.student.rollNo);
  y -= 58;

  const cols = [
    { h: "Code", w: 48 }, { h: "Course title", w: 236 }, { h: "Credits", w: 46, r: true }, { h: "Marks", w: 52, r: true },
    { h: "Grade", w: 44, r: true }, { h: "Grade pt.", w: 50, r: true }, { h: "Cr. pts.", w: 39, r: true },
  ];
  const tableW = cols.reduce((a, c) => a + c.w, 0);
  page.drawRectangle({ x: 40, y: y - 5, width: tableW, height: 19, color: rgb(0.96, 0.93, 0.89) });
  let x = 40;
  for (const c of cols) {
    const w = f.bold.widthOfTextAtSize(c.h, 8.5);
    text(page, c.h, c.r ? x + c.w - w - 6 : x + 5, y + 1, f.bold, 8.5, BRAND);
    x += c.w;
  }
  y -= 21;
  for (const c of p.courses) {
    const cells = [c.code, c.title, String(c.credits), c.status === "PASS" || c.status === "FAIL" ? `${c.total}/${c.max}` : "—", c.grade, c.gradePoint.toFixed(0), (c.credits * c.gradePoint).toFixed(0)];
    let cx = 40;
    cells.forEach((cell, j) => {
      const font = j === 4 ? f.bold : f.regular;
      const s = fit(cell, font, 8.5, cols[j].w - 10);
      const w = font.widthOfTextAtSize(s, 8.5);
      text(page, s, cols[j].r ? cx + cols[j].w - w - 6 : cx + 5, y, font, 8.5, j === 4 && c.gradePoint === 0 ? rgb(0.75, 0.1, 0.1) : undefined);
      cx += cols[j].w;
    });
    page.drawLine({ start: { x: 40, y: y - 6 }, end: { x: 40 + tableW, y: y - 6 }, thickness: 0.5, color: LINE });
    y -= 18;
  }

  // Summary band
  y -= 6;
  page.drawRectangle({ x: 40, y: y - 34, width: tableW, height: 40, borderColor: BRAND, borderWidth: 0.8, color: rgb(0.99, 0.97, 0.94) });
  const stats: [string, string][] = [
    ["Credits registered", String(p.credits)],
    ["Credits earned", String(p.earnedCredits)],
    ["SGPA", p.sgpa.toFixed(2)],
    ["CGPA", p.cgpa.toFixed(2)],
    ["Result", p.result === "PASS" ? "PASS" : "FAIL (backlog)"],
  ];
  const sw = tableW / stats.length;
  stats.forEach(([k, v], i) => {
    text(page, k, 48 + i * sw, y - 6, f.regular, 7.5, MUTED);
    text(page, v, 48 + i * sw, y - 23, f.bold, 12, i === 4 && p.result !== "PASS" ? rgb(0.75, 0.1, 0.1) : BRAND);
  });
  y -= 50;
  if (p.division) text(page, `Classification: ${p.division}  ·  Percentage equivalent (CGPA x 10): ${(p.cgpa * 10).toFixed(2)}%`, 40, y, f.regular, 8.5);
  y -= 14;
  if (p.history.length) {
    text(page, `Previous semesters (SGPA): ${p.history.map((h) => `${ROMAN[h.semester]}: ${h.sgpa.toFixed(2)}`).join("   ")}`, 40, y, f.regular, 7.5, MUTED);
    y -= 14;
  }

  // Legends
  y -= 6;
  text(page, "Grading (10-point absolute scale): O 80+ = 10 · A+ 70–79.99 = 9 · A 65–69.99 = 8 · B+ 60–64.99 = 7 · B 55–59.99 = 6 · C 50–54.99 = 5 · F < 50 = 0", 40, y, f.regular, 7, MUTED);
  y -= 11;
  text(page, "AB Absent · NA Not allowed (attendance) · R Repeat · W Withheld · I Improvement · F Failed.  SGPA = sum(Ci×Gi) / sum(Ci) ;  CGPA = sum(Ci×Si) / sum(Ci)", 40, y, f.regular, 7, MUTED);
  y -= 26;

  // Verification & signature
  const url = `${await appUrl()}/verify/${doc.verifyCode}`;
  const qr = await qrPng(f.pdf, url);
  page.drawImage(qr, { x: 40, y: y - 90, width: 90, height: 90 });
  text(page, "Scan to verify this grade sheet", 140, y - 14, f.bold, 8.5);
  text(page, `Verification code: ${doc.verifyCode}`, 140, y - 28, f.regular, 8.5);
  text(page, fit(url, f.regular, 7.5, 220), 140, y - 41, f.regular, 7.5, MUTED);
  text(page, `SHA-256: ${doc.payloadHash.slice(0, 32)}…`, 140, y - 54, f.regular, 7, MUTED);
  page.drawImage(bar, { x: 140, y: y - 86, width: 120, height: 22 });

  const sx = width - 40 - 190;
  page.drawRectangle({ x: sx, y: y - 90, width: 190, height: 80, borderColor: BRAND, borderWidth: 0.8, color: rgb(0.99, 0.97, 0.94) });
  text(page, "Digitally signed by", sx + 10, y - 26, f.regular, 7.5, MUTED);
  text(page, "Controller of Examinations", sx + 10, y - 39, f.bold, 9.5, BRAND);
  text(page, "NLUJA, Assam", sx + 10, y - 51, f.regular, 8.5);
  text(page, `Signed: ${istDate(doc.issuedAt)} ${istTime(doc.issuedAt)} IST`, sx + 10, y - 65, f.regular, 7.5, MUTED);
  text(page, `Signature ID: ${signHash(doc.payloadHash).slice(0, 20).toUpperCase()}`, sx + 10, y - 78, f.regular, 7, MUTED);

  page.drawLine({ start: { x: 40, y: 40 }, end: { x: width - 40, y: 40 }, thickness: 0.5, color: LINE });
  text(page, "Computer-generated and digitally signed. Also available in the student's DigiLocker (National Academic Depository).", 40, 28, f.regular, 7, MUTED);
  return f.pdf.save();
}
