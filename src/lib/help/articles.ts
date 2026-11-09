export type Article = { id: string; title: string; roles: string[]; topic: string; summary: string; steps: string[]; path?: string; tip?: string };

const STAFF = ["ADMIN", "VC", "REGISTRAR", "COE", "EXAM_STAFF", "ACADEMIC_STAFF", "HOD", "IQAC"];

export const ARTICLES: Article[] = [
  // Students & parents
  { id: "register-exam", title: "Register for the end-semester examination", roles: ["STUDENT"], topic: "Examinations", path: "/me/exams",
    summary: "Choose your papers, pay the fee and get your admit card.",
    steps: ["Open Exam Registration while registration is open.", "Papers you are eligible for are pre-selected; papers blocked for attendance shortage show the reason and whether a relaxation request is pending.", "Pay the fee by UPI, net banking or card — the receipt number is recorded at once.", "When the Controller publishes admit cards, download yours from the same page or the dashboard."],
    tip: "If a paper is blocked for attendance, ask your Dean about a relaxation before registration closes." },
  { id: "results", title: "See results and download grade sheets", roles: ["STUDENT", "PARENT"], topic: "Results", path: "/me/results",
    summary: "Semester results, SGPA/CGPA and signed grade sheets with a QR code.",
    steps: ["Open Results & Grade Sheets after results are published.", "Each semester shows course grades, SGPA and CGPA.", "Download the grade sheet or transcript — anyone can check it by scanning its QR code.", "Grade sheets also go to your DigiLocker account if your ABC ID is on record."] },
  { id: "revaluation", title: "Apply for revaluation or scrutiny", roles: ["STUDENT"], topic: "Results", path: "/me/results",
    summary: "Ask for a fresh evaluation or a re-totalling within the window after results.",
    steps: ["On Results & Grade Sheets, choose the paper and Revaluation or Scrutiny.", "Give a short reason and pay the fee.", "A different evaluator re-marks the script; both marks are kept on record.", "If your grade changes, a new grade sheet is issued and the old one is shown as replaced."] },
  { id: "attendance-leave", title: "Check attendance and apply for leave", roles: ["STUDENT", "PARENT"], topic: "Attendance", path: "/me/attendance",
    summary: "Course-wise attendance with shortage alerts; medical and duty leave.",
    steps: ["My Attendance shows each course against the 75% requirement.", "Alerts warn you (and your parent) as you approach the limit.", "Apply for medical or duty leave with the dates and a document; the Dean decides.", "Approved leave counts towards attendance as the regulations allow."] },
  { id: "feedback", title: "Give anonymous course feedback", roles: ["STUDENT"], topic: "Feedback", path: "/me/feedback",
    summary: "Rate each course and teacher; nobody can see what you answered.",
    steps: ["Open Feedback while a form is open.", "Tap a rating for each statement and add a comment if you wish.", "Submit — the system records that you answered, never what you answered.", "Teachers see results only after the window closes, and only with five or more responses."] },
  { id: "profile-id", title: "Update your details and download your ID card", roles: ["STUDENT"], topic: "Profile", path: "/me/profile",
    summary: "Change contact details instantly; ask for corrections to your name or date of birth.",
    steps: ["Open Profile & ID Card.", "Mobile and parent contact details change at once.", "Name, date of birth, parent's name and category need the Academic Section's approval — give the reason and supporting document.", "Download ID card: a printable card with a QR code anyone can verify."] },
  { id: "exit", title: "Leaving the University: no-dues, refund and certificates", roles: ["STUDENT"], topic: "Exit", path: "/me/exit",
    summary: "One checklist for the Library, Hostel, Accounts and Examination Branch.",
    steps: ["Open Exit & Alumni and start your exit formalities.", "Each department clears you from its own desk; any dues are shown with the reason.", "Enter your bank details for the caution-deposit refund.", "The Registrar issues your migration and character certificates once everything is clear."] },
  { id: "parent", title: "For parents: what you can see", roles: ["PARENT"], topic: "Getting started", path: "/dashboard",
    summary: "Read-only access to your ward's attendance and results.",
    steps: ["Your dashboard shows your ward's semester, CGPA and attendance.", "Results & Grade Sheets and My Attendance are read-only for you.", "Attendance shortage alerts are also sent to your registered mobile.", "Raise a support ticket if anything looks wrong."] },
  { id: "applicant", title: "Track your application and fix returned documents", roles: ["APPLICANT"], topic: "Admissions", path: "/application",
    summary: "Follow each stage from submission to admission.",
    steps: ["My Application shows where your application stands.", "If a document is returned, read the remark and upload a corrected file (PDF, JPG or PNG, up to 2 MB).", "After the merit list is published you see your rank and, if offered a seat, accept and pay the admission fee.", "On admission you receive your roll number and University ID, and this login becomes your student portal."] },

  // Teaching
  { id: "daily-attendance", title: "Mark daily attendance", roles: ["FACULTY"], topic: "Attendance", path: "/attendance/classes",
    summary: "Take the register for each class; corrections after the day need a reason.",
    steps: ["Open Daily Attendance — today's classes are listed.", "Open a class: everyone is present by default; tap the absentees.", "Save. Shortage alerts go to students and parents automatically.", "To change a past class, give the reason; the change is logged."] },
  { id: "internal-marks", title: "Enter and submit internal marks", roles: ["FACULTY", "HOD"], topic: "Marks", path: "/marks",
    summary: "Mark sheets per component with maximums from the evaluation scheme.",
    steps: ["Open Internal Marks and choose the course component.", "Type marks or upload the Excel template; values above the maximum are refused.", "Save as draft, then Submit — the sheet locks.", "The Dean verifies it (or returns it with a remark); marks then flow into results."] },
  { id: "moot-court", title: "Run a moot court competition", roles: ["FACULTY", "HOD", "ACADEMIC_STAFF", "COE", "ADMIN"], topic: "Moot court", path: "/moot",
    summary: "Teams, memorials, court-hall booking, judges' score sheets, automatic rankings and awards, and moot marks for the course.",
    steps: [
      "Moot Court → open the competition. Teams of two speakers and a researcher are listed with their memorial scores (Score memorial records the four memorial criteria).",
      "Schedule a round: stage, name, hall, date and time, petitioner and respondent, and the bench. A hall or a team that is already booked at that time is refused.",
      "Enter scores: choose a judge and enter the sheet — five oral criteria for each speaker, two for each researcher. When every judge's sheet is in, the round result is computed.",
      "Team rankings update at once: rounds won, then the weighted score (memorial, oral, researcher), then memorial. Best Speaker, Best Researcher and Best Memorial are decided automatically.",
      "Post to internal marks writes Moot Memorial and Oral Argumentation into the course teacher's marks sheets as drafts — never into a sheet that is already verified.",
    ] },
  { id: "workflow-designer", title: "Change an approval chain (Workflow Designer)", roles: ["ADMIN", "COE", "ACADEMIC_STAFF", "VC", "REGISTRAR"], topic: "Rules", path: "/workflows",
    summary: "Add, remove or reorder approval steps, choose who approves each, and make a step apply only to some requests — without the vendor.",
    steps: [
      "Open Workflow Designer and choose the process (for example Student leave application) → Edit.",
      "Each step has a name, the roles that may approve it and a target in days. Tick Only for some requests to add a condition, e.g. Number of days is more than 3.",
      "Use Try it before saving to see the steps a particular request would go through.",
      "Write the reason (e.g. the Academic Council resolution) and Save version. New requests follow it at once; requests already waiting finish on the version they started with.",
      "The decision screens show each request's chain and who decided each step. The person who approved one step cannot approve the next.",
    ],
    tip: "Every version stays in the history and in the audit trail with the old and new chain." },
  { id: "question-paper", title: "Set, moderate and seal a question paper", roles: ["FACULTY", "HOD", "COE", "EXAM_STAFF"], topic: "Examinations", path: "/question-papers",
    summary: "Draft the paper, test it without publishing it, and pass it through moderation and sealing.",
    steps: [
      "Setter: open Question Papers and Start drafting (or Edit). Write each question, its unit and marks; tick Internal choice to add an (b) alternative.",
      "Watch the automatic checks: the total must equal the paper maximum, every question must be written out and the setter's name must not appear. Coverage of all five units and repeated questions are flagged for the moderator.",
      "Test it without publishing: Show candidate's view renders the paper exactly as it will be printed; Draft PDF gives a watermarked copy stamped with your name. Students never see either.",
      "Submit for moderation. The Head of Department approves it or returns it with comments; a returned paper comes back as the next version.",
      "The Controller seals the approved paper: the content is locked and fingerprinted, and the evaluators' marking screen is generated from it.",
      "One hour before the paper the Controller or Examination Branch releases it for printing; the fingerprint is re-checked first.",
    ],
    tip: "Contents are encrypted in the database. Every save, view, preview and print is in the paper's History and the audit trail." },
  { id: "evaluate", title: "Evaluate answer scripts", roles: ["EVALUATOR", "FACULTY"], topic: "Examinations", path: "/evaluation",
    summary: "Anonymous on-screen marking question by question.",
    steps: ["Open My Evaluations — scripts carry barcodes, not names.", "Enter marks per question; totals are calculated for you.", "Submit and sign with your one-time password; the script locks.", "If two evaluators differ by more than 15%, a third evaluation is assigned automatically."] },

  // Staff
  { id: "exam-cycle", title: "Run an examination cycle", roles: ["COE", "EXAM_STAFF"], topic: "Examinations", path: "/exams",
    summary: "From eligibility to publication.",
    steps: ["Plan the examination and generate its timetable (clash-checked against the calendar).", "Run the eligibility check; the VC decides relaxations.", "Open registration, generate seating and publish admit cards.", "After evaluation, process results (maker), verify (checker), and the VC publishes."] },
  { id: "verify-admission", title: "Verify admission documents", roles: ["ACADEMIC_STAFF", "REGISTRAR"], topic: "Admissions", path: "/admissions",
    summary: "Accept or return each document with a reason.",
    steps: ["Admissions → the cycle → Awaiting verification.", "Open each file and compare it with the form; eligibility is checked automatically.", "Accept, or Reject with a remark the applicant will read.", "The application becomes Verified when every required document is accepted."] },
  { id: "calendar", title: "Maintain the academic calendar", roles: ["ACADEMIC_STAFF", "REGISTRAR"], topic: "Academic setup", path: "/calendar",
    summary: "Terms, holidays, examinations and deadlines in one place.",
    steps: ["Academic Calendar → Add to calendar.", "Choose the type (holiday, examination, deadline…), dates and audience.", "Holidays are checked against scheduled classes and examination papers — you are warned of clashes.", "The examination timetable generator skips every holiday on the calendar."] },
  { id: "curriculum", title: "Revise a curriculum", roles: ["ACADEMIC_STAFF", "REGISTRAR", "VC"], topic: "Academic setup", path: "/academics/programmes",
    summary: "Revisions are new versions; earlier batches are never affected.",
    steps: ["Programmes & Curricula → open the current version → Start a revision.", "Edit, add or remove courses in the draft.", "The Registrar records the Academic Council resolution to approve it.", "The new version applies to batches admitted from its effective year."] },
  { id: "statutory", title: "Prepare AISHE, NIRF and NAAC data", roles: ["IQAC", "REGISTRAR", "VC"], topic: "Reports", path: "/reports/statutory",
    summary: "Tables in each body's format, computed from live records.",
    steps: ["Statutory Returns → choose AISHE, NIRF or NAAC.", "Each table shows where its figures come from.", "Download CSV and transfer to the portal or attach as supporting data.", "For other questions, use the Report Builder."] },
  { id: "no-dues", title: "Clear students at the no-dues desk", roles: ["LIBRARIAN", "WARDEN", "ACCOUNTS", "EXAM_STAFF", "REGISTRAR"], topic: "Student services", path: "/clearance",
    summary: "Clear, record dues, or recover them from the caution deposit.",
    steps: ["Open the No-dues Desk — students leaving or graduating are listed, pending first.", "Check your own records (issue register, room inventory, fee ledger).", "No dues clears the student; Dues blocks clearance until paid; From deposit recovers the amount and clears in one step.", "Accounts then releases the balance of the caution deposit."] },
  { id: "moderation-reval", title: "Moderate a paper and handle revaluations", roles: ["COE", "EXAM_STAFF", "VC"], topic: "Results", path: "/moderation",
    summary: "Out-of-line papers are flagged; revaluations go to a different evaluator.",
    steps: ["Moderation lists papers whose pass rate or mean falls outside the rule; propose a scaling with a reason.", "The Vice-Chancellor approves; the proposer cannot approve their own proposal.", "Revaluation & Scrutiny: assign each request to an eligible evaluator (never the original one).", "Decide the outcome; changed grades produce a new grade sheet and the old one is marked replaced."] },
  { id: "integrations", title: "API keys, DigiLocker and data migration", roles: ["ADMIN"], topic: "Administration", path: "/integrations",
    summary: "Connect partner systems, push documents to DigiLocker and import legacy data.",
    steps: ["API & Keys: issue a key per system with only the permissions it needs; the secret is shown once.", "Connectors & DigiLocker: run the delivery queue and retry failures (usually a missing ABC ID).", "Data Migration: upload a CSV, review the reconciliation, then commit the clean rows.", "Security Posture shows the state of keys, backups and access controls at a glance."] },
  { id: "backup", title: "Backups and restore", roles: ["ADMIN"], topic: "Administration", path: "/admin/backup",
    summary: "Nightly verified backups; restore with a safety copy.",
    steps: ["Backups run every night at 02:00 IST; Back up now takes one at any time.", "Verify reads a backup back and checks its SHA-256 fingerprint.", "Download the file for off-site storage.", "Restore replaces all data after saving the current state as a safety backup."] },

  // Everyone
  { id: "sign-in", title: "Signing in, one-time passwords and switching roles", roles: [...STAFF, "FACULTY", "EVALUATOR", "STUDENT", "PARENT", "LIBRARIAN", "WARDEN", "ACCOUNTS", "APPLICANT"], topic: "Getting started", path: "/dashboard",
    summary: "Your University e-mail and password; examination roles also enter a one-time password.",
    steps: ["Sign in with your University account (single sign-on with Google Workspace / Microsoft 365 in production).", "Controller, Examination Branch, evaluators and IT enter a one-time password as well.", "Sessions end after 8 hours; use Switch role to sign out.", "Forgotten password or locked out? Raise a ticket under Sign-in & access — or ask a colleague to raise it for you."] },
  { id: "support", title: "Getting help: raising a support ticket", roles: [...STAFF, "FACULTY", "EVALUATOR", "STUDENT", "PARENT", "LIBRARIAN", "WARDEN", "ACCOUNTS", "APPLICANT"], topic: "Getting started", path: "/support",
    summary: "Tickets go straight to the office that can solve them, with response targets.",
    steps: ["Support Tickets → Raise a ticket; choose the category and priority.", "It is routed automatically (Examination Branch, Academic Section, Accounts or IT).", "You can see when a response is due; replies appear on the ticket.", "When it is resolved, confirm with a rating or reopen it if the problem remains."] },
];

