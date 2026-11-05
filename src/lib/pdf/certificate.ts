import { StandardFonts } from "pdf-lib";
import { appUrl, signHash } from "../docs";
import type { ExitCertificatePayload } from "../exit/exit";
import { BRAND, INK, MUTED, istDate, newDoc, qrPng, safe } from "./common";

function wrap(text: string, width: number, measure: (s: string) => number) {
  const lines: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    const next = line ? `${line} ${w}` : w;
    if (measure(next) > width && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Migration and character certificates (A4 portrait). */
export async function renderCertificate(doc: { verifyCode: string; payloadHash: string; issuedAt: Date; payload: unknown }) {
  const p = doc.payload as ExitCertificatePayload;
  const f = await newDoc();
  const serif = await f.pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await f.pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await f.pdf.embedFont(StandardFonts.TimesRomanItalic);
  const page = f.pdf.addPage([595, 842]);
  const { width, height } = page.getSize();
  const center = (s: string, y: number, font = serif, size = 12, color = INK) => {
    const t = safe(s);
    page.drawText(t, { x: (width - font.widthOfTextAtSize(t, size)) / 2, y, size, font, color });
  };

  page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: BRAND, borderWidth: 2 });
  page.drawImage(f.emblem, { x: width / 2 - 30, y: height - 104, width: 60, height: 60 });
  center("National Law University and Judicial Academy, Assam", height - 126, serifBold, 17, BRAND);
  center("Office of the Registrar · Amingaon, Guwahati 781031", height - 142, serifItalic, 10, MUTED);
  page.drawText(safe(`No. ${p.serialNo}`), { x: 60, y: height - 176, size: 10, font: f.regular, color: INK });
  const dated = `Date: ${istDate(new Date(p.issuedOn))}`;
  page.drawText(safe(dated), { x: width - 60 - f.regular.widthOfTextAtSize(safe(dated), 10), y: height - 176, size: 10, font: f.regular, color: INK });
  center(p.kind === "MIGRATION" ? "MIGRATION CERTIFICATE" : "CHARACTER CERTIFICATE", height - 220, serifBold, 18, INK);

  const [they, their] = p.student.gender === "F" ? ["she", "her"] : p.student.gender === "M" ? ["he", "his"] : ["they", "their"];
  const parent = p.student.parentName ? `, ${p.student.gender === "F" ? "daughter" : p.student.gender === "M" ? "son" : "ward"} of ${p.student.parentName},` : "";
  const body =
    p.kind === "MIGRATION"
      ? [
          `This is to certify that ${p.student.name}${parent} bearing Roll No. ${p.student.rollNo} and University ID ${p.student.uid}, was a bona fide student of this University in the ${p.programme} during ${p.period}.`,
          `The University has no objection to ${their} migrating to any other University or institution recognised by law. The last examination taken was ${p.lastExamination}. Reason for leaving: ${p.exitType.toLowerCase()}.`,
          `${they[0].toUpperCase()}${they.slice(1)} has obtained no-dues clearance from the Library, Hostel, Accounts and Examination Branch of the University.`,
        ]
      : [
          `This is to certify that ${p.student.name}${parent} bearing Roll No. ${p.student.rollNo}, was a bona fide student of this University in the ${p.programme} during ${p.period}.`,
          `To the best of my knowledge, ${they} ${they === "they" ? "bear" : "bears"} a ${p.conduct} moral character. No disciplinary proceedings are pending against ${p.student.gender === "F" ? "her" : p.student.gender === "M" ? "him" : "them"} and nothing adverse is on record.`,
          `I wish ${p.student.gender === "F" ? "her" : p.student.gender === "M" ? "him" : "them"} every success in life.`,
        ];
  let y = height - 270;
  for (const para of body) {
    for (const line of wrap(safe(para), width - 140, (s) => serif.widthOfTextAtSize(s, 12.5))) {
      page.drawText(line, { x: 70, y, size: 12.5, font: serif, color: INK, lineHeight: 18 });
      y -= 19;
    }
    y -= 12;
  }

  const sx = width - 280;
  page.drawLine({ start: { x: sx, y: 262 }, end: { x: sx + 220, y: 262 }, thickness: 0.6, color: MUTED });
  page.drawText(safe(`Digitally signed by ${p.signatory.name}`), { x: sx, y: 248, size: 10, font: f.bold, color: INK });
  page.drawText(safe(`${p.signatory.designation}, NLUJA, Assam`), { x: sx, y: 234, size: 9.5, font: f.regular, color: INK });
  page.drawText(safe(`Signature ID ${signHash(doc.payloadHash).slice(0, 16).toUpperCase()}`), { x: sx, y: 221, size: 7.5, font: f.regular, color: MUTED });

  const url = `${await appUrl()}/verify/${doc.verifyCode}`;
  const qr = await qrPng(f.pdf, url);
  page.drawImage(qr, { x: 60, y: 60, width: 84, height: 84 });
  page.drawText(safe(`Verify: ${doc.verifyCode}`), { x: 154, y: 128, size: 9, font: f.bold, color: INK });
  page.drawText(safe(url), { x: 154, y: 114, size: 7, font: f.regular, color: MUTED });
  page.drawText(safe(`SHA-256 ${doc.payloadHash.slice(0, 32)}…`), { x: 154, y: 102, size: 6.5, font: f.regular, color: MUTED });
  page.drawText(safe("Scan the QR code or visit the link to confirm this certificate has not been altered or revoked."), { x: 154, y: 88, size: 7, font: f.regular, color: MUTED });

  return f.pdf.save();
}
