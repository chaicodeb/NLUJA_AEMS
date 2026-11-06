import type { Ticket } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { AGENT_ROLES, CATEGORIES, SLA, STATUS, slaState, ticketNo } from "./shared";

type Actor = { id: string; role: string };
const H = 3600000;

export function canView(t: Pick<Ticket, "raisedById" | "assignedToId" | "category">, u: Actor) {
  return t.raisedById === u.id || u.role === "ADMIN" || t.assignedToId === u.id || CATEGORIES[t.category]?.team === u.role;
}
export const isAgent = (t: Pick<Ticket, "assignedToId" | "category">, u: Actor) => u.role === "ADMIN" || t.assignedToId === u.id || CATEGORIES[t.category]?.team === u.role;

async function event(ticketId: string, body: string, authorId: string | null) {
  await db.ticketMessage.create({ data: { ticketId, body, kind: "EVENT", authorId } });
}

export async function raiseTicket(input: { subject: string; category: string; priority: string; body: string; page?: string }, actor: Actor) {
  if (input.subject.trim().length < 6) return { error: "Summarise the problem in a few words." };
  if (input.body.trim().length < 15) return { error: "Describe what happened and what you expected." };
  const cat = CATEGORIES[input.category];
  if (!cat) return { error: "Choose a category." };
  if (!SLA[input.priority]) return { error: "Choose a priority." };
  if (input.priority === "CRITICAL" && !["ADMIN", "COE", "VC", "REGISTRAR", "EXAM_STAFF"].includes(actor.role)) return { error: "Critical is reserved for incidents reported by University officers; choose High." };
  const now = new Date();
  const assignee = await db.user.findFirst({ where: { role: cat.team as never, isActive: true }, orderBy: { createdAt: "asc" } });
  const sla = SLA[input.priority];
  const t = await db.ticket.create({
    data: {
      subject: input.subject.trim(), category: input.category, priority: input.priority, page: input.page || null, raisedById: actor.id, assignedToId: assignee?.id ?? null,
      responseDueAt: new Date(now.getTime() + sla.respond * H), resolveDueAt: new Date(now.getTime() + sla.resolve * H),
      messages: { create: [{ authorId: actor.id, body: input.body.trim() }] },
    },
  });
  await event(t.id, `Routed to ${cat.teamLabel}${assignee ? ` (${assignee.name})` : ""} · ${sla.label} priority: response within ${sla.respond} h, resolution within ${sla.resolve} h`, null);
  await audit({ actorId: actor.id, actorRole: actor.role, action: "TICKET_RAISED", entity: "Ticket", entityId: t.id, summary: `${ticketNo(t.number)} "${t.subject}" (${cat.label}, ${sla.label}) routed to ${cat.teamLabel}` });
  return { ok: true, id: t.id, number: t.number };
}

export async function replyTicket(id: string, body: string, internal: boolean, actor: Actor) {
  const t = await db.ticket.findUnique({ where: { id } });
  if (!t || !canView(t, actor)) return { error: "Ticket not found." };
  if (t.status === "CLOSED") return { error: "This ticket is closed; raise a new one." };
  if (body.trim().length < 2) return { error: "Write a message." };
  const agent = isAgent(t, actor) && t.raisedById !== actor.id;
  if (internal && !agent) return { error: "Only support staff can add internal notes." };
  await db.ticketMessage.create({ data: { ticketId: id, authorId: actor.id, body: body.trim(), internal } });
  const data: Partial<Ticket> = {};
  if (agent && !internal && !t.firstResponseAt) data.firstResponseAt = new Date();
  if (agent && !internal && t.status === "OPEN") data.status = "IN_PROGRESS";
  if (!agent && t.status === "WAITING_USER") data.status = "IN_PROGRESS";
  if (Object.keys(data).length) await db.ticket.update({ where: { id }, data });
  return { ok: true };
}

export async function updateTicket(id: string, change: { status?: string; priority?: string; assignedToId?: string | null }, actor: Actor) {
  const t = await db.ticket.findUnique({ where: { id } });
  if (!t || !isAgent(t, actor)) return { error: "Only support staff can change this ticket." };
  const data: Partial<Ticket> = {};
  const notes: string[] = [];
  if (change.status && change.status !== t.status) {
    if (!STATUS[change.status] || change.status === "CLOSED") return { error: "Choose a valid status." };
    if (change.status === "RESOLVED") {
      const replies = await db.ticketMessage.count({ where: { ticketId: id, internal: false, kind: "COMMENT", authorId: { not: t.raisedById } } });
      if (!replies) return { error: "Reply to the user with the resolution before marking it resolved." };
      data.resolvedAt = new Date();
    } else data.resolvedAt = null;
    if (!t.firstResponseAt) data.firstResponseAt = new Date();
    data.status = change.status;
    notes.push(`Status: ${STATUS[t.status].label} → ${STATUS[change.status].label}`);
  }
  if (change.priority && change.priority !== t.priority) {
    const sla = SLA[change.priority];
    if (!sla) return { error: "Choose a priority." };
    data.priority = change.priority;
    data.responseDueAt = new Date(t.createdAt.getTime() + sla.respond * H);
    data.resolveDueAt = new Date(t.createdAt.getTime() + sla.resolve * H);
    notes.push(`Priority: ${SLA[t.priority].label} → ${sla.label} (targets recalculated from when the ticket was raised)`);
  }
  if (change.assignedToId !== undefined && change.assignedToId !== t.assignedToId) {
    const to = change.assignedToId ? await db.user.findUnique({ where: { id: change.assignedToId } }) : null;
    if (change.assignedToId && (!to || !AGENT_ROLES.includes(to.role))) return { error: "Assign to a member of a support team." };
    data.assignedToId = change.assignedToId;
    notes.push(`Assigned to ${to?.name ?? "nobody"}`);
  }
  if (!notes.length) return { ok: true };
  await db.ticket.update({ where: { id }, data });
  await event(id, notes.join(" · "), actor.id);
  await audit({ actorId: actor.id, actorRole: actor.role, action: "TICKET_UPDATED", entity: "Ticket", entityId: id, summary: `${ticketNo(t.number)}: ${notes.join("; ")}` });
  return { ok: true };
}

