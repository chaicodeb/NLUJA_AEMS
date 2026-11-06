import { LogOut, KeyRound } from "lucide-react";
import { MobileNav, Sidebar } from "@/components/sidebar";
import { HelpButton } from "@/components/help-button";
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
        <header className="no-print sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-border bg-white/90 px-3 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-1.5">
            <MobileNav
              sections={navFor(user.role)}
              footer={
                <div className="text-xs leading-tight text-white/70">
                  <div className="font-medium text-white">{user.name}</div>
                  <div>{user.designation ?? ROLE_LABELS[user.role]}</div>
                </div>
              }
            />
            <div className="truncate text-sm text-muted-foreground">
              <span className="hidden sm:inline">Academic Year </span>
              <span className="font-medium text-foreground">2026-27</span>
              <span className="hidden sm:inline"> · Odd Semester</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden text-right leading-tight md:block">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-muted-foreground">{user.designation ?? ROLE_LABELS[user.role]}</div>
            </div>
            <Badge tone="brand" className="max-w-[9rem] truncate sm:max-w-none">{ROLE_LABELS[user.role]}</Badge>
            {user.mfaEnabled && (
              <Badge tone="green" className="hidden sm:inline-flex">
                <KeyRound className="h-3 w-3" /> 2FA
              </Badge>
            )}
            <HelpButton />
            <form action={logoutAction}>
              <button className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs font-medium hover:bg-muted sm:px-2.5" title="Sign out / switch role" aria-label="Switch role">
                <LogOut className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Switch role</span>
              </button>
            </form>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