export const TRAINING = [
  { audience: "IT Section & Academic Section (train-the-trainer)", mode: "On campus, 3 days", date: "2026-10-12", status: "DONE", attended: "6 of 6" },
  { audience: "Controller of Examinations & Examination Branch", mode: "On campus, 2 days", date: "2026-10-19", status: "DONE", attended: "5 of 5" },
  { audience: "Deans and Heads of Department", mode: "On campus, half day", date: "2026-10-28", status: "DONE", attended: "7 of 8" },
  { audience: "Faculty — attendance, internal marks, on-screen evaluation", mode: "On campus + recorded", date: "2026-11-09", status: "SCHEDULED", attended: "—" },
  { audience: "Library, Hostel and Accounts desks", mode: "Online, 2 hours", date: "2026-11-11", status: "SCHEDULED", attended: "—" },
  { audience: "Students (orientation)", mode: "Short videos + help pages", date: "2026-11-16", status: "SCHEDULED", attended: "—" },
  { audience: "Refresher for all staff (six-monthly)", mode: "On campus", date: "2027-05-17", status: "PLANNED", attended: "—" },
];

export function articlesFor(role: string, q?: string, path?: string) {
  const mine = ARTICLES.filter((a) => a.roles.includes(role));
  const query = q?.trim().toLowerCase();
  const matched = query ? mine.filter((a) => [a.title, a.summary, a.topic, ...a.steps].some((t) => t.toLowerCase().includes(query))) : mine;
  const here = path ? matched.filter((a) => a.path && (path === a.path || path.startsWith(`${a.path}/`))) : [];
  return { here, all: matched };
}
