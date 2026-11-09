import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { saveSheetDraft } from "../marks/internal";
import { COURTROOMS, MEMORIAL_CRITERIA, ROLES, SPEAKER_CRITERIA, criteriaFor, maxFor, type Weights } from "./shared";

type Actor = { id: string; role: string };
const MANAGERS = ["HOD", "ACADEMIC_STAFF", "COE", "ADMIN"];
const half = (n: number) => Math.round(n * 2) / 2;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export async function listCompetitions() {
  return db.mootCompetition.findMany({ orderBy: { createdAt: "desc" }, include: { teams: { include: { members: true } }, rounds: true } });
}

async function load(id: string) {
  return db.mootCompetition.findUnique({
    where: { id },
    include: {
      teams: { include: { members: { include: { student: true } } }, orderBy: { code: "asc" } },
      rounds: { include: { scores: true }, orderBy: { startsAt: "asc" } },
    },
  });
}

export async function canManage(competitionId: string, actor: Actor) {
  if (MANAGERS.includes(actor.role)) return true;
  const c = await db.mootCompetition.findUnique({ where: { id: competitionId } });
  if (!c?.courseId || actor.role !== "FACULTY") return false;
  const course = await db.course.findUnique({ where: { id: c.courseId } });
  return course?.facultyId === actor.id;
}

/** Standings, awards and the marks each student would receive in the moot course. */
export async function competitionView(id: string) {
  const c = await load(id);
  if (!c) return null;
  const weights = c.weights as unknown as Weights;
  const memberTeam = new Map(c.teams.flatMap((t) => t.members.map((m) => [m.id, t])));
  const memberById = new Map(c.teams.flatMap((t) => t.members.map((m) => [m.id, m])));
  const scored = c.rounds.filter((r) => r.status === "SCORED");

  const roundResults = c.rounds.map((r) => {
    const points = (teamId: string) => r.scores.filter((s) => memberTeam.get(s.memberId)?.id === teamId).reduce((a, s) => a + s.total, 0);
    const p = points(r.petitionerId);
    const q = points(r.respondentId);
    const memo = (tid: string) => c.teams.find((t) => t.id === tid)?.memorial ?? 0;
    const winner = r.status !== "SCORED" ? null : p !== q ? (p > q ? r.petitionerId : r.respondentId) : memo(r.petitionerId) >= memo(r.respondentId) ? r.petitionerId : r.respondentId;
    return { round: r, petitionerPoints: p, respondentPoints: q, winner };
  });

  const memberStats = new Map(
    [...memberById.values()].map((m) => {
      const own = scored.flatMap((r) => r.scores.filter((s) => s.memberId === m.id));
      const pcts = own.map((s) => s.total / maxFor(m.role));
      return [m.id, { member: m, avg: mean(pcts), sheets: own.length, perCriterion: Object.fromEntries(criteriaFor(m.role).map((k) => [k.code, mean(own.map((s) => Number((s.criteria as Record<string, number>)[k.code] ?? 0)))])) }];
    }),
  );

  const standings = c.teams
    .map((t) => {
      const speakers = t.members.filter((m) => m.role !== "RESEARCHER").map((m) => memberStats.get(m.id)!.avg).filter((v): v is number => v != null);
      const researcher = t.members.filter((m) => m.role === "RESEARCHER").map((m) => memberStats.get(m.id)!.avg).filter((v): v is number => v != null);
      const memorialPct = (t.memorial ?? 0) / 100;
      const oralPct = mean(speakers) ?? 0;
      const researchPct = mean(researcher) ?? 0;
      const total = weights.memorial * memorialPct + weights.oral * oralPct + weights.researcher * researchPct;
      const played = roundResults.filter((x) => x.winner && (x.round.petitionerId === t.id || x.round.respondentId === t.id));
      return { team: t, memorial: t.memorial, oral: oralPct * 100, research: researchPct * 100, total, played: played.length, wins: played.filter((x) => x.winner === t.id).length };
    })
    .sort((a, b) => b.wins - a.wins || b.total - a.total || (b.memorial ?? 0) - (a.memorial ?? 0))
    .map((s, i) => ({ ...s, rank: i + 1 }));

  const ranked = (role: (r: string) => boolean) =>
    [...memberStats.values()].filter((s) => role(s.member.role) && s.avg != null && s.sheets >= 2).sort((a, b) => b.avg! - a.avg!);
  const bestSpeaker = ranked((r) => r !== "RESEARCHER")[0];
  const bestResearcher = ranked((r) => r === "RESEARCHER")[0];
  const bestMemorial = [...c.teams].filter((t) => t.memorial != null).sort((a, b) => b.memorial! - a.memorial!)[0];

  // Marks for the moot course: memorial → MEMO (out of 25); oral criteria → ORAL (5 × 5).
  const marks = [...memberStats.values()].map((s) => {
    const team = memberTeam.get(s.member.id)!;
    const memo = team.memorial == null ? null : half((team.memorial / 100) * 25);
    const oral =
      s.avg == null
        ? null
        : s.member.role === "RESEARCHER"
          ? Object.fromEntries(SPEAKER_CRITERIA.map((k) => [k.code, half(s.avg! * k.max)]))
          : Object.fromEntries(SPEAKER_CRITERIA.map((k) => [k.code, half(s.perCriterion[k.code] ?? 0)]));
    return { student: s.member.student, role: s.member.role, team: team.code, memo, oral, oralTotal: oral ? Object.values(oral).reduce((a, b) => a + b, 0) : null };
  }).sort((a, b) => a.student.rollNo.localeCompare(b.student.rollNo));

  return { competition: c, weights, standings, rounds: roundResults, awards: { bestSpeaker, bestResearcher, bestMemorial }, marks };
}

