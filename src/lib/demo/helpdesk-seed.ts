import { db } from "../db";
import { CATEGORIES, SLA } from "../helpdesk/shared";

type Msg = { at: number; from: "user" | "agent" | "event"; body: string; internal?: boolean };
type Seed = { by: string; category: string; priority: string; subject: string; ageH: number; status: string; page?: string; msgs: Msg[]; resolvedAt?: number; rating?: number };

/** Ages are hours before seeding, message times hours after the ticket was raised, so SLA states look the same whenever the demo is reset. */
const TICKETS: Seed[] = [
  { by: "parent@nluassam.ac.in", category: "ACCESS", priority: "MEDIUM", subject: "Forgot the password for the parent login", ageH: 50, status: "CLOSED", resolvedAt: 3, rating: 5,
    msgs: [{ at: 0, from: "user", body: "I cannot sign in to see my daughter's results. The password I was given does not work." }, { at: 2.5, from: "agent", body: "We have reset your password and sent it to your registered mobile ending 4417. Please change it after signing in." }] },
  { by: "student3@nluassam.ac.in", category: "RESULTS", priority: "MEDIUM", subject: "Revaluation status not updated", ageH: 100, status: "CLOSED", resolvedAt: 30, rating: 4,
    msgs: [{ at: 0, from: "user", body: "I applied for revaluation of ML1.3 four days ago; the page still says 'Paid'." }, { at: 6, from: "agent", body: "Your script has been assigned to a second evaluator; the status changes once marks are submitted, usually within three working days." }, { at: 30, from: "agent", body: "Revaluation completed — the result is now on your Results page." }] },
  { by: "priya.bora@example.com", category: "ADMISSIONS", priority: "LOW", subject: "Which OBC-NCL certificate format is accepted?", ageH: 70, status: "RESOLVED", resolvedAt: 5,
    msgs: [{ at: 0, from: "user", body: "My category certificate was returned. Is the State format acceptable, or do I need the Central list format?" }, { at: 5, from: "agent", body: "For a central university admission we need the Central-list OBC-NCL certificate issued on or after 1 April 2026. A State-format certificate will be returned again. Please upload the new one on My Application." }] },
  { by: "rituraj.gogoi@nluassam.ac.in", category: "ATTENDANCE", priority: "MEDIUM", subject: "Biometric count missing for the 29 Oct BL9.2 class", ageH: 20, status: "WAITING_USER", page: "/attendance/classes",
    msgs: [{ at: 0, from: "user", body: "The register for my 29 October Taxation class shows no biometric count, so I cannot reconcile it." }, { at: 1.2, from: "agent", body: "The device in Room 101 logged a session at 11:05 instead of 10:00. Can you confirm the class started late that day? We will map the punches to your class." }] },
  { by: "student4@nluassam.ac.in", category: "FEES", priority: "HIGH", subject: "Supplementary examination fee debited twice", ageH: 30, status: "IN_PROGRESS", page: "/me/exams",
    msgs: [{ at: 0, from: "user", body: "I paid ₹2,000 for the supplementary exam by UPI and the money was taken twice from my account (two SMS from the bank)." }, { at: 2, from: "agent", body: "We can see two UPI references against your registration. We are confirming the duplicate with the bank; the extra amount will be refunded to the same account." }, { at: 3, from: "agent", internal: true, body: "Gateway shows second txn as SUCCESS too — raised dispute with SBI ePay, ref DSP-77231. Refund needs Finance Officer sign-off." }] },
  { by: "student@nluassam.ac.in", category: "DOCUMENTS", priority: "MEDIUM", subject: "Need a duplicate grade sheet for semester 8", ageH: 10, status: "IN_PROGRESS",
    msgs: [{ at: 0, from: "user", body: "I lost the printed grade sheet of semester 8 and need one for an internship application." }, { at: 2, from: "agent", body: "You can download it any time from Results & Grade Sheets — it carries a QR code the firm can verify. If you need a sealed hard copy, reply here and we will prepare a duplicate." }] },
  { by: "graduate@nluassam.ac.in", category: "DOCUMENTS", priority: "LOW", subject: "Transcript not visible in DigiLocker", ageH: 6, status: "OPEN",
    msgs: [{ at: 0, from: "user", body: "I downloaded my transcript from the portal but it does not appear in my DigiLocker account." }] },
  { by: "eval.hazarika@nluassam.ac.in", category: "OTHER", priority: "HIGH", subject: "Script pages load slowly on the evaluation screen", ageH: 1.2, status: "OPEN", page: "/evaluation",
    msgs: [{ at: 0, from: "user", body: "Each answer-script page takes 8–10 seconds to appear since this morning. I have 30 scripts to finish today." }] },
  { by: "student2@nluassam.ac.in", category: "EXAMS", priority: "HIGH", subject: "BL9.3 blocked in my examination registration", ageH: 3.3, status: "OPEN", page: "/me/exams",
    msgs: [{ at: 0, from: "user", body: "Registration shows Alternative Dispute Resolution as 'not allowed — attendance'. I was in hospital for a week in October and submitted the medical certificate to the Dean's office." }] },
];

