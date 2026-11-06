import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { uploadDocument } from "@/lib/admissions/admissions";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "APPLICANT") return Response.json({ error: "Only applicants can upload documents." }, { status: 403 });
  const app = await db.application.findUnique({ where: { userId: user.id } });
  if (!app) return Response.json({ error: "No application found." }, { status: 404 });
  const form = await req.formData();
  const file = form.get("file");
  const code = String(form.get("code") ?? "");
  if (!(file instanceof File)) return Response.json({ error: "Choose a file to upload." }, { status: 400 });
  const res = await uploadDocument(app.id, code, file, { id: user.id, role: user.role });
  revalidatePath("/application");
  revalidatePath("/admissions", "layout");
  return Response.json(res, { status: res.error ? 400 : 200 });
}
