import { db } from "../db";
import { formAnalytics } from "../feedback/feedback";
import { alumniOverview } from "../alumni/alumni";
import { PUBLISHED_ORDER, firstPerSemester } from "../results/engine";

export type Cell = string | number;
export type Section = { code: string; title: string; note?: string; columns: string[]; rows: Cell[][] };
export type Return = { body: "AISHE" | "NIRF" | "NAAC"; title: string; period: string; description: string; sections: Section[] };

const CATS = ["GEN", "SC", "ST", "OBC", "EWS"];
const CAT_LABEL: Record<string, string> = { GEN: "General", SC: "SC", ST: "ST", OBC: "OBC", EWS: "EWS" };
const LEVEL: Record<string, string> = { UG: "Under-graduate (integrated)", PG: "Post-graduate", DOCTORAL: "Ph.D." };
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

/** Final-semester outcome of every batch that has reached the end of its programme. */
async function outTurn() {
  const batches = (await db.batch.findMany({ include: { programme: true } })).filter((b) => b.currentSemester >= b.programme.durationSemesters);
  const students = await db.student.findMany({
    where: { batchId: { in: batches.map((b) => b.id) } },
    include: { batch: { include: { programme: true } }, semResults: { where: { run: { status: "PUBLISHED" } }, orderBy: PUBLISHED_ORDER } },
  });
  return students.map((s) => {
    const sems = firstPerSemester(s.semResults);
    const last = sems.find((x) => x.semester === s.batch.programme.durationSemesters);
    const passed = !!last && sems.length === s.batch.programme.durationSemesters && sems.every((x) => x.result === "PASS");
    return { s, appeared: !!last, passed, cgpa: last?.cgpa ?? null };
  });
}

async function aishe(): Promise<Return> {
  const students = await db.student.findMany({ where: { status: "ACTIVE" }, include: { batch: { include: { programme: true } } } });
  const programmes = [...new Map(students.map((s) => [s.batch.programme.code, s.batch.programme])).values()];
  const enrolRows: Cell[][] = programmes.map((p) => {
    const mine = students.filter((s) => s.batch.programme.code === p.code);
    const cells: Cell[] = [];
    for (const c of CATS) for (const g of ["M", "F"]) cells.push(mine.filter((s) => s.category === c && s.gender === g).length);
    return [LEVEL[p.level], p.name, ...cells, mine.filter((s) => s.gender === "M").length, mine.filter((s) => s.gender === "F").length, mine.length];
  });
  const total: Cell[] = ["", "Total"];
  for (let i = 2; i < enrolRows[0]?.length; i++) total.push(enrolRows.reduce((a, r) => a + Number(r[i]), 0));

  const out = await outTurn();
  const outRows: Cell[][] = CATS.map((c) => {
    const mine = out.filter((o) => o.s.category === c);
    const f = (xs: typeof out) => [xs.filter((o) => o.s.gender === "M").length, xs.filter((o) => o.s.gender === "F").length];
    return [CAT_LABEL[c], ...f(mine.filter((o) => o.appeared)), ...f(mine.filter((o) => o.passed)), ...f(mine.filter((o) => o.passed && (o.cgpa ?? 0) >= 6))];
  });

  const faculty = await db.user.findMany({ where: { role: "FACULTY" } });
  const desig = [...new Set(faculty.map((f) => f.designation ?? "Faculty"))];
  return {
    body: "AISHE", title: "All India Survey on Higher Education — data capture format (university)", period: "Academic year 2026-27",
    description: "Block-wise figures for the AISHE portal, computed from live records: enrolment of active students, out-turn of the batch completing in 2026, and teaching staff.",
    sections: [
      {
        code: "AISHE-ENR", title: "Enrolment by programme, social category and gender (regular mode)",
        columns: ["Level", "Programme", ...CATS.flatMap((c) => [`${CAT_LABEL[c]} M`, `${CAT_LABEL[c]} F`]), "Total M", "Total F", "Grand total"],
        rows: [...enrolRows, total],
      },
      {
        code: "AISHE-OUT", title: "Out-turn / pass-outs (final year, 2025-26)", note: "Passed with 60% or more = CGPA ≥ 6.0 (percentage = CGPA × 10 under the University's regulations).",
        columns: ["Category", "Appeared M", "Appeared F", "Passed M", "Passed F", "≥60% M", "≥60% F"],
        rows: outRows,
      },
      { code: "AISHE-STAFF", title: "Teaching staff in position by designation", note: "Demonstration data has three teachers; gender of staff is captured in the HR module in production.", columns: ["Designation", "Number"], rows: desig.map((d) => [d, faculty.filter((f) => (f.designation ?? "Faculty") === d).length]) },
    ],
  };
}

