/** Starts the nightly-backup scheduler once per server process (set BACKUP_SCHEDULER=off to disable). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.BACKUP_SCHEDULER === "off") return;
  const { scheduledTick } = await import("./lib/admin/backup");
  const tick = () => scheduledTick().catch((e) => console.error("[backup scheduler]", e));
  setTimeout(tick, 60_000);
  setInterval(tick, 60 * 60 * 1000);
}
