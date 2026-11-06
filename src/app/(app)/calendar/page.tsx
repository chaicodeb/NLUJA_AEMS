import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { calendarMonth } from "@/lib/academics/calendar";
import { EVENT_TYPES, dayOf, isoDay, weekday } from "@/lib/academics/calendar-shared";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { EventActions, EventForm } from "./client";

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => dayOf(d).toLocaleDateString("en-IN", { ...opts, timeZone: "UTC" });

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const user = await requirePage("/calendar");
  const sp = await searchParams;
  const batch = user.student?.batch ?? (user.ward ? await db.batch.findUnique({ where: { id: user.ward.batchId } }) : null);
  const { month, today, grid, events, papers } = await calendarMonth(typeof sp.m === "string" ? sp.m : undefined, { role: user.role, batch });
  const canEdit = ["ACADEMIC_STAFF", "REGISTRAR", "ADMIN"].includes(user.role);
  const span = (e: (typeof events)[number]) => [isoDay(e.startDate), isoDay(e.endDate)] as const;
  const inMonth = events.filter((e) => span(e)[1] >= grid.first && span(e)[0] <= grid.last);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Academic year 2026-27"
        title="Academic calendar"
        description="Teaching terms, examinations, holidays and deadlines. Holidays entered here are respected by the examination timetable generator and flagged against scheduled classes."
        actions={canEdit ? <EventForm /> : undefined}
      />
      <Card>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <Link href={`/calendar?m=${grid.prev}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4" /> {fmt(`${grid.prev}-01`, { month: "short" })}</Link>
          <div className="font-serif text-lg font-semibold">{fmt(grid.first, { month: "long", year: "numeric" })}</div>
          <Link href={`/calendar?m=${grid.next}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">{fmt(`${grid.next}-01`, { month: "short" })} <ChevronRight className="h-4 w-4" /></Link>
        </div>
        <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {WEEK.map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {grid.days.map((d) => {
            const here = events.filter((e) => span(e)[0] <= d && span(e)[1] >= d);
            const closed = here.some((e) => e.type === "HOLIDAY" || e.type === "VACATION") || weekday(d) === 0;
            const exams = papers.filter((p) => p.day === d);
            const outside = d.slice(0, 7) !== month;
            return (
              <div key={d} className={`min-h-24 border-b border-r border-border p-1.5 text-xs ${outside ? "bg-muted/30 text-muted-foreground" : closed ? "bg-red-50/40" : ""}`}>
                <div className={`mb-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${d === today ? "bg-brand-600 font-semibold text-white" : weekday(d) === 0 ? "text-red-600" : ""}`}>{Number(d.slice(8))}</div>
                <div className="space-y-0.5">
                  {here.filter((e) => e.type !== "TEACHING").slice(0, 3).map((e) => (
                    <div key={e.id} className={`truncate rounded border px-1 py-px ${EVENT_TYPES[e.type]?.chip}`} title={e.title}>{e.title}</div>
                  ))}
                  {exams.length > 0 && (
                    <div className="truncate rounded border border-brand-300 bg-white px-1 py-px font-medium text-brand-800" title={exams.map((p) => `${p.course.code} ${p.session}`).join(", ")}>
                      {["STUDENT", "PARENT"].includes(user.role) ? exams.map((p) => `${p.course.code} ${p.session}`).join(", ") : `${exams.length} exam paper${exams.length === 1 ? "" : "s"}`}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 px-5 py-3 text-xs text-muted-foreground">
          {Object.entries(EVENT_TYPES).map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${v.dot}`} /> {v.label}</span>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title={`${fmt(grid.first, { month: "long" })} at a glance`} description={`${inMonth.length} calendar entr${inMonth.length === 1 ? "y" : "ies"}${papers.filter((p) => p.day.slice(0, 7) === month).length ? ` · ${papers.filter((p) => p.day.slice(0, 7) === month).length} examination paper(s)` : ""}`} />
        <ul className="divide-y divide-border">
          {inMonth.map((e) => {
            const [s, t] = span(e);
            return (
              <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
                <div className="flex items-start gap-3">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${EVENT_TYPES[e.type]?.dot}`} />
                  <div>
                    <div className="font-medium">{e.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {s === t ? fmt(s, { weekday: "short", day: "numeric", month: "short" }) : `${fmt(s, { day: "numeric", month: "short" })} – ${fmt(t, { day: "numeric", month: "short", year: "numeric" })}`}
                      {" · "}{EVENT_TYPES[e.type]?.label}{e.audience !== "ALL" ? ` · ${e.audience === "STAFF" ? "staff only" : "students"}` : ""}{e.description ? ` · ${e.description}` : ""}
                    </div>
                  </div>
                </div>
                {canEdit && <EventActions event={{ id: e.id, title: e.title, type: e.type, startDate: s, endDate: t, audience: e.audience, description: e.description ?? "" }} />}
              </li>
            );
          })}
          {papers.filter((p) => p.day.slice(0, 7) === month).map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <Badge tone="brand">{p.session}</Badge>
              <span className="text-muted-foreground">{fmt(p.day, { weekday: "short", day: "numeric", month: "short" })}</span>
              <span><span className="font-mono text-xs">{p.course.code}</span> {p.course.title}</span>
              <span className="text-xs text-muted-foreground">· {p.exam.code}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
