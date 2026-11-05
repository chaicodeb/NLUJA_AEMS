import { db } from "../db";
import { audit } from "../audit";
import { issueDocument } from "../docs";

export type AdmitCardPayload = {
  exam: { code: string; name: string };
  student: { name: string; rollNo: string; uid: string; programme: string; batch: string; semester: number; gender: string };
  papers: { code: string; title: string; date: string; session: string; durationMins: number; centre: string; room: string; bench: string }[];
};

export async function publishAdmitCards(examId: string, actor: { id: string; role: string }) {
  const exam = await db.exam.findUniqueOrThrow({ where: { id: examId } });
  const seatCount = await db.seatAllocation.count({ where: { examPaper: { examId } } });
  if (!seatCount) return { error: "Generate the seating plan before publishing admit cards." };

  const regs = await db.examRegistration.findMany({
    where: { examId },
    include: {
      student: { include: { batch: { include: { programme: true } } } },
      papers: { include: { examPaper: { include: { course: true, seats: { include: { room: true } } } } } },
    },
  });

  let issued = 0;
  for (const reg of regs) {
    const papers = reg.papers
      .map((rp) => {
        const seat = rp.examPaper.seats.find((s) => s.studentId === reg.studentId);
        return {
          code: rp.examPaper.course.code,
          title: rp.examPaper.course.title,
          date: rp.examPaper.date.toISOString(),
          session: rp.examPaper.session,
          durationMins: rp.examPaper.durationMins,
          centre: seat?.room.centre ?? "To be notified",
          room: seat?.room.name ?? "—",
          bench: seat?.benchNo ?? "—",
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    const payload: AdmitCardPayload = {
      exam: { code: exam.code, name: exam.name },
      student: {
        name: reg.student.name, rollNo: reg.student.rollNo, uid: reg.student.uid, gender: reg.student.gender,
        programme: reg.student.batch.programme.name, batch: reg.student.batch.name, semester: reg.student.batch.currentSemester,
      },
      papers,
    };
    await db.document.updateMany({ where: { type: "ADMIT_CARD", refId: reg.id, revoked: false }, data: { revoked: true } });
    const doc = await issueDocument({ type: "ADMIT_CARD", studentId: reg.studentId, refId: reg.id, payload, issuedById: actor.id });
    await db.examRegistration.update({ where: { id: reg.id }, data: { admitCardCode: doc.verifyCode } });
    issued++;
  }

  await db.exam.update({ where: { id: examId }, data: { admitCardsPublished: true, registrationOpen: false, status: "SCHEDULED" } });
  await audit({
    actorId: actor.id, actorRole: actor.role, action: "ADMIT_CARDS_PUBLISHED", entity: "Exam", entityId: examId,
    summary: `${issued} admit cards issued with QR verification and digital signature; registration closed`,
    before: { status: exam.status, registrationOpen: exam.registrationOpen }, after: { status: "SCHEDULED", registrationOpen: false, issued },
  });
  return { issued };
}
