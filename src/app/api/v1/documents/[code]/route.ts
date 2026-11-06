import { db } from "@/lib/db";
import { verifyDocument } from "@/lib/docs";
import { ApiNotFound, apiHandler } from "@/lib/integrations/api";

export async function GET(req: Request, ctx: RouteContext<"/api/v1/documents/[code]">) {
  const { code } = await ctx.params;
  return apiHandler(req, "documents:verify", async () => {
    const doc = await db.document.findUnique({ where: { verifyCode: code.toUpperCase() }, include: { student: true } });
    if (!doc) throw new ApiNotFound(`No document with code ${code}.`);
    const v = verifyDocument(doc);
    return {
      code: doc.verifyCode, type: doc.type, authentic: v.intact, revoked: doc.revoked, duplicate: doc.isDuplicate, issuedAt: doc.issuedAt,
      student: { uid: doc.student.uid, rollNo: doc.student.rollNo, name: doc.student.name }, sha256: doc.payloadHash,
    };
  });
}
