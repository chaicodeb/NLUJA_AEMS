import Image from "next/image";
import { CheckCircle2, ShieldX } from "lucide-react";
import { db } from "@/lib/db";
import { verifyDocument } from "@/lib/docs";
import type { AdmitCardPayload } from "@/lib/exams/admit-cards";
import { Card } from "@/components/ui";
import { formatDate } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = { ADMIT_CARD: "Admit Card", GRADE_SHEET: "Semester Grade Sheet", TRANSCRIPT: "Consolidated Transcript", DEGREE: "Degree Certificate" };

export default async function VerifyPage({ params }: PageProps<"/verify/[code]">) {
  const { code } = await params;
  const doc = await db.document.findUnique({ where: { verifyCode: code.toUpperCase() } });
  const result = doc ? verifyDocument(doc) : null;

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
                </div>
              </div>
            </Card>
            {doc.type === "ADMIT_CARD" && <AdmitCardDetails p={doc.payload as AdmitCardPayload} />}
          </>
        )}
        <p className="text-center text-xs text-muted-foreground">Verification is performed against the University&apos;s records in real time.</p>
      </main>
    </div>
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
