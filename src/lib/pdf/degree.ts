import { rgb, StandardFonts, type PDFFont } from "pdf-lib";
import { appUrl, signHash } from "../docs";
import type { DegreePayload } from "../convocation/degree";
import { BRAND, INK, MUTED, hindiFonts, istDate, newDoc, qrPng, safe } from "./common";

const GOLD = rgb(0.71, 0.55, 0.2);

/** Hindi forms used on the bilingual certificate. */
const HI_DEGREE: Record<string, string> = {
  "Bachelor of Arts and Bachelor of Laws (Honours)": "कला स्नातक एवं विधि स्नातक (प्रतिष्ठा)",
  "Master of Laws": "विधि स्नातकोत्तर",
  "Doctor of Philosophy in Law": "विधि में विद्या वाचस्पति",
};
const HI_DIVISION: Record<string, string> = {
  "First Class with Distinction": "विशिष्टता सहित प्रथम श्रेणी",
  "First Class": "प्रथम श्रेणी",
  "Second Class": "द्वितीय श्रेणी",
  Pass: "उत्तीर्ण श्रेणी",
};

function ordinalDay(d: Date) {
  const n = Number(d.toLocaleDateString("en-IN", { day: "numeric", timeZone: "Asia/Kolkata" }));
  const s = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `${n}${s} day of ${d.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" })}`;
}

export async function renderDegree(doc: { verifyCode: string; payloadHash: string; issuedAt: Date; payload: unknown }) {
  const p = doc.payload as DegreePayload;
  const f = await newDoc();
  const serif = await f.pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await f.pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await f.pdf.embedFont(StandardFonts.TimesRomanItalic);
  const hi = await hindiFonts(f.pdf);
  const page = f.pdf.addPage([842, 595]);
  const { width, height } = page.getSize();
  const center = (s: string, y: number, font = serif, size = 14, color = INK) => {
    const t = safe(s);
    page.drawText(t, { x: (width - font.widthOfTextAtSize(t, size)) / 2, y, size, font, color });
  };
  const centerHi = (s: string, y: number, font: PDFFont, size: number, color = INK) => {
    page.drawText(s, { x: (width - font.widthOfTextAtSize(s, size)) / 2, y, size, font, color });
  };
  const degreeHi = HI_DEGREE[p.degree] ?? p.degree;
  const divisionHi = HI_DIVISION[p.division ?? "Pass"] ?? "";

  page.drawRectangle({ x: 18, y: 18, width: width - 36, height: height - 36, borderColor: BRAND, borderWidth: 3 });
  page.drawRectangle({ x: 26, y: 26, width: width - 52, height: height - 52, borderColor: GOLD, borderWidth: 1 });
  if (p.kind === "DEGREE") page.drawText("NLUJA", { x: width / 2 - 170, y: height / 2 - 60, size: 120, font: serifBold, color: rgb(0.96, 0.93, 0.88), opacity: 0.6 });

  page.drawImage(f.emblem, { x: width / 2 - 32, y: height - 104, width: 64, height: 64 });
  centerHi("राष्ट्रीय विधि विश्वविद्यालय एवं न्यायिक अकादमी, असम", height - 124, hi.bold, 15, BRAND);
  center("National Law University and Judicial Academy, Assam", height - 148, serifBold, 21, BRAND);
  center("Established under the National Law University and Judicial Academy, Assam Act, 2009", height - 162, serifItalic, 9.5, MUTED);

  if (p.kind === "PROVISIONAL") {
    centerHi("अनंतिम प्रमाणपत्र", height - 186, hi.bold, 13, INK);
    center("PROVISIONAL CERTIFICATE", height - 204, serifBold, 17, INK);
    center("This is to certify that", height - 232, serifItalic, 13);
    center(p.student.name, height - 262, serifBold, 26, INK);
    center(`(Roll No. ${p.student.rollNo} · University ID ${p.student.uid})`, height - 280, serif, 10, MUTED);
    center("has passed all the examinations prescribed for, and has fulfilled all the requirements of, the degree of", height - 306, serif, 13);
    center(p.degree, height - 332, serifBold, 18, BRAND);
    center(`in the year ${p.yearOfPassing}, securing a CGPA of ${p.cgpa.toFixed(2)} on a 10-point scale${p.division ? ` (${p.division})` : ""}.`, height - 356, serif, 13);
    center("The degree will be conferred at the next convocation of the University. This certificate is valid until then.", height - 378, serifItalic, 11, MUTED);
    centerHi(`प्रमाणित किया जाता है कि उपर्युक्त विद्यार्थी ने ${degreeHi} उपाधि की सभी अपेक्षाएँ पूर्ण कर ली हैं।`, height - 404, hi.regular, 12, INK);
  } else {
    center("This is to certify that", height - 194, serifItalic, 14);
    center(p.student.name, height - 230, serifBold, 30, INK);
    center(`(Roll No. ${p.student.rollNo} · University ID ${p.student.uid}${p.student.abcId ? ` · ABC ID ${p.student.abcId}` : ""})`, height - 248, serif, 10, MUTED);
    center("having been duly examined and found qualified, has this day been admitted to the degree of", height - 274, serif, 14);
    center(p.degree, height - 302, serifBold, 22, BRAND);
    center(`in the ${p.division ?? "Pass"} (CGPA ${p.cgpa.toFixed(2)} on a 10-point scale), having passed the examinations held in ${p.yearOfPassing}.`, height - 326, serif, 13);
    if (p.medals.length) center(`Awarded the ${p.medals.join(" and the ")}.`, height - 346, serifBold, 12, GOLD);
    if (p.convocation) center(`Given under the seal of the University at the ${p.convocation.title}, Guwahati, on this ${ordinalDay(new Date(p.convocation.date))}.`, height - 368, serifItalic, 12, INK);
    centerHi(`प्रमाणित किया जाता है कि उपर्युक्त विद्यार्थी को ${divisionHi} में ${degreeHi} की उपाधि प्रदान की गई है।`, height - 396, hi.regular, 12.5, INK);
  }

  const url = `${await appUrl()}/verify/${doc.verifyCode}`;
  const qr = await qrPng(f.pdf, url);
  page.drawImage(qr, { x: 52, y: 48, width: 84, height: 84 });
  page.drawText(safe(`Verify: ${doc.verifyCode}`), { x: 146, y: 116, size: 9, font: f.bold, color: INK });
  page.drawText(safe(p.serialNo ? `Serial No. ${p.serialNo}` : `Issued ${istDate(doc.issuedAt)}`), { x: 146, y: 102, size: 9, font: f.regular, color: INK });
  page.drawText(safe(url), { x: 146, y: 88, size: 7, font: f.regular, color: MUTED });
  page.drawText(safe(`SHA-256 ${doc.payloadHash.slice(0, 32)}…`), { x: 146, y: 76, size: 6.5, font: f.regular, color: MUTED });

  const sx = width - 300;
  page.drawLine({ start: { x: sx, y: 92 }, end: { x: sx + 240, y: 92 }, thickness: 0.6, color: MUTED });
  page.drawText(safe(`Digitally signed by ${p.signatory.name}`), { x: sx, y: 78, size: 9.5, font: f.bold, color: INK });
  page.drawText(safe(`${p.signatory.designation}, NLUJA, Assam`), { x: sx, y: 65, size: 9, font: f.regular, color: INK });
  page.drawText(safe(`Signed ${istDate(doc.issuedAt)} · Signature ID ${signHash(doc.payloadHash).slice(0, 16).toUpperCase()}`), { x: sx, y: 52, size: 7, font: f.regular, color: MUTED });

  return f.pdf.save();
}
