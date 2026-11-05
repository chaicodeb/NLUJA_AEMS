import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/session";
import { renderAdmitCard } from "@/lib/pdf/admit-card";

const STAFF = ["ADMIN", "COE", "EXAM_STAFF", "REGISTRAR"];

export async function GET(_: Request, ctx: RouteContext<"/api/admit-card/[regId]">) {
  const { regId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorised", { status: 401 });
  const reg = await db.examRegistration.findUnique({ where: { id: regId }, include: { exam: true } });
  if (!reg) return new Response("Not found", { status: 404 });

  const own = user.studentId === reg.studentId || user.wardId === reg.studentId;
  if (!STAFF.includes(user.role) && !own) {
    await audit({ actorId: user.id, actorRole: user.role, action: "ACCESS_DENIED", entity: "AdmitCard", entityId: regId, summary: "Attempted to download another candidate's admit card" });
    return new Response("Forbidden", { status: 403 });
  }
  if (!reg.exam.admitCardsPublished && !STAFF.includes(user.role)) return new Response("Admit cards have not been published yet", { status: 409 });

  const doc = await db.document.findFirst({ where: { type: "ADMIT_CARD", refId: regId, revoked: false }, orderBy: { issuedAt: "desc" } });
  if (!doc) return new Response("Admit card not issued", { status: 404 });

  const bytes = await renderAdmitCard(doc);
  await audit({ actorId: user.id, actorRole: user.role, action: "ADMIT_CARD_DOWNLOADED", entity: "Document", entityId: doc.id, summary: `Admit card ${doc.verifyCode} downloaded` });
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="admit-card-${doc.verifyCode}.pdf"` },
  });
}
