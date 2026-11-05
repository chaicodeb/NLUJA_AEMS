import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePage } from "@/lib/session";
import { loadSession, needsCorrectionReason } from "@/lib/attendance/daily";
import { istDate, istTime } from "@/lib/attendance/shared";
import { Badge, PageHeader } from "@/components/ui";
import { Roster } from "./roster";

const KIND: Record<string, string> = { LECTURE: "Lecture", TUTORIAL: "Tutorial", MOOT_PRACTICE: "Moot practice" };

export default async function ClassSessionPage({ params }: PageProps<"/attendance/classes/[id]">) {
  const user = await requirePage("/attendance/classes");
  const { id } = await params;
  const loaded = await loadSession(id);
  if (!loaded) notFound();
  const { session, rows, rule } = loaded;
  if (user.role === "FACULTY" && session.course.facultyId !== user.id) {
    await audit({ actorId: user.id, actorRole: user.role, action: "ACCESS_DENIED", entity: "ClassSession", entityId: id, summary: `Attempted to open the ${session.course.code} class register of another teacher` });
    redirect(`/forbidden?path=${encodeURIComponent(`/attendance/classes/${id}`)}`);
  }
  const marker = session.markedById ? await db.user.findUnique({ where: { id: session.markedById } }) : null;
  const canEdit = session.course.facultyId === user.id || ["ACADEMIC_STAFF", "COE"].includes(user.role);

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href="/attendance/classes" className="text-brand-700 hover:underline">← {user.role === "FACULTY" ? "My classes" : "Daily attendance"}</Link>
      </div>
      <PageHeader
        eyebrow={`${session.course.code} · ${KIND[session.kind]}`}
        title={session.course.title}
        description={`${istDate(session.startsAt)} · ${istTime(session.startsAt)} · ${session.course.faculty?.name ?? "—"}${rule ? ` · minimum ${rule.courseMinPct}% per course${rule.relaxationEnabled ? `, relaxable to ${rule.relaxedCourseMinPct}%` : ""}` : ""}`}
        actions={
          session.status === "MARKED" ? (
            <Badge tone="green">Marked{marker ? ` by ${marker.name}` : ""}{session.markedAt ? ` · ${istTime(session.markedAt)}` : ""}{session.source === "BIOMETRIC" ? " · biometric" : ""}</Badge>
          ) : (
            <Badge tone="amber">Not yet marked</Badge>
          )
        }
      />
      <Roster
        sessionId={session.id}
        rows={rows}
        marked={session.status === "MARKED"}
        canEdit={canEdit}
        needsReason={needsCorrectionReason(session, user.id)}
        minPct={rule?.courseMinPct ?? 75}
        floorPct={rule?.relaxationEnabled ? rule.relaxedCourseMinPct : null}
        originals={Object.fromEntries(session.records.map((r) => [r.enrolmentId, r.status]))}
      />
    </div>
  );
}
