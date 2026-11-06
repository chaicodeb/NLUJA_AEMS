"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award, BarChart3, BookOpen, Calculator, CalendarCheck, CalendarClock, ClipboardCheck, ClipboardList, FileCheck, GraduationCap, History, LayoutDashboard,
  ListChecks, MessageSquareText, MessagesSquare, NotebookPen, PenLine, RefreshCcw, Repeat, Scale, ShieldCheck, SlidersHorizontal, Users, Stamp, DoorOpen, Contact,
  UserPlus, UserPen, IdCard, FileUser, CalendarDays, UsersRound, Plug, KeyRound, DatabaseZap, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavSection } from "@/lib/roles";

const ICONS: Record<string, LucideIcon> = {
  BarChart3, BookOpen, Calculator, CalendarCheck, ClipboardList, FileCheck, GraduationCap, History, LayoutDashboard,
  ListChecks, NotebookPen, PenLine, ShieldCheck, SlidersHorizontal, Users, RefreshCcw, CalendarClock, ClipboardCheck, Repeat, Scale, MessageSquareText, MessagesSquare, Award,
  Stamp, DoorOpen, Contact, UserPlus, UserPen, IdCard, FileUser, CalendarDays, UsersRound, Plug, KeyRound, DatabaseZap,
};

export function Sidebar({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  return (
    <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-ink-900 text-white/80 lg:flex">
      <Link href="/dashboard" className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
        <Image src="/brand/footer_logo.webp" alt="NLUJA emblem" width={40} height={40} className="rounded-full bg-white p-0.5" />
        <div className="leading-tight">
          <div className="font-serif text-sm font-semibold text-white">NLUJA, Assam</div>
          <div className="text-[11px] text-white/50">Academic &amp; Examination System</div>
        </div>
      </Link>
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
      <div className="border-t border-white/10 px-5 py-3 text-[11px] text-white/40">Demo build · data is synthetic</div>
    </aside>
  );
}