export async function scheduleRound(competitionId: string, input: { stage: string; name: string; courtroom: string; startsAt: string; durationMins: number; petitionerId: string; respondentId: string; judges: string[] }, actor: Actor) {
  if (!(await canManage(competitionId, actor))) return { error: "Only the moot coordinator can schedule rounds." };
  if (!COURTROOMS.includes(input.courtroom)) return { error: "Choose a moot court hall." };
  if (input.petitionerId === input.respondentId) return { error: "A team cannot argue against itself." };
  const judges = input.judges.map((j) => j.trim()).filter(Boolean);
  if (!judges.length || judges.length > 3) return { error: "A bench has one to three judges." };
  const start = new Date(input.startsAt);
  if (Number.isNaN(start.getTime())) return { error: "Choose a date and time." };
  const end = new Date(start.getTime() + input.durationMins * 60000);
  const rounds = await db.mootRound.findMany({ where: { competitionId } });
  const overlaps = (r: { startsAt: Date; durationMins: number }) => r.startsAt < end && new Date(r.startsAt.getTime() + r.durationMins * 60000) > start;
  const hall = rounds.find((r) => r.courtroom === input.courtroom && overlaps(r));
  if (hall) return { error: `${input.courtroom} is already booked for ${hall.name} at that time.` };
  const team = rounds.find((r) => overlaps(r) && [r.petitionerId, r.respondentId].some((t) => t === input.petitionerId || t === input.respondentId));
  if (team) return { error: `One of these teams is already arguing in ${team.name} at that time.` };
  const round = await db.mootRound.create({ data: { competitionId, stage: input.stage, name: input.name.trim() || "Round", courtroom: input.courtroom, startsAt: start, durationMins: input.durationMins, petitionerId: input.petitionerId, respondentId: input.respondentId, judges } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "MOOT_ROUND_SCHEDULED", entity: "MootRound", entityId: round.id, summary: `${round.name} scheduled in ${round.courtroom} on ${start.toISOString()} (${judges.length} judge(s))` });
  return { ok: true };
}

export async function saveMemorial(teamId: string, detail: Record<string, number>, evaluator: string, actor: Actor) {
  const team = await db.mootTeam.findUniqueOrThrow({ where: { id: teamId } });
  if (!(await canManage(team.competitionId, actor))) return { error: "Only the moot coordinator can record memorial scores." };
  for (const k of MEMORIAL_CRITERIA) {
    const v = detail[k.code];
    if (!(v >= 0 && v <= k.max)) return { error: `${k.name}: enter 0–${k.max}.` };
  }
  const total = MEMORIAL_CRITERIA.reduce((a, k) => a + detail[k.code], 0);
  await db.mootTeam.update({ where: { id: teamId }, data: { memorial: total, memorialDetail: detail as Prisma.InputJsonValue, memorialBy: evaluator.trim() || null } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "MOOT_MEMORIAL_SCORED", entity: "MootTeam", entityId: teamId, summary: `Team ${team.code} memorial scored ${total}/100${evaluator ? ` by ${evaluator}` : ""}`, before: { memorial: team.memorial }, after: { memorial: total } });
  return { ok: true, total };
}

