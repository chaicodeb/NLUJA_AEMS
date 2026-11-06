import { rgb } from "pdf-lib";
import { appUrl } from "../docs";
import { BRAND, INK, MUTED, fit, istDate, newDoc, qrPng, safe } from "./common";

export type IdCardPayload = { name: string; rollNo: string; uid: string; programme: string; batch: string; dob: string | null; validUntil: string; issuedOn: string };

/** CR80 card (85.6 × 54 mm), front side. */
export async function renderIdCard(doc: { verifyCode: string; payload: unknown }) {
  const p = doc.payload as IdCardPayload;
  const f = await newDoc();
  const page = f.pdf.addPage([243, 153]);
  const W = 243;
  page.drawRectangle({ x: 0, y: 0, width: W, height: 153, color: rgb(1, 0.99, 0.97) });
  page.drawRectangle({ x: 0, y: 121, width: W, height: 32, color: BRAND });
  page.drawImage(f.emblem, { x: 6, y: 124, width: 26, height: 26 });
  page.drawText(safe("National Law University and Judicial Academy, Assam"), { x: 37, y: 140, size: 7, font: f.bold, color: rgb(1, 1, 1) });
  page.drawText(safe("STUDENT IDENTITY CARD"), { x: 37, y: 129, size: 6.5, font: f.regular, color: rgb(1, 0.93, 0.85) });

  const parts = p.name.split(" ").filter(Boolean);
  const initials = `${parts[0][0]}${parts.length > 1 ? parts.at(-1)![0] : ""}`.toUpperCase();
  const shrink = (s: string, font: typeof f.bold, size: number, max: number, min: number) => {
    let z = size;
    while (z > min && font.widthOfTextAtSize(safe(s), z) > max) z -= 0.25;
    return z;
  };
  page.drawRectangle({ x: 10, y: 36, width: 56, height: 72, color: rgb(0.93, 0.9, 0.86), borderColor: MUTED, borderWidth: 0.4 });
  page.drawText(initials, { x: 38 - f.bold.widthOfTextAtSize(initials, 20) / 2, y: 66, size: 20, font: f.bold, color: MUTED });
  page.drawText("PHOTO", { x: 38 - f.regular.widthOfTextAtSize("PHOTO", 5) / 2, y: 40, size: 5, font: f.regular, color: MUTED });

  const x = 74;
  const nameSize = shrink(p.name, f.bold, 9.5, W - x - 8, 6.5);
  page.drawText(fit(p.name, f.bold, nameSize, W - x - 8), { x, y: 104, size: nameSize, font: f.bold, color: INK });
  const rows: [string, string][] = [
    ["Programme", p.programme],
    ["Batch", p.batch],
    ["Roll No.", p.rollNo],
    ["University ID", p.uid],
    ...(p.dob ? ([["Date of birth", istDate(p.dob)]] as [string, string][]) : []),
    ["Valid until", istDate(p.validUntil)],
  ];
  rows.forEach(([k, v], i) => {
    const y = 92 - i * 10;
    page.drawText(safe(k), { x, y, size: 5.5, font: f.regular, color: MUTED });
    const max = y > 52 ? W - x - 48 : 70;
    const size = shrink(v, f.bold, 6.2, max, 4.8);
    page.drawText(fit(v, f.bold, size, max), { x: x + 40, y, size, font: f.bold, color: INK });
  });

  const url = `${await appUrl()}/verify/${doc.verifyCode}`;
  const qr = await qrPng(f.pdf, url);
  page.drawImage(qr, { x: W - 52, y: 8, width: 44, height: 44 });
  page.drawText(safe(`Verify ${doc.verifyCode}`), { x: 10, y: 22, size: 5.5, font: f.bold, color: INK });
  page.drawText(safe("If found, please return to the Registrar, NLUJA, Amingaon, Guwahati 781031"), { x: 10, y: 12, size: 4.6, font: f.regular, color: MUTED });
  page.drawRectangle({ x: 0, y: 0, width: W, height: 4, color: BRAND });
  return f.pdf.save();
}
