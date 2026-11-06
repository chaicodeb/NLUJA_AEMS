"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { closeOrReopen, raiseTicket, replyTicket, updateTicket } from "@/lib/helpdesk/helpdesk";

const actorOf = (u: { id: string; role: string }) => ({ id: u.id, role: u.role });
const refresh = () => ["/support", "/helpdesk", "/dashboard"].forEach((p) => revalidatePath(p, "layout"));

export async function raiseTicketAction(input: { subject: string; category: string; priority: string; body: string; page?: string }) {
  const user = await requireUser();
  const res = await raiseTicket(input, actorOf(user));
  refresh();
  return res;
}

export async function replyTicketAction(id: string, body: string, internal: boolean) {
  const user = await requireUser();
  const res = await replyTicket(id, body, internal, actorOf(user));
  refresh();
  return res;
}

export async function updateTicketAction(id: string, change: { status?: string; priority?: string; assignedToId?: string | null }) {
  const user = await requireUser();
  const res = await updateTicket(id, change, actorOf(user));
  refresh();
  return res;
}

export async function closeOrReopenAction(id: string, action: "CLOSE" | "REOPEN", rating: number | null) {
  const user = await requireUser();
  const res = await closeOrReopen(id, action, rating, actorOf(user));
  refresh();
  return res;
}
