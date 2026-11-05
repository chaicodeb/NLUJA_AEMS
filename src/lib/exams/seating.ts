import { db } from "../db";
import { audit } from "../audit";
import { rng } from "../demo/scenarios";

export function sessionKey(date: Date, session: string) {
  return `${date.toISOString().slice(0, 10)}|${session}`;
}

function shuffle<T>(arr: T[], rand: () => number) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function benchLabel(row: number, col: number) {
  return `${String.fromCharCode(65 + row)}${col + 1}`;
}

/**
 * Rule-based seating: candidates of each session are shuffled, then laid out in a
 * checkerboard across rooms so that no two candidates of the same paper sit side by side
 * (front/back/left/right) whenever more than one paper is written in the session.
 */
export async function generateSeating(examId: string, actor: { id: string; role: string }, seed = Date.now()) {
  const rand = rng(seed);
  const exam = await db.exam.findUniqueOrThrow({
    where: { id: examId },
    include: { papers: { include: { course: true, registrationPapers: { include: { registration: true } } } } },
  });
  const rooms = await db.room.findMany({ orderBy: { code: "asc" } });

  await db.seatAllocation.deleteMany({ where: { examPaper: { examId } } });
  await db.invigilation.deleteMany({ where: { examId } });

  const sessions = new Map<string, typeof exam.papers>();
  for (const p of exam.papers) {
    const k = sessionKey(p.date, p.session);
    sessions.set(k, [...(sessions.get(k) ?? []), p]);
  }

  const faculty = await db.user.findMany({ where: { role: "FACULTY" }, orderBy: { name: "asc" } });
  const squad = await db.user.findFirst({ where: { role: "HOD" } });
  let facultyCursor = 0;
  let seated = 0;
  let adjacentConflicts = 0;

  for (const [key, papers] of sessions) {
    const queues = papers
      .map((p) => ({ paper: p, list: shuffle(p.registrationPapers.filter((rp) => rp.registration.status !== "CANCELLED").map((rp) => rp.registration.studentId), rand) }))
      .filter((q) => q.list.length);
    if (!queues.length) continue;
    const usedRooms = new Set<string>();
    const grid = new Map<string, string>(); // roomId|r|c -> paperId

    outer: for (const room of rooms) {
      for (let r = 0; r < room.rows; r++) {
        for (let c = 0; c < room.cols; c++) {
          const remaining = queues.filter((q) => q.list.length);
          if (!remaining.length) break outer;
          const preferred = queues[(r + c) % queues.length];
          const neighbours = [grid.get(`${room.id}|${r}|${c - 1}`), grid.get(`${room.id}|${r - 1}|${c}`)];
          let pick = preferred.list.length && !neighbours.includes(preferred.paper.id) ? preferred : remaining.find((q) => !neighbours.includes(q.paper.id));
          if (!pick) {
            // Single-paper session (or exhausted alternatives): leave alternate seats empty where capacity allows.
            const seatsLeft = rooms.slice(rooms.indexOf(room)).reduce((a, rm) => a + rm.rows * rm.cols, 0) - (r * room.cols + c);
            if (seatsLeft > remaining.reduce((a, q) => a + q.list.length, 0) * 1.5) continue;
            pick = remaining.sort((a, b) => b.list.length - a.list.length)[0];
            adjacentConflicts++;
          }
          const studentId = pick.list.shift()!;
          grid.set(`${room.id}|${r}|${c}`, pick.paper.id);
          usedRooms.add(room.id);
          await db.seatAllocation.create({
            data: { examPaperId: pick.paper.id, studentId, roomId: room.id, benchNo: `${room.code}/${benchLabel(r, c)}` },
          });
          seated++;
        }
      }
    }

    const [dateStr, session] = key.split("|");
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    const setters = new Set(papers.map((p) => p.setterId));
    for (const roomId of usedRooms) {
      // A paper's setter is never assigned to invigilate the session in which that paper is written.
      let inv = faculty[facultyCursor % faculty.length];
      for (let i = 0; i < faculty.length && setters.has(inv.id); i++) inv = faculty[++facultyCursor % faculty.length];
      facultyCursor++;
      await db.invigilation.create({ data: { examId, date, session, roomId, userId: inv.id, duty: "INVIGILATOR" } });
    }
    if (squad) await db.invigilation.create({ data: { examId, date, session, userId: squad.id, duty: "FLYING_SQUAD" } });
  }

  await audit({
    actorId: actor.id, actorRole: actor.role, action: "SEATING_GENERATED", entity: "Exam", entityId: examId,
    summary: `Seating generated for ${seated} candidate-papers across ${sessions.size} sessions; ${adjacentConflicts} same-paper adjacencies`,
    after: { seated, sessions: sessions.size, adjacentConflicts, seed },
  });
  return { seated, sessions: sessions.size, adjacentConflicts };
}
