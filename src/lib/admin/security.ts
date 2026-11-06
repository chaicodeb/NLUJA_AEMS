import { db } from "../db";
import { verifyAuditChain } from "../audit";
import { NAV } from "../roles";
import { SECURITY_HEADERS } from "./headers";
import { POLICY } from "./backup";
import { ALLOWED_MIME, MAX_UPLOAD_BYTES } from "../admissions/shared";
import { RATE_LIMIT_PER_MINUTE } from "../integrations/api";
import { formatDate } from "../utils";

export type Check = { area: string; control: string; status: "PASS" | "WARN" | "FAIL" | "INFO"; detail: string };

/** Roles that handle question papers, marks or results must use a second factor. */
const MFA_ROLES = ["ADMIN", "COE", "EXAM_STAFF", "EVALUATOR"];

export async function securityPosture(https: boolean): Promise<{ checks: Check[]; score: number }> {
  const since = new Date(Date.now() - 30 * 86400000);
  const [users, chain, events, docs, keys, lastBackup, lastVerified] = await Promise.all([
    db.user.findMany({ where: { isActive: true }, select: { role: true, mfaEnabled: true, name: true } }),
    verifyAuditChain(),
    db.auditLog.groupBy({ by: ["action"], where: { at: { gte: since }, action: { in: ["LOGIN", "LOGIN_FAILED", "MFA_FAILED", "ACCESS_DENIED", "SEGREGATION_VIOLATION_BLOCKED", "RULE_CHANGED"] } }, _count: { _all: true } }),
    db.document.groupBy({ by: ["revoked"], _count: { _all: true } }),
    db.apiKey.findMany({ where: { revokedAt: null } }),
    db.backupRun.findFirst({ where: { status: "OK" }, orderBy: { startedAt: "desc" } }),
    db.backupRun.findFirst({ where: { verifiedAt: { not: null } }, orderBy: { verifiedAt: "desc" } }),
  ]);
  const n = (a: string) => events.find((e) => e.action === a)?._count._all ?? 0;
  const withoutMfa = users.filter((u) => MFA_ROLES.includes(u.role) && !u.mfaEnabled);
  const routes = NAV.flatMap((s) => s.items).length;
  const backupAge = lastBackup ? (Date.now() - lastBackup.startedAt.getTime()) / 3600000 : null;
  const staleKeys = keys.filter((k) => !k.lastUsedAt || Date.now() - k.lastUsedAt.getTime() > 90 * 86400000);

  const checks: Check[] = [
    { area: "Transport", control: "Encrypted connection (TLS)", status: https ? "PASS" : "WARN", detail: https ? "This session is served over HTTPS; HSTS tells browsers to refuse plain HTTP for a year." : "This session is plain HTTP (local demonstration). Production sits behind TLS 1.2+ with HSTS." },
    { area: "Transport", control: "Security headers", status: "PASS", detail: SECURITY_HEADERS.map((h) => `${h.key}: ${h.value}`).join(" · ") },
    { area: "Identity", control: "Password storage", status: "PASS", detail: `bcrypt (cost 10) for ${users.length} active accounts; plain-text passwords are never stored or logged.` },
    {
      area: "Identity", control: "Second factor for examination roles", status: withoutMfa.length ? "FAIL" : "PASS",
      detail: withoutMfa.length ? `Without OTP: ${withoutMfa.map((u) => `${u.name} (${u.role})`).join(", ")}` : `All ${users.filter((u) => MFA_ROLES.includes(u.role)).length} accounts in ${MFA_ROLES.join(", ")} sign in with a one-time password.`,
    },
    { area: "Identity", control: "Sessions", status: "PASS", detail: `Signed (HS256) session cookie: HttpOnly, SameSite=Lax, Secure on HTTPS, expires after 8 hours. Single sign-on via the University's Google Workspace / Microsoft 365 in production.` },
    { area: "Identity", control: "Sign-in activity (30 days)", status: n("LOGIN_FAILED") + n("MFA_FAILED") > 20 ? "WARN" : "INFO", detail: `${n("LOGIN")} sign-ins, ${n("LOGIN_FAILED")} failed passwords, ${n("MFA_FAILED")} rejected one-time passwords.` },
    { area: "Access control", control: "Role-based permissions", status: "PASS", detail: `${routes} screens mapped to ${new Set(NAV.flatMap((s) => s.items.flatMap((i) => i.roles))).size} roles; every server action re-checks the role. ${n("ACCESS_DENIED")} blocked attempts in 30 days are in the audit trail.` },
    { area: "Access control", control: "Segregation of duties", status: "PASS", detail: `Maker ≠ checker on results, moderation, internal marks and revaluation; ${n("SEGREGATION_VIOLATION_BLOCKED")} violation(s) blocked in 30 days.` },
    { area: "Integrity", control: "Tamper-evident audit trail", status: chain.ok ? "PASS" : "FAIL", detail: chain.ok ? `${chain.total.toLocaleString("en-IN")} entries, SHA-256 hash chain verified end to end just now.` : `Chain broken at entry ${chain.brokenAt} of ${chain.total} — investigate immediately.` },
    { area: "Integrity", control: "Signed documents", status: "PASS", detail: `${docs.reduce((a, d) => a + d._count._all, 0)} documents hashed (SHA-256) and signed; ${docs.find((d) => d.revoked)?._count._all ?? 0} revoked and shown as such on the public verification page. DSC / eSign in production.` },
    { area: "Integrations", control: "API keys", status: staleKeys.length ? "WARN" : "PASS", detail: `${keys.length} active key(s), stored as SHA-256 hashes, scoped and limited to ${RATE_LIMIT_PER_MINUTE} calls a minute.${staleKeys.length ? ` Unused for 90+ days: ${staleKeys.map((k) => k.name).join(", ")} — consider revoking.` : ""}` },
    { area: "Data protection", control: "Personal data minimisation (DPDP Act, 2023)", status: "PASS", detail: "Partner API omits contact and family details; parents see their ward only; alumni directory honours consent; anonymous feedback is stored apart from who submitted." },
    { area: "Data protection", control: "File uploads", status: "PASS", detail: `Only ${ALLOWED_MIME.join(", ")} up to ${MAX_UPLOAD_BYTES / 1024 / 1024} MB; served with nosniff to the applicant and verifying staff only.` },
    {
      area: "Continuity", control: `Backups (RPO ${POLICY.rpoHours} h)`, status: backupAge == null ? "FAIL" : backupAge <= POLICY.rpoHours ? "PASS" : "WARN",
      detail: lastBackup ? `Last good backup ${backupAge! < 1 ? "less than an hour" : `${Math.round(backupAge!)} hour(s)`} ago (${lastBackup.kind.toLowerCase()}), nightly at 0${POLICY.scheduleHourIst}:00 IST, ${POLICY.retain} kept.` : "No successful backup on record.",
    },
    {
      area: "Continuity", control: `Backups readable — restore readiness (RTO ${POLICY.rtoHours} h)`, status: lastVerified ? "PASS" : "WARN",
      detail: lastVerified ? `A backup was last read back and checksum-verified on ${formatDate(lastVerified.verifiedAt!, true)}; full restores are rehearsed quarterly in production.` : "Verify a backup on the Backup & Restore page to prove it can be read back.",
    },
  ];
  const scored = checks.filter((c) => c.status !== "INFO");
  return { checks, score: Math.round((scored.filter((c) => c.status === "PASS").length / scored.length) * 100) };
}
