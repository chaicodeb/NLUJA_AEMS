import { degrees, rgb, type PDFPage } from "pdf-lib";
import type { TranscriptPayload } from "../results/transcript";
import { appUrl, signHash } from "../docs";
import { BRAND, INK, LINE, MUTED, barcodePng, fit, istDate, istTime, newDoc, qrPng, text, universityHeader } from "./common";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const ROW = 9.5;

export async function renderTranscript(doc: { verifyCode: string; payloadHash: string; issuedAt: Date; payload: unknown }) {
  const p = doc.payload as TranscriptPayload;
  const f = await newDoc();
  const official = p.variant === "OFFICIAL";
  const title = official ? "CONSOLIDATED TRANSCRIPT" : "CONSOLIDATED TRANSCRIPT — STUDENT COPY";

  const pages: PDFPage[] = [];
  const addPage = () => {
    const page = f.pdf.addPage([595.28, 841.89]);
    pages.push(page);
    if (!official) {
      page.drawText("STUDENT COPY", { x: 120, y: 330, size: 64, font: f.bold, color: rgb(0.55, 0.45, 0.4), opacity: 0.09, rotate: degrees(35) });
      page.drawText("NOT FOR OFFICIAL USE", { x: 150, y: 270, size: 30, font: f.bold, color: rgb(0.55, 0.45, 0.4), opacity: 0.09, rotate: degrees(35) });
    }
    return page;
  };

  let page = addPage();
  const { width } = page.getSize();
  let top = universityHeader(page, f, title);

  // Student block
  const details: [string, string][] = [
    ["Name", p.student.name],
    ["Roll No.", p.student.rollNo],
    ["University UID", p.student.uid],
    ["ABC ID", p.student.abcId ?? "—"],
    ["Programme", p.student.programme],
    ["Batch / Admitted", `${p.student.batch} / ${p.student.admissionYear}`],
  ];
  details.forEach(([k, v], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = col ? 320 : 40;
    text(page, k, x, top - row * 14, f.regular, 8, MUTED);
    text(page, fit(v, f.bold, 8.5, col ? 200 : 205), x + 75, top - row * 14, f.bold, 8.5);
  });
  top -= 46;
  text(page, fit(`Curriculum: ${p.curriculum}`, f.regular, 7.5, width - 80), 40, top, f.regular, 7.5, MUTED);
  if (official && p.purpose) text(page, fit(`Issued for: ${p.purpose}`, f.regular, 7.5, width - 80), 330, top, f.regular, 7.5, MUTED);
  top -= 12;

  // Semester blocks in two columns
  const colX = [40, 305];
  const colW = 250;
  const bottom = 210;
  let col = 0;
  let y = top;
  const colTop = () => (pages.length === 1 ? top : 790);

  for (const s of p.semesters) {
    const h = 22 + s.courses.length * ROW + 14;
    if (y - h < bottom) {
      if (col === 0) {
        col = 1;
        y = colTop();
      } else {
        page = addPage();
        col = 0;
        y = colTop();
      }
    }
    const x = colX[col];
    page.drawRectangle({ x, y: y - 10, width: colW, height: 13, color: rgb(0.96, 0.93, 0.89) });
    text(page, `SEMESTER ${ROMAN[s.semester] ?? s.semester}`, x + 4, y - 6.5, f.bold, 8, BRAND);
    const session = `Session ${s.session}`;
    text(page, session, x + colW - 4 - f.regular.widthOfTextAtSize(session, 7.5), y - 6.5, f.regular, 7.5, MUTED);
    y -= 22;
    for (const c of s.courses) {
      text(page, c.code, x + 3, y, f.regular, 7.5, MUTED);
      text(page, fit(c.title, f.regular, 7.5, 150), x + 36, y, f.regular, 7.5);
      text(page, String(c.credits), x + 192, y, f.regular, 7.5);
      text(page, c.grade, x + 210, y, f.bold, 7.5, c.gradePoint === 0 ? rgb(0.75, 0.1, 0.1) : INK);
      text(page, String(c.gradePoint), x + 234, y, f.regular, 7.5);
      y -= ROW;
    }
    page.drawLine({ start: { x, y: y + 6 }, end: { x: x + colW, y: y + 6 }, thickness: 0.5, color: LINE });
    text(page, `Credits ${s.earnedCredits}/${s.credits}   SGPA ${s.sgpa.toFixed(2)}   ${s.result}`, x + 3, y - 3, f.bold, 7.5, BRAND);
    y -= 14;
  }
  text(page, "Columns: code · course · credits · grade · grade point", 40, bottom + 4, f.regular, 6.5, MUTED);

  // Summary band (on the last page)
  let sy = bottom - 10;
  page.drawRectangle({ x: 40, y: sy - 36, width: width - 80, height: 40, borderColor: BRAND, borderWidth: 0.8, color: rgb(0.99, 0.97, 0.94) });
  const stats: [string, string, number][] = [
    ["Credits earned", `${p.earnedCredits}${p.requiredCredits ? ` / ${p.requiredCredits}` : ""}`, 100],
    ["CGPA", p.cgpa.toFixed(2), 80],
    ["Percentage (CGPA×10)", `${p.percentage.toFixed(2)}%`, 115],
    ["Classification", p.division ?? "Awarded on clearing all courses", width - 80 - 295],
  ];
  let sx0 = 48;
  for (const [k, v, w] of stats) {
    text(page, k, sx0, sy - 8, f.regular, 7.5, MUTED);
    const size = p.division || k !== "Classification" ? 10.5 : 8.5;
    text(page, fit(v, f.bold, size, w - 10), sx0, sy - 25, f.bold, size, BRAND);
    sx0 += w;
  }
  sy -= 48;
  text(page, `Status: ${p.status}`, 40, sy, f.bold, 8);
  sy -= 11;
  text(page, "Grades: O=10 · A+=9 · A=8 · B+=7 · B=6 · C=5 · F/AB/NA=0.  SGPA = sum(Ci×Gi)/sum(Ci);  CGPA = sum(Ci×Si)/sum(Ci).", 40, sy, f.regular, 6.5, MUTED);

  // Verification & signature
  const vy = sy - 14;
  const url = `${await appUrl()}/verify/${doc.verifyCode}`;
  const qr = await qrPng(f.pdf, url);
  page.drawImage(qr, { x: 40, y: vy - 82, width: 80, height: 80 });
  text(page, "Scan to verify this transcript", 130, vy - 12, f.bold, 8.5);
  text(page, `Verification code: ${doc.verifyCode}`, 130, vy - 25, f.regular, 8);
  text(page, fit(url, f.regular, 7, 200), 130, vy - 37, f.regular, 7, MUTED);
  const bar = await barcodePng(f.pdf, p.student.rollNo);
  page.drawImage(bar, { x: 130, y: vy - 72, width: 110, height: 20 });

  const sx = width - 40 - 190;
  page.drawRectangle({ x: sx, y: vy - 82, width: 190, height: 76, borderColor: BRAND, borderWidth: 0.8, color: rgb(0.99, 0.97, 0.94) });
  text(page, official ? "Digitally signed by" : "Generated from University records", sx + 10, vy - 20, f.regular, 7.5, MUTED);
  text(page, official ? "Controller of Examinations" : "Student self-service portal", sx + 10, vy - 33, f.bold, 9.5, BRAND);
  text(page, "NLUJA, Assam", sx + 10, vy - 45, f.regular, 8.5);
  text(page, `Issued: ${istDate(doc.issuedAt)} ${istTime(doc.issuedAt)} IST`, sx + 10, vy - 58, f.regular, 7.5, MUTED);
  text(page, `Signature ID: ${signHash(doc.payloadHash).slice(0, 20).toUpperCase()}`, sx + 10, vy - 70, f.regular, 7, MUTED);

  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: 40, y: 40 }, end: { x: width - 40, y: 40 }, thickness: 0.5, color: LINE });
    text(pg, official ? "Official transcript — computer-generated and digitally signed; verify using the QR code." : "Student copy for reference only. Official transcripts are issued by the Office of the Controller of Examinations.", 40, 28, f.regular, 6.5, MUTED);
    text(pg, `Page ${i + 1} of ${pages.length}`, width - 80, 28, f.regular, 6.5, MUTED);
  });
  return f.pdf.save();
}
