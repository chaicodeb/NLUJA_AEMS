import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/session";
import { abcCreditRows } from "@/lib/integrations/connectors";
import { toCsv } from "@/lib/integrations/csv";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorised", { status: 401 });
  if (!["ADMIN", "REGISTRAR", "COE"].includes(user.role)) return new Response("Forbidden", { status: 403 });
  const { header, rows, missing, students } = await abcCreditRows();
  await audit({ actorId: user.id, actorRole: user.role, action: "ABC_EXPORTED", entity: "IntegrationConnector", entityId: "ABC", summary: `ABC credit file generated: ${rows.length} course credits for ${students} students; ${missing.length} student(s) left out for want of an ABC ID` });
  return new Response(toCsv([header, ...rows]), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="abc-credit-upload.csv"' } });
}
