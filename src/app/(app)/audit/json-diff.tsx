import type { Prisma } from "@prisma/client";

function flat(v: Prisma.JsonValue | null, prefix = ""): Record<string, string> {
  if (v === null || v === undefined) return {};
  if (typeof v !== "object" || Array.isArray(v)) return { [prefix || "value"]: JSON.stringify(v) };
  return Object.entries(v).reduce<Record<string, string>>((acc, [k, val]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (val && typeof val === "object" && !Array.isArray(val)) Object.assign(acc, flat(val, key));
    else acc[key] = JSON.stringify(val);
    return acc;
  }, {});
}

export function JsonDiff({ before, after }: { before: Prisma.JsonValue | null; after: Prisma.JsonValue | null }) {
  const b = flat(before);
  const a = flat(after);
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).filter((k) => b[k] !== a[k]);
  if (!keys.length) return null;
  return (
    <details className="mt-1.5">
      <summary className="cursor-pointer text-xs font-medium text-brand-700">Show changes ({keys.length})</summary>
      <div className="mt-1 overflow-hidden rounded border border-border text-xs">
        {keys.slice(0, 20).map((k) => (
          <div key={k} className="grid grid-cols-[160px_1fr_1fr] border-b border-border last:border-0">
            <div className="truncate bg-muted/50 px-2 py-1 font-mono">{k}</div>
            <div className="truncate px-2 py-1 font-mono text-red-700 line-through decoration-red-300">{b[k] ?? "—"}</div>
            <div className="truncate px-2 py-1 font-mono text-leaf-700">{a[k] ?? "—"}</div>
          </div>
        ))}
      </div>
    </details>
  );
}
