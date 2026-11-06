import { degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { QPContent } from "../exams/question-paper-checks";
import { BRAND, LINE, MUTED, centered, istDate, istTime, newDoc, safe, text, universityHeader } from "./common";

export type QuestionPaperPdfInput = {
  examName: string;
  code: string;
  title: string;
  programme: string;
  date: Date;
  session: string;
  durationMins: number;
  maxMarks: number;
  content: QPContent;
  /** Diagonal watermark on every page (drafts and previews). */
  watermark?: string;
  /** Printed at the foot of every page: who generated this copy and when. */
  footer: string;
};

function wrap(s: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const para of safe(s).split(/\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

export async function renderQuestionPaper(p: QuestionPaperPdfInput) {
  const f = await newDoc();
  const pages: PDFPage[] = [];
  const W = 595.28;
  const H = 841.89;
  const left = 48;
  const right = W - 48;
  const textW = right - left - 70;

  const addPage = () => {
    const page = f.pdf.addPage([W, H]);
    pages.push(page);
    return page;
  };
  let page = addPage();
  let y = universityHeader(page, f, "END SEMESTER EXAMINATION — QUESTION PAPER");
  centered(page, p.examName, y - 4, f.bold, 10.5);
  y -= 24;
  centered(page, `${p.code} — ${p.title}`, y, f.bold, 12, BRAND);
  y -= 15;
  centered(page, p.programme, y, f.regular, 9, MUTED);
  y -= 22;
  const hrs = p.durationMins / 60;
  text(page, `Time: ${Number.isInteger(hrs) ? hrs : hrs.toFixed(1)} hours`, left, y, f.bold, 9.5);
  centered(page, `${istDate(p.date)} · ${p.session === "FN" ? "Forenoon" : "Afternoon"} (${istTime(p.date)})`, y, f.regular, 9);
  const mm = `Maximum Marks: ${p.maxMarks}`;
  text(page, mm, right - f.bold.widthOfTextAtSize(mm, 9.5), y, f.bold, 9.5);
  y -= 10;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.8, color: BRAND });
  y -= 16;

  const ensure = (need: number) => {
    if (y - need > 60) return;
    page = addPage();
    y = H - 60;
  };

  text(page, "Instructions to candidates", left, y, f.bold, 9.5, BRAND);
  y -= 13;
  for (const line of wrap(p.content.instructions, f.regular, 9, right - left)) {
    ensure(12);
    text(page, line, left, y, f.regular, 9);
    y -= 12;
  }
  y -= 10;

  const block = (label: string, body: string, marks?: number) => {
    const lines = wrap(body || "—", f.regular, 10, textW);
    ensure(lines.length * 13 + 6);
    text(page, label, left, y, f.bold, 10);
    if (marks != null) {
      const m = `[${marks}]`;
      text(page, m, right - f.bold.widthOfTextAtSize(m, 10), y, f.bold, 10);
    }
    for (const line of lines) {
      text(page, line, left + 34, y, f.regular, 10);
      y -= 13;
    }
    y -= 4;
  };

  for (const q of p.content.questions) {
    if (q.orText !== undefined) {
      block(`${q.no}. (a)`, q.text, q.marks);
      ensure(16);
      centered(page, "OR", y, f.bold, 9.5, MUTED);
      y -= 15;
      block("     (b)", q.orText, q.marks);
    } else block(`${q.no}.`, q.text, q.marks);
    y -= 6;
  }
  ensure(30);
  centered(page, "*** End of question paper ***", y - 6, f.bold, 9, MUTED);

  pages.forEach((pg, i) => {
    if (p.watermark) {
      const angle = (36 * Math.PI) / 180;
      const size = Math.min(46, (W * 0.85) / Math.cos(angle) / f.bold.widthOfTextAtSize(p.watermark, 1));
      const w = f.bold.widthOfTextAtSize(p.watermark, size);
      pg.drawText(p.watermark, { x: W / 2 - (w * Math.cos(angle)) / 2 + (size / 2) * Math.sin(angle), y: H / 2 - (w * Math.sin(angle)) / 2 - (size / 2) * Math.cos(angle), size, font: f.bold, color: rgb(0.8, 0.1, 0.1), opacity: 0.13, rotate: degrees(36) });
    }
    pg.drawLine({ start: { x: left, y: 44 }, end: { x: right, y: 44 }, thickness: 0.5, color: LINE });
    text(pg, p.footer.slice(0, 150), left, 32, f.regular, 6.8, MUTED);
    const n = `Page ${i + 1} of ${pages.length}`;
    text(pg, n, right - f.regular.widthOfTextAtSize(n, 7), 32, f.regular, 7, MUTED);
  });
  return f.pdf.save();
}
