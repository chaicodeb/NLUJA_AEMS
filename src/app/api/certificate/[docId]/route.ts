import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/session";
import { renderCertificate } from "@/lib/pdf/certificate";

const STAFF = ["ADMIN", "REGISTRAR", "VC", "ACADEMIC_STAFF"];

export async function GET(_: Request, ctx: RouteContext<"/api/certificate/[docId]">) {
  const { docId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorised", { status: 401 });
  const doc = await db.document.findUnique({ where: { id: docId } });
  if (!doc || !["MIGRATION", "CHARACTER"].includes(doc.type)) return new Response("Not found", { status: 404 });
  const own = user.studentId === doc.studentId || user.wardId === doc.studentId;
  if (!STAFF.includes(user.role) && !own) {
    await audit({ actorId: user.id, actorRole: user.role, action: "ACCESS_DENIED", entity: "Document", entityId: docId, summary: "Attempted to download another student's certificate" });
    return new Response("Forbidden", { status: 403 });
  }
  const bytes = await renderCertificate(doc);
  await audit({ actorId: user.id, actorRole: user.role, action: "CERTIFICATE_DOWNLOADED", entity: "Document", entityId: doc.id, summary: `${doc.type === "MIGRATION" ? "Migration" : "Character"} certificate ${doc.verifyCode} downloaded` });
  return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${doc.type.toLowerCase()}-${doc.verifyCode}.pdf"` } });
}
