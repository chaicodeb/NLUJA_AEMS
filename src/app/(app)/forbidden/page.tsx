import { ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/roles";

export default async function ForbiddenPage({ searchParams }: PageProps<"/forbidden">) {
  const user = await requireUser();
  const { path } = await searchParams;
  return (
    <Card className="mx-auto mt-16 max-w-lg p-8 text-center">
      <ShieldAlert className="mx-auto h-10 w-10 text-red-600" />
      <h1 className="mt-3 font-serif text-xl font-bold">Access denied</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your role (<strong>{ROLE_LABELS[user.role]}</strong>) is not permitted to open{" "}
        <code className="rounded bg-muted px-1">{String(path ?? "this page")}</code>. This attempt has been recorded in the audit trail.
      </p>
    </Card>
  );
}