async function nirf(): Promise<Return> {
  const students = await db.student.findMany({ where: { status: { in: ["ACTIVE", "COMPLETED"] } }, include: { batch: { include: { programme: true } } } });
  const batches = [...new Map(students.map((s) => [s.batch.code, s.batch])).values()].sort((a, b) => a.code.localeCompare(b.code));
  const strength: Cell[][] = batches.map((b) => {
    const mine = students.filter((s) => s.batchId === b.id);
    return [b.programme.name, b.admissionYear, mine.length, mine.filter((s) => s.gender === "M").length, mine.filter((s) => s.gender === "F").length, `${pct(mine.filter((s) => s.gender === "F").length, mine.length)}%`, mine.filter((s) => s.status === "ACTIVE").length];
  });
  const a = await alumniOverview({});
  const go: Cell[][] = a.byYear.filter((y) => y.year >= 2023).sort((x, y) => x.year - y.year).map((y) => [y.year, y.total, y.placed, y.higher, `${pct(y.placed + y.higher, y.total)}%`, "Not collected in demo"]);
  const out = await outTurn();
  const phd = await db.student.count({ where: { status: "ACTIVE", batch: { programme: { code: "PHD" } } } });
  return {
    body: "NIRF", title: "National Institutional Ranking Framework — Law category data", period: "NIRF 2027 (data for 2025-26)",
    description: "Data for the NIRF portal: student strength (TLR), graduation outcomes (GO) from the alumni registry, and Ph.D. scholars.",
    sections: [
      { code: "NIRF-SS", title: "Total actual student strength by batch (TLR)", columns: ["Programme", "Year of admission", "Students", "Male", "Female", "Women %", "Currently enrolled"], rows: strength },
      {
        code: "NIRF-GO", title: "Placement and higher studies — graduating batches (GO)", note: "From alumni profiles; median salary is collected through the placement cell in production.",
        columns: ["Graduating year", "Graduates on record", "Placed", "Higher studies", "Progression %", "Median salary"], rows: go,
      },
      {
        code: "NIRF-GPHE", title: "Graduation in the stipulated time (GPHE)",
        columns: ["Programme", "Batch", "Students admitted", "Graduated in stipulated time", "%"],
        rows: [...new Map(out.map((o) => [o.s.batch.code, o.s.batch])).values()].map((b) => {
          const mine = out.filter((o) => o.s.batchId === b.id);
          return [b.programme.name, b.name, mine.length, mine.filter((o) => o.passed).length, `${pct(mine.filter((o) => o.passed).length, mine.length)}%`];
        }),
      },
      { code: "NIRF-PHD", title: "Ph.D. scholars", columns: ["Measure", "Value"], rows: [["Full-time Ph.D. scholars enrolled", phd], ["Ph.D. degrees awarded in 2025-26", 0]] },
    ],
  };
}

