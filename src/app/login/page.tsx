import Image from "next/image";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/roles";
import { DEMO_OTP } from "@/lib/demo/constants";
import { DEMO_PASSWORD } from "@/lib/demo/scenarios";
import { getT } from "@/lib/i18n/server";
import { LanguageSwitcher } from "@/components/i18n";
import { LoginPanel } from "./login-panel";
import { ShareQr } from "@/components/share-qr";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const t = await getT();
  const users = await db.user.findMany({ orderBy: { createdAt: "asc" }, select: { email: true, name: true, role: true, designation: true, mfaEnabled: true } });
  const order = ["COE", "EXAM_STAFF", "ACADEMIC_STAFF", "VC", "REGISTRAR", "FACULTY", "EVALUATOR", "STUDENT", "PARENT", "ADMIN", "HOD", "IQAC", "LIBRARIAN", "WARDEN", "ACCOUNTS", "APPLICANT"];
  const seen = new Set<string>();
  const demo = users
    .filter((u) => (["FACULTY", "EVALUATOR", "STUDENT"].includes(u.role) ? true : !seen.has(u.role) && seen.add(u.role)))
    .filter((u) => u.email !== "mridusmita.das@nluassam.ac.in")
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))
    .map((u) => ({ ...u, roleLabel: t.loose(ROLE_LABELS[u.role]) }));

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink-900 p-10 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-600/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-leaf-600/20 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <Image src="/brand/footer_logo.webp" alt="NLUJA, Assam emblem" width={64} height={64} className="rounded-full bg-white p-0.5" priority />
          <div>
            <div className="font-serif text-lg font-semibold leading-tight">{t("National Law University and Judicial Academy, Assam")}</div>
            <div className="text-sm text-white/60">{t("Hajo Road, Amingaon, Guwahati – 781031")}</div>
          </div>
        </div>
        <div className="relative max-w-lg">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">{t("Integrated Academic & Examination Management System")}</div>
          <h1 className="font-serif text-4xl font-bold leading-tight">{t("One platform from admission to convocation — configured to NLUJA's own ordinances.")}</h1>
          <ul className="mt-8 space-y-3 text-sm text-white/80">
            {[
              t("Rule engine for BCI/UGC attendance, grading and grace — editable by the University, no vendor change request"),
              t("Anonymous barcoded evaluation with an unbroken chain of custody"),
              t("Digitally signed, QR-verifiable grade sheets and transcripts"),
              t("Tamper-evident audit trail on every transaction"),
            ].map((line) => (
              <li key={line} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative space-y-4">
          <div className="max-w-sm">
            <ShareQr dark compact />
          </div>
          <div className="text-xs text-white/40">{t("Demonstration build · RFP No. {rfp}", { rfp: "NLUJAA/ACAD-ADMIN/F/MISC/2024-25/510" })}</div>
        </div>
      </div>

      <div className="relative flex items-center justify-center p-6 pt-16 lg:p-10">
        <LanguageSwitcher className="absolute top-4 right-4" />
        <LoginPanel demoAccounts={demo} demoPassword={DEMO_PASSWORD} demoOtp={DEMO_OTP} />
      </div>
    </div>
  );
}
