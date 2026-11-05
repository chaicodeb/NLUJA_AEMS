import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, ShieldX } from "lucide-react";
import { db } from "@/lib/db";
import { verifyDocument } from "@/lib/docs";
import type { AdmitCardPayload } from "@/lib/exams/admit-cards";
import type { GradeSheetPayload } from "@/lib/results/workflow";
import type { TranscriptPayload } from "@/lib/results/transcript";
import type { DegreePayload } from "@/lib/convocation/degree";
import type { ExitCertificatePayload } from "@/lib/exit/exit";
import { Card } from "@/components/ui";
import { formatDate } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  ADMIT_CARD: "Admit Card", GRADE_SHEET: "Semester Grade Sheet", TRANSCRIPT: "Consolidated Transcript", DEGREE: "Degree Certificate", PROVISIONAL: "Provisional Certificate",
  MIGRATION: "Migration Certificate", CHARACTER: "Character Certificate",
};

export default async function VerifyPage({ params }: PageProps<"/verify/[code]">) {
  const { code } = await params;
  const doc = await db.document.findUnique({ where: { verifyCode: code.toUpperCase() } });
  const result = doc ? verifyDocument(doc) : null;
  const successor = doc?.revoked
    ? await db.document.findFirst({ where: { type: doc.type, studentId: doc.studentId, revoked: false, payload: { path: ["revision", "supersedes"], equals: doc.verifyCode } } })
    : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-ink-900 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          <Image src="/brand/footer_logo.webp" alt="NLUJA emblem" width={44} height={44} className="rounded-full bg-white p-0.5" />
          <div>
            <div className="font-serif font-semibold">National Law University and Judicial Academy, Assam</div>
            <div className="text-xs text-white/60">Document verification service</div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-5 px-5 py-8">
        {!doc ? (
          <Card className="p-8 text-center">
            <ShieldX className="mx-auto h-12 w-12 text-red-600" />
            <h1 className="mt-3 font-serif text-xl font-bold">No document found</h1>
            <p className="mt-1 text-sm text-muted-foreground">The code <span className="font-mono">{code}</span> does not match any document issued by the University.</p>
          </Card>
        ) : (
          <>
            <Card className={`p-6 ${result?.intact ? "border-leaf-100" : "border-red-200"}`}>
              <div className="flex items-start gap-4">
                {result?.intact ? <CheckCircle2 className="h-10 w-10 shrink-0 text-leaf-600" /> : <ShieldX className="h-10 w-10 shrink-0 text-red-600" />}
                <div>
                  <h1 className="font-serif text-xl font-bold">{result?.intact ? `Authentic ${TYPE_LABEL[doc.type] ?? doc.type}` : doc.revoked ? "Document superseded / revoked" : "Document integrity check FAILED"}</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Issued {formatDate(doc.issuedAt, true)} · Code <span className="font-mono font-semibold">{doc.verifyCode}</span>
                    {doc.isDuplicate && " · DUPLICATE COPY"}
                  </p>
                  <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">SHA-256 {doc.payloadHash}</p>
                  <p className="break-all font-mono text-[11px] text-muted-foreground">Signature {result?.signature.slice(0, 40)}…</p>
                  {successor && (
                    <p className="mt-3 text-sm">
                      Replaced by{" "}
                      <Link href={`/verify/${successor.verifyCode}`} className="font-mono font-semibold text-brand-700 underline">
                        {successor.verifyCode}
                      </Link>{" "}
                      issued {formatDate(successor.issuedAt, true)} ({(successor.payload as { revision?: { note?: string } }).revision?.note ?? "revised"}).
                    </p>
                  )}
                </div>
              </div>
            </Card>
            {doc.type === "ADMIT_CARD" && <AdmitCardDetails p={doc.payload as AdmitCardPayload} />}
            {doc.type === "GRADE_SHEET" && <GradeSheetDetails p={doc.payload as GradeSheetPayload} />}
            {doc.type === "TRANSCRIPT" && <TranscriptDetails p={doc.payload as unknown as TranscriptPayload} />}
            {(doc.type === "DEGREE" || doc.type === "PROVISIONAL") && <DegreeDetails p={doc.payload as unknown as DegreePayload} />}
            {(doc.type === "MIGRATION" || doc.type === "CHARACTER") && <CertificateDetails p={doc.payload as unknown as ExitCertificatePayload} />}
          </>
        )}
        <p className="text-center text-xs text-muted-foreground">Verification is performed against the University&apos;s records in real time.</p>
      </main>
    </div>
  );
}

