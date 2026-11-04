import Image from "next/image";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/roles";
import { DEMO_OTP } from "@/lib/demo/constants";
import { DEMO_PASSWORD } from "@/lib/demo/scenarios";
import { LoginPanel } from "./login-panel";

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");
  const users = await db.user.findMany({ orderBy: { createdAt: "asc" }, select: { email: true, name: true, role: true, designation: true, mfaEnabled: true } });
  const order = ["COE", "EXAM_STAFF", "ACADEMIC_STAFF", "VC", "REGISTRAR", "FACULTY", "EVALUATOR", "STUDENT", "PARENT", "ADMIN", "HOD", "IQAC"];
  const seen = new Set<string>();
  const demo = users
    .filter((u) => (u.role === "FACULTY" || u.role === "EVALUATOR" ? true : !seen.has(u.role) && seen.add(u.role)))
    .filter((u) => u.email !== "mridusmita.das@nluassam.ac.in")
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))
    .map((u) => ({ ...u, roleLabel: ROLE_LABELS[u.role] }));

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink-900 p-10 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-600/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-leaf-600/20 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <Image src="/brand/footer_logo.webp" alt="NLUJA, Assam emblem" width={64} height={64} className="rounded-full bg-white p-0.5" priority />
          <div>
            <div className="font-serif text-lg font-semibold leading-tight">National Law University and Judicial Academy, Assam</div>
            <div className="text-sm text-white/60">Hajo Road, Amingaon, Guwahati – 781031</div>
          </div>
        </div>
        <div className="relative max-w-lg">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">Integrated Academic &amp; Examination Management System</div>
          <h1 className="font-serif text-4xl font-bold leading-tight">One platform from admission to convocation — configured to NLUJA&apos;s own ordinances.</h1>
          <ul className="mt-8 space-y-3 text-sm text-white/80">
            {[
              "Rule engine for BCI/UGC attendance, grading and grace — editable by the University, no vendor change request",
              "Anonymous barcoded evaluation with an unbroken chain of custody",
              "Digitally signed, QR-verifiable grade sheets and transcripts",
              "Tamper-evident audit trail on every transaction",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative text-xs text-white/40">Demonstration build · RFP No. NLUJAA/ACAD-ADMIN/F/MISC/2024-25/510</div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-10">
        <LoginPanel demoAccounts={demo} demoPassword={DEMO_PASSWORD} demoOtp={DEMO_OTP} />
      </div>
    </div>
  );
}
