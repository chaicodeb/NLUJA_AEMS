import { db } from "@/lib/db";
import { apiHandler } from "@/lib/integrations/api";
import { studentView } from "@/lib/integrations/views";

export async function GET(req: Request) {
  return apiHandler(req, "students:read", async () => {
    const q = new URL(req.url).searchParams;
    const limit = Math.min(200, Math.max(1, Number(q.get("limit")) || 50));
    const offset = Math.max(0, Number(q.get("offset")) || 0);
    const where = { ...(q.get("batch") ? { batch: { code: q.get("batch")! } } : {}), ...(q.get("status") ? { status: q.get("status")! } : {}) };
    const [total, rows] = await Promise.all([
      db.student.count({ where }),
      db.student.findMany({ where, include: { batch: { include: { programme: true } } }, orderBy: { rollNo: "asc" }, take: limit, skip: offset }),
    ]);
    return { total, limit, offset, data: rows.map(studentView) };
  });
}
