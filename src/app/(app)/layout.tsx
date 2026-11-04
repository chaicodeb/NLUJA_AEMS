import { LogOut, KeyRound } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { Badge } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { navFor, ROLE_LABELS } from "@/lib/roles";
import { logoutAction } from "../login/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen">
      <Sidebar sections={navFor(user.role)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-white/90 px-6 backdrop-blur">
          <div className="text-sm text-muted-foreground">
            Academic Year <span className="font-medium text-foreground">2026-27</span> · Odd Semester
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-muted-foreground">{user.designation ?? ROLE_LABELS[user.role]}</div>
            </div>
            <Badge tone="brand">{ROLE_LABELS[user.role]}</Badge>
            {user.mfaEnabled && (
              <Badge tone="green">
                <KeyRound className="h-3 w-3" /> 2FA
              </Badge>
            )}
            <form action={logoutAction}>
              <button className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted" title="Sign out / switch role">
                <LogOut className="h-3.5 w-3.5" /> Switch role
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