async function naac(): Promise<Return> {
  const out = await outTurn();
  const appeared = out.filter((o) => o.appeared).length;
  const passed = out.filter((o) => o.passed).length;
  const [active, faculty] = await Promise.all([db.student.count({ where: { status: "ACTIVE" } }), db.user.count({ where: { role: "FACULTY" } })]);
  const sss = await db.feedbackForm.findFirst({ where: { type: "INSTITUTION" }, orderBy: { opensAt: "desc" } });
  const sssA = sss ? await formAnalytics(sss.id) : null;
  const [forms, responses, actions] = await Promise.all([db.feedbackForm.count({ where: { status: { not: "DRAFT" } } }), db.feedbackResponse.count(), db.feedbackAction.count()]);
  const cycle = await db.admissionCycle.findFirst({ orderBy: { opensAt: "desc" }, include: { applications: true } });
  const seats = cycle ? Object.values(cycle.seatMatrix as Record<string, number>).reduce((x, y) => x + y, 0) : 0;
  const reservedSeats = cycle ? Object.entries(cycle.seatMatrix as Record<string, number>).filter(([k]) => k !== "UR").reduce((x, [, v]) => x + v, 0) : 0;
  const offered = cycle?.applications.filter((x) => x.outcome === "OFFERED" || x.outcome === "ADMITTED") ?? [];
  const admitted = cycle?.applications.filter((x) => x.outcome === "ADMITTED") ?? [];
  const runs = await db.resultRun.findMany({ where: { status: "PUBLISHED", exam: { code: { not: "LEGACY-MIGRATION" } } }, include: { exam: true } });
  const days = runs.filter((r) => r.publishedAt && r.publishedAt > r.exam.endDate).map((r) => Math.round((r.publishedAt!.getTime() - r.exam.endDate.getTime()) / 86400000));
  const simulated = runs.length > 0 && days.length === 0;
  const a = await alumniOverview({});
  const latest = a.byYear.find((y) => y.year === 2026) ?? a.byYear[0];
  const rows: Cell[][] = [
    ["1.4.1", "Feedback on curriculum collected, analysed and acted upon", `${forms} forms, ${responses} responses, ${actions} actions recorded`, "Feedback & Surveys"],
    ["2.1.1", "Enrolment percentage (seats filled ÷ sanctioned)", cycle ? `${pct(offered.length, seats)}% (${offered.length}/${seats} offered, ${admitted.length} admitted) — ${cycle.name}` : "—", "Admissions"],
    ["2.1.2", "Seats filled against reserved categories", cycle ? `${offered.filter((x) => x.seatCategory && x.seatCategory !== "UR").length} of ${reservedSeats}` : "—", "Admissions (seat matrix)"],
    ["2.2.2", "Student – full-time teacher ratio", faculty ? `${(active / faculty).toFixed(1)} : 1 (${active} students, ${faculty} teachers)` : "—", "Students, Faculty"],
    ["2.5.1", "Days from last examination to result declaration (average)", days.length ? `${Math.round(days.reduce((x, y) => x + y, 0) / days.length)} days` : simulated ? "Not measurable — the demo runs the examination ahead of its calendar dates" : "No 2026-27 result published yet", "Result processing"],
    ["2.6.3", "Pass percentage of final-year students", `${pct(passed, appeared)}% (${passed} of ${appeared})`, "Published results"],
    ["2.7.1", "Student Satisfaction Survey (index out of 5)", sssA?.overall.index != null ? `${sssA.overall.index.toFixed(2)} from ${sssA.overall.n} responses` : "—", "Feedback & Surveys"],
    ["5.2.1", "Placement of outgoing students", latest ? `${pct(latest.placed, latest.total)}% (${latest.placed} of ${latest.total}, ${latest.year})` : "—", "Alumni"],
    ["5.2.2", "Progression to higher education", latest ? `${pct(latest.higher, latest.total)}% (${latest.higher} of ${latest.total}, ${latest.year})` : "—", "Alumni"],
    ["5.2.3", "Students qualifying state/national examinations (NET, judicial services, civil services, CLAT PG)", `${a.exams} alumni on record`, "Alumni"],
  ];
  return {
    body: "NAAC", title: "NAAC Annual Quality Assurance Report — quantitative metrics", period: "AQAR 2025-26 (as on date)",
    description: "Quantitative metrics computed from live records, with the module each figure comes from so the IQAC can attach the supporting data.",
    sections: [{ code: "NAAC-AQAR", title: "Quantitative metrics", columns: ["Metric", "Description", "Value", "Source in the system"], rows }],
  };
}

export async function statutoryReturns() {
  return Promise.all([aishe(), nirf(), naac()]);
}

export async function sectionByCode(code: string) {
  for (const r of await statutoryReturns()) {
    const s = r.sections.find((x) => x.code === code);
    if (s) return { report: r, section: s };
  }
  return null;
}
