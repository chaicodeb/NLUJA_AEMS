"use client";

import { Kalam } from "next/font/google";
import { Check, MessageSquare, X } from "lucide-react";
import type { Annotation } from "@/lib/exams/evaluation";

const hand = Kalam({ subsets: ["latin"], weight: ["300", "400"] });

type Props = {
  page: number;
  dummyNo: string;
  barcode: string;
  barcodeSvg: string;
  courseCode: string;
  courseTitle: string;
  examName: string;
  scheme: { q: string; max: number }[];
  answers: string[][];
  questionMarks: Record<string, number>;
  annotations: Annotation[];
  onPlace?: (x: number, y: number) => void;
};

/** A rendered stand-in for a 300 DPI scanned answer booklet page. */
export function BookletPage(p: Props) {
  return (
    <div
      className="relative mx-auto w-full overflow-hidden rounded-sm bg-[#fbfaf5] shadow-[0_2px_12px_rgba(0,0,0,0.18)]"
      style={{ aspectRatio: "210 / 297", containerType: "inline-size", transform: `rotate(${p.page % 2 ? -0.35 : 0.25}deg)` }}
      onClick={(e) => {
        if (!p.onPlace) return;
        const r = e.currentTarget.getBoundingClientRect();
        p.onPlace(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
      }}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]" aria-hidden>
        <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" /></filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
      {p.page === 1 ? <Cover {...p} /> : <AnswerPage {...p} />}
      {p.annotations.filter((a) => a.page === p.page).map((a, i) => (
        <div key={i} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${a.x}%`, top: `${a.y}%` }}>
          {a.kind === "tick" && <Check className="text-red-600" style={{ width: "6cqw", height: "6cqw" }} strokeWidth={3} />}
          {a.kind === "cross" && <X className="text-red-600" style={{ width: "6cqw", height: "6cqw" }} strokeWidth={3} />}
          {a.kind === "comment" && (
            <span className={`${hand.className} flex items-center gap-1 whitespace-nowrap rounded bg-red-50/80 px-1 text-red-600`} style={{ fontSize: "2.6cqw" }}>
              <MessageSquare style={{ width: "2.6cqw", height: "2.6cqw" }} /> {a.text}
            </span>
          )}
        </div>
      ))}
      <div className="absolute bottom-[1.5%] right-[4%] font-mono text-muted-foreground" style={{ fontSize: "1.6cqw" }}>
        {p.barcode} · p.{p.page}
      </div>
    </div>
  );
}

function Cover({ dummyNo, barcodeSvg, courseCode, courseTitle, examName, scheme, questionMarks }: Props) {
  const total = scheme.reduce((a, q) => a + (questionMarks[q.q] ?? 0), 0);
  return (
    <div className="absolute inset-0 p-[6%] font-serif text-[#4a2a14]" style={{ fontSize: "2.4cqw" }}>
      <div className="text-center">
        <div className="font-bold" style={{ fontSize: "3.3cqw" }}>NATIONAL LAW UNIVERSITY AND JUDICIAL ACADEMY, ASSAM</div>
        <div className="mt-[1%] tracking-[0.3em]" style={{ fontSize: "4.2cqw" }}>ANSWER BOOKLET</div>
        <div className="mt-[0.5%]">{examName}</div>
      </div>
      <div className="mt-[5%] flex items-start justify-between gap-[3%]">
        <div className="flex-1 space-y-[3.5cqw]">
          {[
            ["Roll No.", "mask"],
            ["Course Code", courseCode],
            ["Course", courseTitle],
            ["Signature of Candidate", "mask"],
          ].map(([label, value]) => (
            <div key={label} className="flex items-end gap-[2%]">
              <span className="w-[38%] shrink-0">{label}</span>
              {value === "mask" ? (
                <span className="flex h-[4.2cqw] flex-1 items-center justify-center bg-neutral-900 font-sans text-[1.8cqw] tracking-widest text-white/70">MASKED AT SCANNING</span>
              ) : (
                <span className={`${hand.className} flex-1 border-b border-[#4a2a14]/50 text-[#1f3a93]`} style={{ fontSize: "3cqw" }}>{value}</span>
              )}
            </div>
          ))}
        </div>
        <div className="w-[32%] rounded border border-neutral-300 bg-white p-[2%] text-center font-sans text-neutral-800 shadow-sm">
          <div className="[&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
          <div className="mt-[3%] text-[1.8cqw] uppercase tracking-wider text-neutral-500">Dummy No.</div>
          <div className="font-mono font-bold" style={{ fontSize: "3.2cqw" }}>{dummyNo}</div>
        </div>
      </div>
      <div className="mt-[8%]">
        <div className="mb-[1.5%] text-center font-bold">FOR EXAMINER&apos;S USE ONLY</div>
        <table className="w-full border-collapse text-center">
          <thead>
            <tr>
              <th className="border border-[#4a2a14]/50 py-[1%]">Q. No.</th>
              {scheme.map((q) => <th key={q.q} className="border border-[#4a2a14]/50">{q.q.replace("Q", "")}</th>)}
              <th className="border border-[#4a2a14]/50">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-[#4a2a14]/50 py-[2%]">Marks</td>
              {scheme.map((q) => (
                <td key={q.q} className={`${hand.className} border border-[#4a2a14]/50 text-red-600`} style={{ fontSize: "3.2cqw" }}>{questionMarks[q.q] ?? ""}</td>
              ))}
              <td className={`${hand.className} border border-[#4a2a14]/50 font-bold text-red-600`} style={{ fontSize: "3.4cqw" }}>{Object.keys(questionMarks).length ? total : ""}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="absolute bottom-[6%] left-[6%] right-[6%] text-[1.9cqw] leading-relaxed text-[#4a2a14]/80">
        Instructions: Write only on the ruled pages. Do not write your name or roll number anywhere inside the booklet. Any identifying mark will be treated as unfair means.
      </div>
    </div>
  );
}

function AnswerPage({ page, scheme, answers }: Props) {
  const qi = page - 2;
  const q = scheme[qi];
  const [a, b] = answers[qi] ?? ["", ""];
  return (
    <div
      className="absolute inset-0"
      style={{ backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent calc(4.2cqw - 1px), rgba(80,120,190,0.28) calc(4.2cqw - 1px), rgba(80,120,190,0.28) 4.2cqw)", backgroundPositionY: "9cqw" }}
    >
      <div className="absolute bottom-0 left-[11%] top-0 w-px bg-red-400/60" />
      <div className={`${hand.className} absolute left-[13%] right-[5%] top-[3.2cqw] text-[#1f3a93]`} style={{ fontSize: "3cqw", lineHeight: "4.2cqw" }}>
        {q && (
          <>
            <div className="font-normal underline decoration-1 underline-offset-4">Ans. {q.q.replace("Q", "")}.</div>
            <p className="mt-[4.2cqw] font-light">{a}</p>
            <p className="mt-[4.2cqw] font-light">{b}</p>
            <p className="mt-[4.2cqw] font-light">Hence, it is submitted that the position of law as discussed above is well settled.</p>
          </>
        )}
      </div>
    </div>
  );
}