/** The person who raised the ticket confirms (with a rating) or reopens it. */
export async function closeOrReopen(id: string, action: "CLOSE" | "REOPEN", rating: number | null, actor: Actor) {
  const t = await db.ticket.findUnique({ where: { id } });
  if (!t || t.raisedById !== actor.id) return { error: "Only the person who raised the ticket can do this." };
  if (t.status !== "RESOLVED") return { error: "The ticket is not awaiting your confirmation." };
  if (action === "CLOSE") {
    if (!rating || rating < 1 || rating > 5) return { error: "Rate the support from 1 to 5." };
    await db.ticket.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date(), rating } });
    await event(id, `Closed by the user · rated ${rating}/5`, actor.id);
  } else {
    await db.ticket.update({ where: { id }, data: { status: "IN_PROGRESS", resolvedAt: null } });
    await event(id, "Reopened by the user — the problem is not solved", actor.id);
  }
  return { ok: true };
}

export async function ticketDetail(id: string, actor: Actor) {
  const t = await db.ticket.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!t || !canView(t, actor)) return null;
  const ids = [t.raisedById, t.assignedToId, ...t.messages.map((m) => m.authorId)].filter((x): x is string => !!x);
  const people = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, role: true, designation: true } });
  const agent = isAgent(t, actor) && t.raisedById !== actor.id;
  return {
    ticket: t, agent, people,
    messages: t.messages.filter((m) => agent || !m.internal),
    raiser: people.find((p) => p.id === t.raisedById),
    assignee: people.find((p) => p.id === t.assignedToId) ?? null,
    agents: agent ? await db.user.findMany({ where: { role: { in: AGENT_ROLES as never[] }, isActive: true }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }) : [],
    sla: slaState(t, new Date()),
  };
}

export async function myTickets(userId: string) {
  const list = await db.ticket.findMany({ where: { raisedById: userId }, orderBy: { createdAt: "desc" } });
  const now = new Date();
  return list.map((t) => ({ ...t, sla: slaState(t, now) }));
}

export async function queue(actor: Actor, filter: string) {
  const scope = actor.role === "ADMIN" ? {} : { OR: [{ assignedToId: actor.id }, { category: { in: Object.entries(CATEGORIES).filter(([, c]) => c.team === actor.role).map(([k]) => k) } }] };
  const all = await db.ticket.findMany({ where: scope, orderBy: { createdAt: "desc" } });
  const now = new Date();
  const rows = all.map((t) => ({ ...t, sla: slaState(t, now) }));
  const users = await db.user.findMany({ where: { id: { in: [...new Set(rows.flatMap((t) => [t.raisedById, t.assignedToId]).filter((x): x is string => !!x))] } }, select: { id: true, name: true, role: true } });
  const open = rows.filter((t) => !["RESOLVED", "CLOSED"].includes(t.status));
  const responded = rows.filter((t) => t.firstResponseAt);
  const rated = rows.filter((t) => t.rating);
  const resolved = rows.filter((t) => t.resolvedAt);
  const stats = {
    open: open.length, breached: open.filter((t) => t.sla.level === "breached").length, risk: open.filter((t) => t.sla.level === "risk").length,
    avgResponseH: responded.length ? responded.reduce((a, t) => a + (t.firstResponseAt!.getTime() - t.createdAt.getTime()), 0) / responded.length / H : null,
    withinSla: resolved.length ? Math.round((resolved.filter((t) => t.resolvedAt! <= t.resolveDueAt).length / resolved.length) * 100) : null,
    csat: rated.length ? rated.reduce((a, t) => a + t.rating!, 0) / rated.length : null,
  };
  const order = { breached: 0, risk: 1, ok: 2, met: 3, done: 4 };
  const list = rows
    .filter((t) => (filter === "mine" ? t.assignedToId === actor.id : filter === "closed" ? ["RESOLVED", "CLOSED"].includes(t.status) : filter === "all" ? true : !["RESOLVED", "CLOSED"].includes(t.status)))
    .sort((a, b) => order[a.sla.level] - order[b.sla.level] || (a.sla.due?.getTime() ?? 0) - (b.sla.due?.getTime() ?? 0));
  return { list, stats, users };
}
