import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/session";
import type { DocSpec } from "@/lib/admissions/shared";

const STAFF = ["ACADEMIC_STAFF", "REGISTRAR", "ADMIN", "HOD"];

async function specimen(label: string, name: string, appNo: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595, 842]);
  page.drawRectangle({ x: 40, y: 40, width: 515, height: 762, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1 });
  page.drawText("SPECIMEN", { x: 120, y: 360, size: 90, font: bold, color: rgb(0.93, 0.9, 0.86), rotate: degrees(30) });
  page.drawText(label, { x: 70, y: 740, size: 18, font: bold });
  page.drawText(`Applicant: ${name}`, { x: 70, y: 710, size: 12, font });
  page.drawText(`Application No. ${appNo}`, { x: 70, y: 692, size: 12, font });
  page.drawText("Synthetic document generated for the demonstration (no real upload).", { x: 70, y: 660, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  return pdf.save();
}

export async function GET(_: Request, ctx: RouteContext<"/api/admissions/doc/[docId]">) {
  const { docId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorised", { status: 401 });
  const doc = await db.applicationDocument.findUnique({ where: { id: docId }, include: { application: { include: { cycle: true } } } });
  if (!doc) return new Response("Not found", { status: 404 });
  if (!STAFF.includes(user.role) && doc.application.userId !== user.id) {
    await audit({ actorId: user.id, actorRole: user.role, action: "ACCESS_DENIED", entity: "Application", entityId: doc.applicationId, summary: "Attempted to open another applicant's document" });
    return new Response("Forbidden", { status: 403 });
  }
  const label = (doc.application.cycle.requiredDocs as unknown as DocSpec[]).find((d) => d.code === doc.code)?.label ?? doc.code;
  const bytes = doc.data ?? (await specimen(label, doc.application.name, doc.application.appNo));
  const mime = doc.data ? doc.mime : "application/pdf";
  return new Response(Buffer.from(bytes), { headers: { "Content-Type": mime, "Content-Disposition": `inline; filename="${doc.application.appNo.replaceAll("/", "-")}-${doc.code}.${mime === "application/pdf" ? "pdf" : mime.split("/")[1]}"`, "X-Content-Type-Options": "nosniff" } });
}