export async function seedHelpdesk() {
  await db.$executeRawUnsafe(`ALTER SEQUENCE "Ticket_number_seq" RESTART WITH 1001`);
  const now = Date.now();
  const H = 3600000;
  for (const s of TICKETS) {
    const raiser = await db.user.findUniqueOrThrow({ where: { email: s.by } });
    const team = CATEGORIES[s.category].team;
    const agent = await db.user.findFirstOrThrow({ where: { role: team as never, isActive: true }, orderBy: { createdAt: "asc" } });
    const created = new Date(now - s.ageH * H);
    const sla = SLA[s.priority];
    const at = (h: number) => new Date(created.getTime() + h * H);
    const firstAgent = s.msgs.find((m) => m.from === "agent" && !m.internal);
    const t = await db.ticket.create({
      data: {
        subject: s.subject, category: s.category, priority: s.priority, status: s.status, page: s.page, raisedById: raiser.id, assignedToId: agent.id,
        responseDueAt: at(sla.respond), resolveDueAt: at(sla.resolve), firstResponseAt: firstAgent ? at(firstAgent.at) : null,
        resolvedAt: s.resolvedAt != null ? at(s.resolvedAt) : null, closedAt: s.status === "CLOSED" ? at((s.resolvedAt ?? 0) + 4) : null, rating: s.rating ?? null,
        createdAt: created, updatedAt: at(Math.max(...s.msgs.map((m) => m.at))),
      },
    });
    await db.ticketMessage.createMany({
      data: [
        ...s.msgs.map((m) => ({ ticketId: t.id, authorId: m.from === "user" ? raiser.id : agent.id, body: m.body, internal: !!m.internal, createdAt: at(m.at) })),
        { ticketId: t.id, authorId: null, kind: "EVENT", body: `Routed to ${CATEGORIES[s.category].teamLabel} (${agent.name}) · ${sla.label} priority: response within ${sla.respond} h, resolution within ${sla.resolve} h`, createdAt: at(0.001) },
        ...(s.resolvedAt != null ? [{ ticketId: t.id, authorId: agent.id, kind: "EVENT", body: "Status: In progress → Resolved", createdAt: at(s.resolvedAt + 0.01) }] : []),
        ...(s.status === "CLOSED" ? [{ ticketId: t.id, authorId: raiser.id, kind: "EVENT", body: `Closed by the user · rated ${s.rating}/5`, createdAt: at((s.resolvedAt ?? 0) + 4) }] : []),
        ...(s.status === "WAITING_USER" ? [{ ticketId: t.id, authorId: agent.id, kind: "EVENT", body: "Status: In progress → Waiting for the user", createdAt: at(1.25) }] : []),
      ],
    });
  }
}