/** One judge's score sheet for a round: every speaker and researcher of both teams. */
export async function saveScoreSheet(roundId: string, judge: string, sheet: Record<string, Record<string, number>>, actor: Actor) {
  const round = await db.mootRound.findUniqueOrThrow({ where: { id: roundId }, include: { scores: true } });
  if (!(await canManage(round.competitionId, actor))) return { error: "Only the moot coordinator can enter score sheets." };
  if (!round.judges.includes(judge)) return { error: "That judge is not on this bench." };
  const members = await db.mootMember.findMany({ where: { teamId: { in: [round.petitionerId, round.respondentId] } }, include: { student: true } });
  for (const m of members) {
    for (const k of criteriaFor(m.role)) {
      const v = sheet[m.id]?.[k.code];
      if (!(typeof v === "number" && v >= 0 && v <= k.max && Math.round(v * 2) === v * 2)) return { error: `${m.student.name} (${ROLES[m.role]}): ${k.name} must be 0–${k.max} in half marks.` };
    }
  }
  await db.$transaction(
    members.map((m) => {
      const criteria = Object.fromEntries(criteriaFor(m.role).map((k) => [k.code, sheet[m.id][k.code]]));
      const total = Object.values(criteria).reduce((a, b) => a + b, 0);
      return db.mootScore.upsert({
        where: { roundId_judge_memberId: { roundId, judge, memberId: m.id } },
        create: { roundId, judge, memberId: m.id, criteria, total },
        update: { criteria, total },
      });
    }),
  );
  const count = await db.mootScore.groupBy({ by: ["judge"], where: { roundId }, _count: true });
  const complete = round.judges.every((j) => count.find((c) => c.judge === j)?._count === members.length);
  if (complete) await db.mootRound.update({ where: { id: roundId }, data: { status: "SCORED" } });
  await audit({ actorId: actor.id, actorRole: actor.role, action: "MOOT_SCORES_RECORDED", entity: "MootRound", entityId: roundId, summary: `${round.name}: score sheet of ${judge} recorded (${members.length} participants)${complete ? " — all judges in, round result computed" : ""}` });
  return { ok: true, complete };
}

/** Writes the moot marks into the course's Moot Memorial and Oral Argumentation sheets (as drafts for the teacher to submit). */
export async function postToMarks(competitionId: string, actor: Actor) {
  const view = await competitionView(competitionId);
  if (!view?.competition.courseId) return { error: "This competition is not linked to a course." };
  const course = await db.course.findUniqueOrThrow({ where: { id: view.competition.courseId }, include: { scheme: { include: { components: true } } } });
  if (course.facultyId !== actor.id) return { error: "Only the course teacher can post moot scores into the marks sheets." };
  const comps = ["MEMO", "ORAL"].map((code) => course.scheme.components.find((k) => k.code === code)).filter((k): k is NonNullable<typeof k> => !!k);
  const sheets = await db.internalMarksSheet.findMany({ where: { courseId: course.id, componentId: { in: comps.map((k) => k.id) } }, include: { component: true } });
  const locked = sheets.filter((s) => !["DRAFT", "RETURNED"].includes(s.status));
  if (locked.length) return { error: `The ${locked.map((s) => s.component.name).join(" and ")} sheet(s) for ${course.code} are already ${locked[0].status.toLowerCase()} — the Controller of Examinations must reopen them in Internal Marks before moot scores can be posted.` };
  const enrolments = await db.enrolment.findMany({ where: { courseId: course.id, studentId: { in: view.marks.map((m) => m.student.id) } } });
  for (const sheet of sheets) {
    const isMemo = sheet.component.code === "MEMO";
    const rows = view.marks
      .map((m) => ({ m, e: enrolments.find((e) => e.studentId === m.student.id) }))
      .filter((x) => x.e && (isMemo ? x.m.memo != null : x.m.oral != null))
      .map(({ m, e }) => ({ enrolmentId: e!.id, marks: isMemo ? m.memo : m.oralTotal, absent: false, detail: isMemo ? null : m.oral }));
    const res = await saveSheetDraft(sheet.id, rows, actor);
    if ("error" in res) return { error: `${sheet.component.name}: ${res.error}` };
  }
  await audit({ actorId: actor.id, actorRole: actor.role, action: "MOOT_MARKS_POSTED", entity: "MootCompetition", entityId: competitionId, summary: `Moot scores posted to ${course.code} Moot Memorial and Oral Argumentation sheets for ${view.marks.length} students (drafts for the teacher to submit)` });
  return { ok: true };
}
