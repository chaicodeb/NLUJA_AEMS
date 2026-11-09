import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { BALLB_2022 } from "./scenarios";
import { MEMORIAL_CRITERIA, criteriaFor } from "../moot/shared";

const JUDGES = ["Justice (Retd.) B. K. Sharma", "Adv. Pallavi Deka", "Adv. Rupam Choudhury"];

/** Deterministic pseudo-random numbers so the standings are the same after every reset. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

export async function seedMoot() {
  const course = await db.course.findFirst({ where: { code: "BL9.5" } });
  const batch = await db.batch.findFirst({ where: { code: "BALLB-2022" } });
  if (!course || !batch) return;
  const students = await db.student.findMany({ where: { batchId: batch.id }, orderBy: { rollNo: "asc" } });
  const ability = (name: string) => BALLB_2022.find((s) => s.name === name)?.ability ?? 0.65;
  const r = rng(2026);

  const comp = await db.mootCompetition.create({
    data: {
      name: "NLUJA Intra-University Moot Court Competition 2026",
      courseId: course.id,
      problem: "Republic of Indus v. Brahmaputra Valley Farmers' Collective — constitutionality of a State law diverting river water to an industrial corridor; questions of Article 21, Article 14 and the public trust doctrine.",
      status: "ORALS",
      weights: { memorial: 30, oral: 60, researcher: 10 },
    },
  });

  const teams: Prisma.MootTeamGetPayload<{ include: { members: { include: { student: true } } } }>[] = [];
  for (let i = 0; i < Math.floor(students.length / 3); i++) {
    const trio = students.slice(i * 3, i * 3 + 3);
    const strength = trio.reduce((a, s) => a + ability(s.name), 0) / 3;
    const detail = Object.fromEntries(MEMORIAL_CRITERIA.map((k) => [k.code, Math.min(k.max, Math.round(k.max * (0.45 + strength * 0.5 + (r() - 0.5) * 0.12) * 2) / 2)]));
    const memorial = Object.values(detail).reduce((a, b) => a + b, 0);
    const team = await db.mootTeam.create({
      data: {
        competitionId: comp.id, code: `T${i + 1}`, memorial, memorialDetail: detail as Prisma.InputJsonValue, memorialBy: "Dr. Rituraj Gogoi (memorial evaluation panel)",
        members: { create: trio.map((s, k) => ({ studentId: s.id, role: ["SPEAKER_1", "SPEAKER_2", "RESEARCHER"][k] })) },
      },
      include: { members: { include: { student: true } } },
    });
    teams.push(team);
  }

  // Preliminary rounds: every team argues once for each side. The last one is left for live scoring.
  const n = teams.length;
  const half = Math.floor(n / 2);
  const pairs = [
    ...Array.from({ length: half }, (_, i) => [teams[i], teams[i + half]] as const),
    ...Array.from({ length: half }, (_, i) => [teams[i + half], teams[(i + 1) % half]] as const),
  ];
  for (const [i, [p, q]] of pairs.entries()) {
    const day = i < half ? 24 : 25;
    const slot = i % half;
    // Two halls in parallel: 10:00, 11:00 and 12:00 IST.
    const startsAt = new Date(Date.UTC(2026, 9, day, 4 + Math.floor(slot / 2), 30));
    const courtroom = slot % 2 === 0 ? "Moot Court Hall 1" : "Moot Court Hall 2";
    const live = i === pairs.length - 1;
    const round = await db.mootRound.create({
      data: {
        competitionId: comp.id, stage: "PRELIMINARY", name: `Preliminary ${i + 1}: ${p.code} v ${q.code}`, courtroom,
        startsAt: live ? new Date(Date.UTC(2026, 10, 7, 5 + (i % 2), 0)) : startsAt, durationMins: 60,
        petitionerId: p.id, respondentId: q.id, judges: i % 3 === 0 ? JUDGES : JUDGES.slice(0, 2), status: live ? "SCHEDULED" : "SCORED",
      },
    });
    if (live) continue;
    for (const judge of round.judges) {
      for (const m of [...p.members, ...q.members]) {
        const a = ability(m.student.name);
        const criteria = Object.fromEntries(criteriaFor(m.role).map((k) => [k.code, Math.max(0, Math.min(k.max, Math.round(k.max * (0.35 + a * 0.6 + (r() - 0.5) * 0.25) * 2) / 2))]));
        await db.mootScore.create({ data: { roundId: round.id, judge, memberId: m.id, criteria, total: Object.values(criteria).reduce((x, y) => x + y, 0) } });
      }
    }
  }
}
