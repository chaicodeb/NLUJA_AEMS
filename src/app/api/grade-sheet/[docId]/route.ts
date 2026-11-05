import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/session";
import { renderGradeSheet } from "@/lib/pdf/grade-sheet";

const STAFF = ["ADMIN", "COE", "EXAM_STAFF", "REGISTRAR", "VC"];

export async function GET(_: Request, ctx: RouteContext<"/api/grade-sheet/[docId]">) {
  const { docId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorised", { status: 401 });
  const doc = await db.document.findUnique({ where: { id: docId } });
  if (!doc || doc.type !== "GRADE_SHEET") return new Response("Not found", { status: 404 });
  const own = user.studentId === doc.studentId || user.wardId === doc.studentId;
  if (!STAFF.includes(user.role) && !own) {
    await audit({ actorId: user.id, actorRole: user.role, action: "ACCESS_DENIED", entity: "Document", entityId: docId, summary: "Attempted to download another student's grade sheet" });
    return new Response("Forbidden", { status: 403 });
  }
  const bytes = await renderGradeSheet(doc);
  await audit({ actorId: user.id, actorRole: user.role, action: "GRADE_SHEET_DOWNLOADED", entity: "Document", entityId: doc.id, summary: `Grade sheet ${doc.verifyCode} downloaded` });
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="grade-sheet-${doc.verifyCode}.pdf"` },
  });
}
