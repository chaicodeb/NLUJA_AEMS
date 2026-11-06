"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award, BarChart3, BookOpen, Calculator, CalendarCheck, CalendarClock, ClipboardCheck, ClipboardList, FileCheck, GraduationCap, History, LayoutDashboard,
  ListChecks, MessageSquareText, MessagesSquare, NotebookPen, PenLine, RefreshCcw, Repeat, Scale, ShieldCheck, SlidersHorizontal, Users, Stamp, DoorOpen, Contact,
  UserPlus, UserPen, IdCard, FileUser, CalendarDays, UsersRound, Plug, KeyRound, DatabaseZap, Landmark, DatabaseBackup, ShieldHalf, LifeBuoy, MessageCircleQuestion, Headset, Menu, X, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavSection } from "@/lib/roles";

const ICONS: Record<string, LucideIcon> = {
  BarChart3, BookOpen, Calculator, CalendarCheck, ClipboardList, FileCheck, GraduationCap, History, LayoutDashboard,
  ListChecks, NotebookPen, PenLine, ShieldCheck, SlidersHorizontal, Users, RefreshCcw, CalendarClock, ClipboardCheck, Repeat, Scale, MessageSquareText, MessagesSquare, Award,
  Stamp, DoorOpen, Contact, UserPlus, UserPen, IdCard, FileUser, CalendarDays, UsersRound, Plug, KeyRound, DatabaseZap, Landmark, DatabaseBackup, ShieldHalf, LifeBuoy, MessageCircleQuestion, Headset,
};

function Brand({ onNavigate, className = "border-b border-white/10" }: { onNavigate?: () => void; className?: string }) {
  return (
    <Link href="/dashboard" onClick={onNavigate} className={cn("flex items-center gap-3 px-5 py-4", className)}>
      <Image src="/brand/footer_logo.webp" alt="NLUJA emblem" width={40} height={40} className="rounded-full bg-white p-0.5" />
      <div className="leading-tight">
        <div className="font-serif text-sm font-semibold text-white">NLUJA, Assam</div>
        <div className="text-[11px] text-white/50">Academic &amp; Examination System</div>
      </div>
    </Link>
  );
}

export function Sidebar({ sections }: { sections: NavSection[] }) {
  return (
    <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-ink-900 text-white/80 lg:flex">
      <Brand />
      <NavList sections={sections} />
      <div className="border-t border-white/10 px-5 py-3 text-[11px] text-white/40">Demo build · data is synthetic</div>
    </aside>
  );
}

/** Below the lg breakpoint the sidebar is replaced by a menu button that opens the same navigation as a drawer. */
export function MobileNav({ sections, footer }: { sections: NavSection[]; footer?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className="no-print -ml-1 rounded-md p-2 text-foreground hover:bg-muted lg:hidden">
        <Menu className="h-5 w-5" />
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-ink-900 text-white/80 shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 pr-2">
              <Brand onNavigate={() => setOpen(false)} className="" />
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavList sections={sections} onNavigate={() => setOpen(false)} />
            {footer && <div className="border-t border-white/10 px-4 py-3">{footer}</div>}
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}

function NavList({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {sections.map((s) => (
          <div key={s.title}>
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35">{s.title}</div>
            <ul className="space-y-0.5">
              {s.items.map((item) => {
                const Icon = ICONS[item.icon] ?? LayoutDashboard;
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                        active ? "bg-brand-600/90 font-medium text-white" : "hover:bg-white/5 hover:text-white",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
  );
}
