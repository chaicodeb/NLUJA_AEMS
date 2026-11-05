import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePage } from "@/lib/session";
import { canEditSheet, loadSheet, subCriteriaOf } from "@/lib/marks/internal";
import { SHEET_STATUS } from "@/lib/marks/shared";
import { Badge, Callout, Card, PageHeader } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import { ReviewActions } from "../client";
import { MarksGrid } from "./grid";

export default async function MarksSheetPage({ params }: PageProps<"/marks/[id]">) {
  const user = await requirePage("/marks");
  const { id } = await params;
  const loaded = await loadSheet(id);
  if (!loaded) notFound();
  const { sheet, rows } = loaded;
  if (user.role === "FACULTY" && sheet.course.facultyId !== user.id) {
    await audit({ actorId: user.id, actorRole: user.role, action: "ACCESS_DENIED", entity: "InternalMarksSheet", entityId: id, summary: `Attempted to open the ${sheet.course.code} marks sheet of another teacher` });
    redirect(`/forbidden?path=${encodeURIComponent(`/marks/${id}`)}`);
  }
  const people = await db.user.findMany({ where: { id: { in: [sheet.submittedById ?? "", sheet.verifiedById ?? ""] } } });
  const who = (uid: string | null) => people.find((p) => p.id === uid)?.name ?? "—";
  const editable = canEditSheet(sheet, user.id);
  const reviewer = ["HOD", "COE"].includes(user.role);
  const criteria = subCriteriaOf(sheet.component);
  const steps = [
    { label: "Marks entered by the teacher", done: sheet.status !== "DRAFT" && sheet.status !== "RETURNED", detail: sheet.course.faculty?.name ?? "—" },
    { label: "Submitted & digitally signed", done: !!sheet.submittedAt && sheet.status !== "RETURNED", detail: sheet.submittedAt && sheet.status !== "RETURNED" ? `${who(sheet.submittedById)} · ${formatDate(sheet.submittedAt, true)}` : `Due ${formatDate(sheet.deadline, true)}` },
    { label: "Verified by the Dean / COE", done: sheet.status === "VERIFIED", detail: sheet.verifiedAt ? `${who(sheet.verifiedById)} · ${formatDate(sheet.verifiedAt, true)}` : "Locks the marks for result processing" },
  ];

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href="/marks" className="text-brand-700 hover:underline">← {user.role === "FACULTY" ? "My marks sheets" : "All marks sheets"}</Link>
      </div>
      <PageHeader
        eyebrow={`${sheet.course.code} · ${sheet.academicYear}`}
        title={`${sheet.component.name} — ${sheet.course.title}`}
        description={`Maximum ${sheet.component.maxMarks}${sheet.component.passMarks != null ? ` · component minimum ${sheet.component.passMarks}` : ""} · ${sheet.component.scheme.name} · teacher ${sheet.course.faculty?.name ?? "—"}${sheet.component.source === "EXTERNAL" ? " (entered on behalf of the external judges)" : ""}`}
        actions={<Badge tone={SHEET_STATUS[sheet.status].tone}>{SHEET_STATUS[sheet.status].label}</Badge>}
      />

      <Card className="p-5">
        <ol className="grid gap-4 md:grid-cols-3">
          {steps.map((s) => (
            <li key={s.label} className="flex items-start gap-3">
              {s.done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-leaf-600" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />}
              <div>
                <div className={cn("text-sm font-medium", !s.done && "text-muted-foreground")}>{s.label}</div>
                <div className="text-xs text-muted-foreground">{s.detail}</div>
              </div>
            </li>
          ))}
        </ol>
        {sheet.signatureHash && sheet.status !== "RETURNED" && <p className="mt-3 break-all font-mono text-[11px] text-muted-foreground">Signature {sheet.signatureHash}</p>}
      </Card>

      {sheet.status === "RETURNED" && sheet.note && (
        <Callout tone="red" title="Returned for correction">{sheet.note}</Callout>
      )}
      {reviewer && sheet.status === "SUBMITTED" && (
        <Callout tone="blue" title="Review before verifying">
          Check the distribution and any unusual entries. Verifying re-checks the teacher&apos;s digital signature, then locks the marks for result processing.
        </Callout>
      )}
      {(reviewer && ["SUBMITTED", "VERIFIED"].includes(sheet.status)) && (
        <ReviewActions sheetId={sheet.id} status={sheet.status} canReopen={user.role === "COE"} />
      )}

      <MarksGrid
        key={rows.map((r) => `${r.marks}|${r.absent}|${JSON.stringify(r.detail)}`).join(",") + sheet.status}
        sheetId={sheet.id}
        max={sheet.component.maxMarks}
        passMarks={sheet.component.passMarks}
        criteria={criteria}
        rows={rows}
        editable={editable}
      />
    </div>
  );
}