function DegreeDetails({ p }: { p: DegreePayload }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{p.kind === "DEGREE" ? `Degree certificate${p.serialNo ? ` · Serial ${p.serialNo}` : ""}` : "Provisional certificate"}</div>
        <div className="mt-1 text-lg font-semibold">{p.student.name}</div>
        <div className="text-sm text-muted-foreground">Roll No. {p.student.rollNo} · UID {p.student.uid}{p.student.abcId ? ` · ABC ${p.student.abcId}` : ""}</div>
      </div>
      <dl className="grid gap-3 px-5 py-4 text-sm sm:grid-cols-2">
        {[
          ["Degree", p.degree],
          ["Programme & batch", `${p.programme} · ${p.batch}`],
          ["Classification", `${p.division ?? "Pass"} · CGPA ${p.cgpa.toFixed(2)}`],
          ["Year of passing", p.yearOfPassing],
          ["Conferred at", p.convocation ? `${p.convocation.title}, ${formatDate(p.convocation.date)}` : "Awaiting convocation"],
          ["Signed by", `${p.signatory.name}, ${p.signatory.designation}`],
          ...(p.medals.length ? [["Medals", p.medals.join(", ")]] : []),
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function CertificateDetails({ p }: { p: ExitCertificatePayload }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{p.kind === "MIGRATION" ? "Migration" : "Character"} certificate · No. {p.serialNo}</div>
        <div className="mt-1 text-lg font-semibold">{p.student.name}</div>
        <div className="text-sm text-muted-foreground">Roll No. {p.student.rollNo} · UID {p.student.uid}</div>
      </div>
      <dl className="grid gap-3 px-5 py-4 text-sm sm:grid-cols-2">
        {[
          ["Programme & batch", `${p.programme} · ${p.batch}`],
          ["Period of study", p.period],
          ["Last examination", p.lastExamination],
          ["Reason for leaving", p.exitType],
          ["Signed by", `${p.signatory.name}, ${p.signatory.designation}`],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function TranscriptDetails({ p }: { p: TranscriptPayload }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Consolidated transcript · {p.variant === "OFFICIAL" ? "Official copy" : "Student copy"}{p.purpose ? ` · ${p.purpose}` : ""}
        </div>
        <div className="mt-1 text-lg font-semibold">{p.student.name}</div>
        <div className="text-sm text-muted-foreground">Roll No. {p.student.rollNo} · UID {p.student.uid} · {p.student.programme}</div>
      </div>
      <div className="grid grid-cols-2 gap-4 border-b border-border px-5 py-4 text-center sm:grid-cols-4">
        {[
          ["CGPA", p.cgpa.toFixed(2)],
          ["Credits earned", `${p.earnedCredits}${p.requiredCredits ? `/${p.requiredCredits}` : ""}`],
          ["Classification", p.division ?? "—"],
          ["Semesters", String(p.semesters.length)],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="text-xs text-muted-foreground">{k}</div>
            <div className="text-base font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Semester</th>
            <th className="px-4 py-2">Session</th>
            <th className="px-4 py-2 text-right">Credits</th>
            <th className="px-4 py-2 text-right">SGPA</th>
          </tr>
        </thead>
        <tbody>
          {p.semesters.map((s) => (
            <tr key={s.semester} className="border-t border-border">
              <td className="px-4 py-2">Semester {s.semester}</td>
              <td className="px-4 py-2">{s.session}</td>
              <td className="px-4 py-2 text-right">{s.earnedCredits}/{s.credits}</td>
              <td className="px-4 py-2 text-right font-semibold">{s.sgpa.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">{p.status}</div>
    </Card>
  );
}

function GradeSheetDetails({ p }: { p: GradeSheetPayload }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{p.exam.name} · Semester {p.semester}</div>
        <div className="mt-1 text-lg font-semibold">{p.student.name}</div>
        <div className="text-sm text-muted-foreground">Roll No. {p.student.rollNo} · UID {p.student.uid} · {p.student.programme}</div>
      </div>
      <div className="grid grid-cols-2 gap-4 border-b border-border px-5 py-4 text-center sm:grid-cols-4">
        {[
          ["SGPA", p.sgpa.toFixed(2)],
          ["CGPA", p.cgpa.toFixed(2)],
          ["Credits earned", `${p.earnedCredits}/${p.credits}`],
          ["Result", p.result],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="text-xs text-muted-foreground">{k}</div>
            <div className="text-lg font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Course</th>
            <th className="px-4 py-2 text-right">Credits</th>
            <th className="px-4 py-2">Grade</th>
          </tr>
        </thead>
        <tbody>
          {p.courses.map((c) => (
            <tr key={c.code} className="border-t border-border">
              <td className="px-4 py-2"><span className="font-mono text-xs">{c.code}</span> {c.title}</td>
              <td className="px-4 py-2 text-right">{c.credits}</td>
              <td className="px-4 py-2 font-semibold">{c.grade}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function AdmitCardDetails({ p }: { p: AdmitCardPayload }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{p.exam.name}</div>
        <div className="mt-1 text-lg font-semibold">{p.student.name}</div>
        <div className="text-sm text-muted-foreground">Roll No. {p.student.rollNo} · {p.student.programme} · Semester {p.student.semester}</div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Date</th>
            <th className="px-4 py-2">Paper</th>
            <th className="px-4 py-2">Centre</th>
            <th className="px-4 py-2">Room</th>
            <th className="px-4 py-2">Bench</th>
          </tr>
        </thead>
        <tbody>
          {p.papers.map((x) => (
            <tr key={x.code} className="border-t border-border">
              <td className="px-4 py-2 whitespace-nowrap">{formatDate(x.date, true)}</td>
              <td className="px-4 py-2"><span className="font-mono text-xs">{x.code}</span> {x.title}</td>
              <td className="px-4 py-2">{x.centre}</td>
              <td className="px-4 py-2">{x.room}</td>
              <td className="px-4 py-2 font-mono font-semibold">{x.bench}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
