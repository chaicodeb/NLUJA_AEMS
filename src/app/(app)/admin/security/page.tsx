import { headers } from "next/headers";
import { CheckCircle2, CircleAlert, Info, XCircle } from "lucide-react";
import { requirePage } from "@/lib/session";
import { securityPosture } from "@/lib/admin/security";
import { Badge, Card, CardHeader, PageHeader, Stat } from "@/components/ui";

const ICON = { PASS: CheckCircle2, WARN: CircleAlert, FAIL: XCircle, INFO: Info };
const TONE = { PASS: "text-leaf-600", WARN: "text-amber-600", FAIL: "text-red-600", INFO: "text-sky-600" };

export default async function SecurityPage() {
  await requirePage("/admin/security");
  const h = await headers();
  const https = h.get("x-forwarded-proto") === "https";
  const { checks, score } = await securityPosture(https);
  const areas = [...new Set(checks.map((c) => c.area))];
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Security posture"
        description="Live checks against the controls required by the RFP (§11, §14): every figure on this page is computed now from configuration and the audit trail, not typed in."
      />
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Controls passing" value={`${score}%`} tone={score >= 90 ? "green" : score >= 70 ? "amber" : "red"} />
        <Stat label="Pass" value={checks.filter((c) => c.status === "PASS").length} tone="green" />
        <Stat label="Attention" value={checks.filter((c) => c.status === "WARN").length} tone={checks.some((c) => c.status === "WARN") ? "amber" : "neutral"} />
        <Stat label="Failing" value={checks.filter((c) => c.status === "FAIL").length} tone={checks.some((c) => c.status === "FAIL") ? "red" : "neutral"} />
      </div>
      {areas.map((a) => (
        <Card key={a}>
          <CardHeader title={a} />
          <ul className="divide-y divide-border">
            {checks.filter((c) => c.area === a).map((c) => {
              const Icon = ICON[c.status];
              return (
                <li key={c.control} className="flex items-start gap-3 px-5 py-3 text-sm">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${TONE[c.status]}`} />
                  <div className="flex-1">
                    <div className="font-medium">{c.control}</div>
                    <div className="text-xs text-muted-foreground">{c.detail}</div>
                  </div>
                  <Badge tone={c.status === "PASS" ? "green" : c.status === "WARN" ? "amber" : c.status === "FAIL" ? "red" : "blue"}>{c.status === "INFO" ? "Info" : c.status === "PASS" ? "Pass" : c.status === "WARN" ? "Attention" : "Fail"}</Badge>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
}
