import { rgb } from "pdf-lib";
import type { AdmitCardPayload } from "../exams/admit-cards";
import { appUrl, signHash } from "../docs";
import { BRAND, LINE, MUTED, barcodePng, centered, fit, istDate, istTime, newDoc, qrPng, text, universityHeader } from "./common";

export async function renderAdmitCard(doc: { verifyCode: string; payloadHash: string; issuedAt: Date; payload: unknown }) {
  const p = doc.payload as AdmitCardPayload;
  const f = await newDoc();
  const page = f.pdf.addPage([595.28, 841.89]);
  const { width } = page.getSize();
  let y = universityHeader(page, f, "ADMIT CARD");
  centered(page, p.exam.name, y - 4, f.bold, 10.5);
  y -= 26;

  // Photograph placeholder
  const photo = { x: width - 40 - 88, y: y - 108, w: 88, h: 108 };
  page.drawRectangle({ x: photo.x, y: photo.y, width: photo.w, height: photo.h, borderColor: LINE, borderWidth: 1, color: rgb(0.97, 0.95, 0.93) });
  const initials = p.student.name.split(" ").map((s) => s[0]).join("").slice(0, 2);
  page.drawText(initials, { x: photo.x + photo.w / 2 - f.bold.widthOfTextAtSize(initials, 26) / 2, y: photo.y + 50, size: 26, font: f.bold, color: rgb(0.75, 0.68, 0.62) });
  text(page, "Photograph", photo.x + 22, photo.y + 10, f.regular, 7.5, MUTED);

  const rows: [string, string][] = [
    ["Name of Candidate", p.student.name],
    ["Roll No.", p.student.rollNo],
    ["University UID", p.student.uid],
    ["Programme", p.student.programme],
    ["Batch / Semester", `${p.student.batch} / Semester ${p.student.semester}`],
    ["Examination Centre", p.papers[0]?.centre ?? "To be notified"],
  ];
  let ry = y - 6;
  for (const [k, v] of rows) {
    text(page, k, 40, ry, f.regular, 9, MUTED);
    text(page, fit(v, f.bold, 9.5, photo.x - 175), 160, ry, f.bold, 9.5);
    ry -= 17;
  }
  const bar = await barcodePng(f.pdf, p.student.rollNo);
  page.drawImage(bar, { x: 160, y: ry - 22, width: 150, height: 26 });
  text(page, p.student.rollNo, 160, ry - 32, f.regular, 7, MUTED);
  y = Math.min(ry - 58, photo.y - 16);

  // Schedule table
  const cols = [
    { h: "#", w: 18 }, { h: "Date", w: 62 }, { h: "Time", w: 92 }, { h: "Code", w: 40 },
    { h: "Course", w: 175 }, { h: "Room", w: 72 }, { h: "Bench", w: 56 },
  ];
  const tableW = cols.reduce((a, c) => a + c.w, 0);
  page.drawRectangle({ x: 40, y: y - 4, width: tableW, height: 18, color: rgb(0.96, 0.93, 0.89) });
  let x = 44;
  for (const c of cols) {
    text(page, c.h, x, y + 1, f.bold, 8.5, BRAND);
    x += c.w;
  }
  y -= 20;
  p.papers.forEach((pp, i) => {
    const start = new Date(pp.date);
    const end = new Date(start.getTime() + pp.durationMins * 60000);
    const cells = [
      String(i + 1), istDate(pp.date), `${istTime(start)} - ${istTime(end)}`, pp.code, pp.title,
      pp.room.replace("Academic Block — ", ""), pp.bench.split("/")[1] ?? pp.bench,
    ];
    let cx = 44;
    cells.forEach((c, j) => {
      const font = j === 6 ? f.bold : f.regular;
      text(page, fit(c, font, 8.5, cols[j].w - 6), cx, y, font, 8.5);
      cx += cols[j].w;
    });
    page.drawLine({ start: { x: 40, y: y - 6 }, end: { x: 40 + tableW, y: y - 6 }, thickness: 0.5, color: LINE });
    y -= 18;
  });

  // Verification & signature
  y -= 14;
  const url = `${appUrl()}/verify/${doc.verifyCode}`;
  const qr = await qrPng(f.pdf, url);
  page.drawImage(qr, { x: 40, y: y - 92, width: 92, height: 92 });
  text(page, "Scan to verify centre, room and bench", 142, y - 14, f.bold, 8.5);
  text(page, `Verification code: ${doc.verifyCode}`, 142, y - 28, f.regular, 8.5);
  text(page, fit(url, f.regular, 7.5, 230), 142, y - 41, f.regular, 7.5, MUTED);
  text(page, `Document hash (SHA-256): ${doc.payloadHash.slice(0, 32)}…`, 142, y - 55, f.regular, 7, MUTED);

  const sx = width - 40 - 190;
  page.drawRectangle({ x: sx, y: y - 92, width: 190, height: 80, borderColor: BRAND, borderWidth: 0.8, color: rgb(0.99, 0.97, 0.94) });
  text(page, "Digitally signed by", sx + 10, y - 28, f.regular, 7.5, MUTED);
  text(page, "Controller of Examinations", sx + 10, y - 41, f.bold, 9.5, BRAND);
  text(page, "NLUJA, Assam", sx + 10, y - 53, f.regular, 8.5);
  text(page, `Signed: ${istDate(doc.issuedAt)} ${istTime(doc.issuedAt)} IST`, sx + 10, y - 67, f.regular, 7.5, MUTED);
  text(page, `Signature ID: ${signHash(doc.payloadHash).slice(0, 20).toUpperCase()}`, sx + 10, y - 80, f.regular, 7, MUTED);
  y -= 112;

  text(page, "Instructions to candidates", 40, y, f.bold, 9.5, BRAND);
  const instructions = [
    "Carry this admit card and your University identity card to every examination. Entry is not permitted without both.",
    "Report to the examination hall 30 minutes before commencement. No candidate will be admitted 30 minutes after the start.",
    "Mobile phones, smart watches and other electronic devices are strictly prohibited inside the examination hall.",
    "Write your roll number only in the space provided on the cover of the answer booklet. Do not write your name anywhere.",
    "Any attempt at unfair means will be dealt with under the University's Academic Misconduct Regulations.",
  ];
  y -= 14;
  instructions.forEach((s, i) => {
    text(page, `${i + 1}. ${s}`, 44, y, f.regular, 8);
    y -= 12;
  });

  page.drawLine({ start: { x: 40, y: 40 }, end: { x: width - 40, y: 40 }, thickness: 0.5, color: LINE });
  text(page, "This is a computer-generated, digitally signed document and does not require a physical signature.", 40, 28, f.regular, 7, MUTED);
  return f.pdf.save();
}
