import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { Badge, Card, Callout, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import type { AttendanceParams, GraceParams, GradingParams } from "@/lib/rules/engine";
import type { RevaluationParams } from "@/lib/results/revaluation";

const TYPE_LABEL = { ATTENDANCE: "Attendance & eligibility", GRADING: "Grading", GRACE: "Grace marks", PROMOTION: "Promotion", REVALUATION: "Revaluation" } as const;

export default async function RulesPage() {
  await requirePage("/rules");
  const rules = await db.ruleSet.findMany({ where: { isActive: true }, include: { programme: true }, orderBy: [{ type: "asc" }, { key: "asc" }] });
  const versions = await db.ruleSet.groupBy({ by: ["key"], _count: { _all: true } });
  const users = await db.user.findMany({ where: { id: { in: rules.map((r) => r.createdById ?? "") } } });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Rule engine"
        title="Rule configuration"
        description="Examination and academic rules are data, not code. Authorised University staff change them here; every change creates a new version, takes effect without a deployment, and is recorded in the audit trail."
      />
      <Callout tone="blue" title="RFP Section 6.3 — self-service configuration">
        Attendance thresholds, relaxation conditions, grading bands and grace limits are configured per programme by the Academic Section and the Controller of Examinations — no vendor change request.
      </Callout>
      <div className="grid gap-4 lg:grid-cols-2">
        {rules.map((r) => {
          const by = users.find((u) => u.id === r.createdById);
          return (
            <Link key={r.id} href={`/rules/${r.key}`} className="group">
              <Card className="h-full p-5 transition group-hover:border-brand-300 group-hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="brand">{TYPE_LABEL[r.type]}</Badge>
                      <Badge>{r.programme?.code ?? "All programmes"}</Badge>
                      <Badge tone="green">v{r.version} active</Badge>
                    </div>
                    <h3 className="mt-2 font-semibold">{r.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-brand-600" />
                </div>
                <div className="mt-4 rounded-lg bg-muted/60 p-3 text-sm">
                  <RuleSummary type={r.type} params={r.params} />
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  {versions.find((v) => v.key === r.key)?._count._all} version(s) · last changed {formatDate(r.createdAt, true)} by {by?.name ?? "—"}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function RuleSummary({ type, params }: { type: string; params: unknown }) {
  if (type === "ATTENDANCE") {
    const p = params as AttendanceParams;
    return (
      <ul className="space-y-1">
        <li>Minimum per course: <strong>{p.courseMinPct}%</strong>{p.semesterMinPct != null && <> · semester: <strong>{p.semesterMinPct}%</strong></>}</li>
        <li>
          Relaxation: {p.relaxationEnabled ? <>down to <strong>{p.relaxedCourseMinPct}%</strong> if aggregate ≥ <strong>{p.aggregateMinPct}%</strong>, approved by <strong>{p.relaxationAuthority}</strong></> : <strong>disabled</strong>}
        </li>
      </ul>
    );
  }
  if (type === "GRADING") {
    const p = params as GradingParams;
    return (
      <div className="flex flex-wrap gap-1.5">
        {p.bands.map((b) => (
          <span key={b.grade} className="rounded bg-white px-2 py-0.5 text-xs ring-1 ring-border">
            <strong>{b.grade}</strong> ≥{b.min} → {b.point}
          </span>
        ))}
        <span className="rounded bg-white px-2 py-0.5 text-xs ring-1 ring-border">
          <strong>{p.failGrade}</strong> &lt;{Math.min(...p.bands.map((b) => b.min))}
        </span>
      </div>
    );
  }
  if (type === "REVALUATION") {
    const p = params as RevaluationParams;
    return (
      <span>
        Window <strong>{p.windowDays} days</strong> · fees ₹<strong>{p.feeRevaluation}</strong> (revaluation) / ₹<strong>{p.feeScrutiny}</strong> (scrutiny) · revised marks adopted if change ≥ <strong>{p.minChangePct}%</strong> of maximum
      </span>
    );
  }
  if (type === "GRACE") {
    const p = params as GraceParams;
    return p.enabled ? (
      <span>Up to <strong>{p.maxPerCourse}</strong> per course, <strong>{p.maxPerSemester}</strong> per semester, in at most <strong>{p.maxCourses}</strong> courses; only to reach the pass mark.</span>
    ) : (
      <span>Grace marks disabled.</span>
    );
  }
  return null;
}
