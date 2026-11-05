import type { Role } from "@prisma/client";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "System Administrator",
  VC: "Vice-Chancellor",
  REGISTRAR: "Registrar",
  COE: "Controller of Examinations",
  EXAM_STAFF: "Examination Branch",
  ACADEMIC_STAFF: "Academic Section",
  HOD: "Head of Department",
  FACULTY: "Faculty",
  EVALUATOR: "Evaluator",
  IQAC: "IQAC Coordinator",
  STUDENT: "Student",
  PARENT: "Parent / Guardian",
};

export type NavItem = { href: string; label: string; icon: string; roles: Role[] };
export type NavSection = { title: string; items: NavItem[] };

const ALL_STAFF: Role[] = ["ADMIN", "VC", "REGISTRAR", "COE", "EXAM_STAFF", "ACADEMIC_STAFF", "HOD", "IQAC"];

export const NAV: NavSection[] = [
  {
    title: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", roles: [...ALL_STAFF, "FACULTY", "EVALUATOR", "STUDENT", "PARENT"] }],
  },
  {
    title: "Academics",
    items: [
      { href: "/academics/programmes", label: "Programmes & Curricula", icon: "BookOpen", roles: ["ADMIN", "COE", "ACADEMIC_STAFF", "REGISTRAR", "HOD", "VC"] },
      { href: "/academics/schemes", label: "Evaluation Schemes", icon: "ListChecks", roles: ["ADMIN", "COE", "ACADEMIC_STAFF"] },
      { href: "/students", label: "Students", icon: "Users", roles: ["ADMIN", "COE", "EXAM_STAFF", "ACADEMIC_STAFF", "REGISTRAR", "HOD", "VC"] },
      { href: "/attendance", label: "Attendance", icon: "CalendarCheck", roles: ["ADMIN", "COE", "ACADEMIC_STAFF", "HOD", "FACULTY"] },
      { href: "/marks", label: "Internal Marks", icon: "NotebookPen", roles: ["FACULTY", "HOD", "COE", "EXAM_STAFF", "ACADEMIC_STAFF", "ADMIN"] },
    ],
  },
  {
    title: "Rules",
    items: [{ href: "/rules", label: "Rule Configuration", icon: "SlidersHorizontal", roles: ["ADMIN", "COE", "ACADEMIC_STAFF", "VC", "REGISTRAR"] }],
  },
  {
    title: "Examinations",
    items: [
      { href: "/exams", label: "Examinations", icon: "ClipboardList", roles: ["ADMIN", "COE", "EXAM_STAFF", "ACADEMIC_STAFF", "VC", "REGISTRAR"] },
      { href: "/relaxations", label: "Attendance Relaxations", icon: "ShieldCheck", roles: ["VC", "COE", "ACADEMIC_STAFF", "ADMIN"] },
      { href: "/evaluation", label: "My Evaluations", icon: "PenLine", roles: ["EVALUATOR", "FACULTY"] },
      { href: "/results", label: "Result Processing", icon: "Calculator", roles: ["ADMIN", "COE", "EXAM_STAFF", "VC", "REGISTRAR"] },
      { href: "/revaluations", label: "Revaluation & Scrutiny", icon: "RefreshCcw", roles: ["ADMIN", "COE", "EXAM_STAFF", "VC", "REGISTRAR"] },
    ],
  },
  {
    title: "Governance",
    items: [
      { href: "/reports", label: "Report Builder", icon: "BarChart3", roles: ["ADMIN", "COE", "EXAM_STAFF", "ACADEMIC_STAFF", "VC", "REGISTRAR", "HOD", "IQAC"] },
      { href: "/audit", label: "Audit Trail", icon: "History", roles: ["ADMIN", "COE", "VC", "REGISTRAR"] },
    ],
  },
  {
    title: "My Portal",
    items: [
      { href: "/me/exams", label: "Exam Registration", icon: "FileCheck", roles: ["STUDENT"] },
      { href: "/me/results", label: "Results & Grade Sheets", icon: "GraduationCap", roles: ["STUDENT", "PARENT"] },
    ],
  },
];

export function navFor(role: Role): NavSection[] {
  return NAV.map((s) => ({ ...s, items: s.items.filter((i) => i.roles.includes(role)) })).filter((s) => s.items.length);
}

export function canAccess(role: Role, pathname: string): boolean {
  const items = NAV.flatMap((s) => s.items);
  const match = items
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (!match) return true;
  return match.roles.includes(role);
}
