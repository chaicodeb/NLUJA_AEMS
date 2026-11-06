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
  LIBRARIAN: "Librarian",
  WARDEN: "Chief Warden",
  ACCOUNTS: "Finance & Accounts",
  STUDENT: "Student",
  PARENT: "Parent / Guardian",
  APPLICANT: "Applicant",
};

export type NavItem = { href: string; label: string; icon: string; roles: Role[] };
export type NavSection = { title: string; items: NavItem[] };

const ALL_STAFF: Role[] = ["ADMIN", "VC", "REGISTRAR", "COE", "EXAM_STAFF", "ACADEMIC_STAFF", "HOD", "IQAC"];

export const NAV: NavSection[] = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", roles: [...ALL_STAFF, "LIBRARIAN", "WARDEN", "ACCOUNTS", "FACULTY", "EVALUATOR", "STUDENT", "PARENT"] },
      { href: "/calendar", label: "Academic Calendar", icon: "CalendarDays", roles: [...ALL_STAFF, "LIBRARIAN", "WARDEN", "ACCOUNTS", "FACULTY", "EVALUATOR", "STUDENT", "PARENT"] },
    ],
  },
  {
    title: "Academics",
    items: [
      { href: "/admissions", label: "Admissions", icon: "UserPlus", roles: ["ACADEMIC_STAFF", "REGISTRAR", "HOD", "VC", "ADMIN"] },
      { href: "/academics/programmes", label: "Programmes & Curricula", icon: "BookOpen", roles: ["ADMIN", "COE", "ACADEMIC_STAFF", "REGISTRAR", "HOD", "VC"] },
      { href: "/academics/faculty", label: "Faculty & Workload", icon: "UsersRound", roles: ["ACADEMIC_STAFF", "HOD", "REGISTRAR", "VC", "ADMIN"] },
      { href: "/academics/schemes", label: "Evaluation Schemes", icon: "ListChecks", roles: ["ADMIN", "COE", "ACADEMIC_STAFF"] },
      { href: "/students", label: "Students", icon: "Users", roles: ["ADMIN", "COE", "EXAM_STAFF", "ACADEMIC_STAFF", "REGISTRAR", "HOD", "VC"] },
      { href: "/attendance/classes", label: "Daily Attendance", icon: "CalendarClock", roles: ["FACULTY", "HOD", "ACADEMIC_STAFF", "COE", "ADMIN"] },
      { href: "/attendance", label: "Attendance Register", icon: "CalendarCheck", roles: ["ADMIN", "COE", "ACADEMIC_STAFF", "HOD", "FACULTY"] },
      { href: "/attendance/leave", label: "Leave Applications", icon: "ClipboardCheck", roles: ["HOD", "ACADEMIC_STAFF", "COE", "ADMIN"] },
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
      { href: "/moderation", label: "Moderation", icon: "Scale", roles: ["ADMIN", "COE", "EXAM_STAFF", "VC"] },
      { href: "/revaluations", label: "Revaluation & Scrutiny", icon: "RefreshCcw", roles: ["ADMIN", "COE", "EXAM_STAFF", "VC", "REGISTRAR"] },
      { href: "/supplementary", label: "Supplementary Exams", icon: "Repeat", roles: ["ADMIN", "COE", "EXAM_STAFF", "VC", "REGISTRAR"] },
      { href: "/convocation", label: "Degrees & Convocation", icon: "Award", roles: ["ADMIN", "REGISTRAR", "VC", "COE", "ACADEMIC_STAFF"] },
    ],
  },
  {
    title: "Student Services",
    items: [
      { href: "/profile-requests", label: "Profile Corrections", icon: "UserPen", roles: ["ACADEMIC_STAFF", "REGISTRAR", "ADMIN"] },
      { href: "/clearance", label: "No-dues Desk", icon: "Stamp", roles: ["LIBRARIAN", "WARDEN", "ACCOUNTS", "EXAM_STAFF", "REGISTRAR", "ADMIN"] },
      { href: "/exit", label: "Exit & Certificates", icon: "DoorOpen", roles: ["REGISTRAR", "ACCOUNTS", "ADMIN"] },
      { href: "/alumni", label: "Alumni", icon: "Contact", roles: ["REGISTRAR", "VC", "IQAC", "HOD", "ACADEMIC_STAFF", "ADMIN"] },
    ],
  },
  {
    title: "Integrations",
    items: [
      { href: "/integrations", label: "Connectors & DigiLocker", icon: "Plug", roles: ["ADMIN", "REGISTRAR", "COE"] },
      { href: "/integrations/api", label: "API & Keys", icon: "KeyRound", roles: ["ADMIN"] },
      { href: "/integrations/migration", label: "Data Migration", icon: "DatabaseZap", roles: ["ADMIN", "ACADEMIC_STAFF", "REGISTRAR"] },
    ],
  },
  {
    title: "Governance",
    items: [
      { href: "/feedback", label: "Feedback & Surveys", icon: "MessageSquareText", roles: ["IQAC", "VC", "HOD", "COE", "ACADEMIC_STAFF", "REGISTRAR", "ADMIN", "FACULTY"] },
      { href: "/reports", label: "Report Builder", icon: "BarChart3", roles: ["ADMIN", "COE", "EXAM_STAFF", "ACADEMIC_STAFF", "VC", "REGISTRAR", "HOD", "IQAC"] },
      { href: "/reports/statutory", label: "Statutory Returns", icon: "Landmark", roles: ["IQAC", "REGISTRAR", "VC", "COE", "ADMIN"] },
      { href: "/audit", label: "Audit Trail", icon: "History", roles: ["ADMIN", "COE", "VC", "REGISTRAR"] },
    ],
  },
  {
    title: "Help & Support",
    items: [
      { href: "/help", label: "Help & Training", icon: "LifeBuoy", roles: [...ALL_STAFF, "LIBRARIAN", "WARDEN", "ACCOUNTS", "FACULTY", "EVALUATOR", "STUDENT", "PARENT", "APPLICANT"] },
      { href: "/support", label: "Support Tickets", icon: "MessageCircleQuestion", roles: [...ALL_STAFF, "LIBRARIAN", "WARDEN", "ACCOUNTS", "FACULTY", "EVALUATOR", "STUDENT", "PARENT", "APPLICANT"] },
      { href: "/helpdesk", label: "Helpdesk Queue", icon: "Headset", roles: ["ADMIN", "EXAM_STAFF", "ACADEMIC_STAFF", "ACCOUNTS"] },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/admin/backup", label: "Backup & Restore", icon: "DatabaseBackup", roles: ["ADMIN"] },
      { href: "/admin/security", label: "Security Posture", icon: "ShieldHalf", roles: ["ADMIN", "VC"] },
    ],
  },
  {
    title: "My Portal",
    items: [
      { href: "/me/attendance", label: "My Attendance", icon: "CalendarCheck", roles: ["STUDENT", "PARENT"] },
      { href: "/me/exams", label: "Exam Registration", icon: "FileCheck", roles: ["STUDENT"] },
      { href: "/me/results", label: "Results & Grade Sheets", icon: "GraduationCap", roles: ["STUDENT", "PARENT"] },
      { href: "/me/feedback", label: "Feedback", icon: "MessagesSquare", roles: ["STUDENT"] },
      { href: "/me/degree", label: "Degree & Convocation", icon: "Award", roles: ["STUDENT", "PARENT"] },
      { href: "/me/exit", label: "Exit & Alumni", icon: "DoorOpen", roles: ["STUDENT"] },
      { href: "/me/profile", label: "Profile & ID Card", icon: "IdCard", roles: ["STUDENT"] },
    ],
  },
  {
    title: "Admission",
    items: [{ href: "/application", label: "My Application", icon: "FileUser", roles: ["APPLICANT"] }],
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
