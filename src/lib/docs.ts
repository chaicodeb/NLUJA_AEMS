import { createHash, createHmac, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { stableStringify } from "./utils";

const SIGNING_KEY = process.env.DOC_SIGNING_SECRET ?? process.env.SESSION_SECRET ?? "dev";

export function hashPayload(payload: unknown) {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

/** Server-side signature over the document hash (stands in for the University's DSC / eSign in production). */
export function signHash(hash: string) {
  return createHmac("sha256", SIGNING_KEY).update(hash).digest("hex");
}

export function newVerifyCode() {
  return randomBytes(6).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "X").slice(0, 8);
}

export async function issueDocument(
  data: { type: string; studentId: string; refId?: string; payload: Record<string, unknown>; issuedById?: string; isDuplicate?: boolean },
  tx: Prisma.TransactionClient | typeof db = db,
) {
  const payloadHash = hashPayload(data.payload);
  const doc = await tx.document.create({
    data: {
      type: data.type,
      studentId: data.studentId,
      refId: data.refId,
      verifyCode: newVerifyCode(),
      payload: data.payload as Prisma.InputJsonValue,
      payloadHash,
      issuedById: data.issuedById,
      isDuplicate: data.isDuplicate ?? false,
    },
  });
  if (DIGILOCKER_TYPES[doc.type]) {
    await tx.integrationJob.create({ data: { connector: "DIGILOCKER", documentId: doc.id, studentId: doc.studentId, label: `${DIGILOCKER_TYPES[doc.type]} ${doc.verifyCode}` } });
  }
  return doc;
}

/** Documents published to the learner's DigiLocker account (issuer document types). */
export const DIGILOCKER_TYPES: Record<string, string> = {
  GRADE_SHEET: "Grade sheet", TRANSCRIPT: "Transcript", PROVISIONAL: "Provisional certificate", DEGREE: "Degree certificate", MIGRATION: "Migration certificate",
};

export function verifyDocument(doc: { payload: Prisma.JsonValue; payloadHash: string; revoked: boolean }) {
  const recomputed = hashPayload(doc.payload);
  return { intact: recomputed === doc.payloadHash && !doc.revoked, recomputed, signature: signHash(doc.payloadHash) };
}

/**
 * Public base URL for links printed in QR codes. Uses the host the visitor actually reached
 * (localhost, a tunnel or a server), so QR codes resolve wherever the demo is opened.
 */
export async function appUrl() {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  } catch {
    // outside a request (scripts): fall back to configuration
  }
  return process.env.APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
}
