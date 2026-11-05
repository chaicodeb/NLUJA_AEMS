import Link from "next/link";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { SHEET_STATUS, isOpenSheet, isOverdue } from "@/lib/marks/shared";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, Stat, Table, TD, TH, THead, TR, buttonVariants } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import { RemindButton } from "./client";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "open", label: "With teachers" },
  { key: "SUBMITTED", label: "Awaiting verification" },
  { key: "VERIFIED", label: "Verified" },
];

export default async function MarksPage({ searchParams }: PageProps<"/marks">) {
  const user = await requirePage("/marks");
  const teacher = user.role === "FACULTY";
  const filter = String((await searchParams).status ?? "all");
  const sheets = await db.internalMarksSheet.findMany({
    where: teacher ? { course: { facultyId: user.id } } : {},
    include: { course: { include: { faculty: true } }, component: true },
    orderBy: [{ course: { code: "asc" } }, { component: { sortOrder: "asc" } }],
  });
  const years = [...new Set(sheets.map((s) => s.academicYear))];
  const [enrolCounts, entries] = await Promise.all([
    db.enrolment.groupBy({ by: ["courseId", "academicYear"], where: { courseId: { in: sheets.map((s) => s.courseId) }, academicYear: { in: years } }, _count: { _all: true } }),
    db.markEntry.findMany({
      where: { componentId: { in: sheets.map((s) => s.componentId) }, enrolment: { academicYear: { in: years } }, OR: [{ marks: { not: null } }, { absent: true }] },
      select: { componentId: true, enrolment: { select: { courseId: true, academicYear: true } } },
    }),
  ]);
  const rows = sheets.map((s) => {
    const total = enrolCounts.find((e) => e.courseId === s.courseId && e.academicYear === s.academicYear)?._count._all ?? 0;
    const entered = entries.filter((e) => e.componentId === s.componentId && e.enrolment.courseId === s.courseId && e.enrolment.academicYear === s.academicYear).length;
    return { s, total, entered, open: isOpenSheet(s.status), overdue: isOverdue(s) };
  });
  const shown = rows.filter((r) => filter === "all" || (filter === "open" ? r.open : r.s.status === filter));
  const count = (pred: (r: (typeof rows)[number]) => boolean) => rows.filter(pred).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Internal assessment"
        title={teacher ? "My marks sheets" : "Internal marks — submission status"}
        description={
          teacher
            ? "Enter marks on screen or import the Excel template, then submit and sign. Once the Dean verifies a sheet it is locked for result processing."
            : "Each course teacher submits a digitally signed sheet per assessment component; the Dean (or the COE) verifies it before result processing. Unsubmitted components make the course result Withheld."
        }
      />
      {!teacher && (
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Marks sheets" value={rows.length} />
          <Stat label="Verified & locked" value={count((r) => r.s.status === "VERIFIED")} tone="green" />
          <Stat label="Awaiting verification" value={count((r) => r.s.status === "SUBMITTED")} tone={count((r) => r.s.status === "SUBMITTED") ? "brand" : "neutral"} />
          <Stat label="With teachers" value={count((r) => r.open)} tone={count((r) => r.overdue) ? "red" : count((r) => r.open) ? "amber" : "neutral"} hint={count((r) => r.overdue) ? `${count((r) => r.overdue)} overdue` : undefined} />
        </div>
      )}
      {teacher && count((r) => r.s.status === "RETURNED") > 0 && (
        <Callout tone="red" title="Sheets returned for correction">Open the sheet to see the Dean&apos;s note, correct the marks and submit again.</Callout>
      )}
      {!teacher && (
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link key={f.key} href={f.key === "all" ? "/marks" : `/marks?status=${f.key}`} className={cn("rounded-full border px-3 py-1.5 text-sm", filter === f.key ? "border-brand-600 bg-brand-600 text-white" : "border-border bg-white hover:bg-muted")}>
              {f.label}
            </Link>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <EmptyState title="No marks sheets" description={teacher ? "No internal assessment components are assigned to your courses this semester." : "Nothing matches this filter."} />
      ) : (
        <Card>
          <CardHeader title={`${shown.length} sheet${shown.length === 1 ? "" : "s"}`} description={`Academic year ${years.join(", ")}`} />
          <Table>
            <THead>
              <tr>
                <TH>Course</TH>
                <TH>Component</TH>
                {!teacher && <TH>Teacher</TH>}
                <TH className="text-right">Entered</TH>
                <TH>Status</TH>
                <TH>Due</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {shown.map(({ s, total, entered, open, overdue }) => (
                <TR key={s.id}>
                  <TD>
                    <span className="font-mono text-xs text-muted-foreground">{s.course.code}</span> <span className="text-sm">{s.course.title}</span>
                  </TD>
                  <TD>
                    {s.component.name} <span className="text-xs text-muted-foreground">/ {s.component.maxMarks}</span>
                    {s.component.source === "EXTERNAL" && <Badge tone="violet" className="ml-1">external judges</Badge>}
                  </TD>
                  {!teacher && <TD className="text-sm">{s.course.faculty?.name ?? "—"}</TD>}
                  <TD className="text-right">
                    <span className={entered < total ? "font-medium text-amber-700" : ""}>{entered}/{total}</span>
                  </TD>
                  <TD><Badge tone={SHEET_STATUS[s.status].tone}>{SHEET_STATUS[s.status].label}</Badge></TD>
                  <TD className={cn("text-xs", overdue ? "font-semibold text-red-700" : "text-muted-foreground")}>
                    {open ? `${formatDate(s.deadline)}${overdue ? " · overdue" : ""}` : s.verifiedAt ? `verified ${formatDate(s.verifiedAt)}` : `submitted ${formatDate(s.submittedAt!)}`}
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-2">
                      {!teacher && open && <RemindButton sheetId={s.id} />}
                      <Link href={`/marks/${s.id}`} className={buttonVariants({ size: "sm", variant: teacher && open ? "default" : "outline" })}>
                        {teacher ? (open ? "Enter marks" : "View") : s.status === "SUBMITTED" && ["HOD", "COE"].includes(user.role) ? "Review" : "View"}
                      </Link>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
