import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { issueDocument } from "@/lib/docs";
import { getCurrentUser } from "@/lib/session";
import { renderIdCard, type IdCardPayload } from "@/lib/pdf/idcard";

const SHORT: Record<string, string> = { BALLB: "B.A. LL.B. (Hons.)", LLM: "LL.M. (One Year)", PHD: "Ph.D. (Law)" };

/** The student's own ID card; issued (and registered for QR verification) on first download. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorised", { status: 401 });
  if (user.role !== "STUDENT" || !user.studentId) return new Response("Forbidden", { status: 403 });
  const student = await db.student.findUniqueOrThrow({ where: { id: user.studentId }, include: { batch: { include: { programme: true } } } });
  let doc = await db.document.findFirst({ where: { studentId: student.id, type: "ID_CARD", revoked: false }, orderBy: { issuedAt: "desc" } });
  const current = doc?.payload as IdCardPayload | undefined;
  if (!doc || current?.name !== student.name || current?.rollNo !== student.rollNo) {
    if (doc) await db.document.update({ where: { id: doc.id }, data: { revoked: true } });
    const endYear = student.batch.admissionYear + Math.ceil(student.batch.programme.durationSemesters / 2);
    const payload: IdCardPayload = {
      name: student.name, rollNo: student.rollNo, uid: student.uid, programme: SHORT[student.batch.programme.code] ?? student.batch.programme.name, batch: student.batch.name,
      dob: student.dob?.toISOString() ?? null, validUntil: new Date(Date.UTC(endYear, 5, 30)).toISOString(), issuedOn: new Date().toISOString(),
    };
    doc = await issueDocument({ type: "ID_CARD", studentId: student.id, payload, issuedById: user.id });
    await audit({ actorId: user.id, actorRole: user.role, action: "ID_CARD_ISSUED", entity: "Document", entityId: doc.id, summary: `Student identity card ${doc.verifyCode} issued to ${student.name} (${student.rollNo})` });
  }
  const bytes = await renderIdCard(doc);
  return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="id-card-${student.rollNo}.pdf"` } });
}
