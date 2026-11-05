/** Courses of earlier semesters, migrated from legacy records (titles per the NLUJA B.A. LL.B. course structure). */

export const LEGACY_BALLB_2019: Record<number, [string, string, string][]> = {
  1: [
    ["BL1.1", "General English (Grammar and Phonetics)", "HSS"],
    ["BL1.2", "Indian History (Ancient, Medieval and Modern)", "HSS"],
    ["BL1.3", "Political Theory, State and Political Obligations", "HSS"],
    ["BL1.4", "Principles of Sociology and Theoretical Sociology", "HSS"],
    ["BL1.5", "Law of Torts, MVA and Consumer Protection", "CORE"],
  ],
  2: [
    ["BL2.1", "Law and Literature (Legal Language)", "HSS"],
    ["BL2.2", "Modern Indian and World History", "HSS"],
    ["BL2.3", "International Relations", "HSS"],
    ["BL2.4", "General Principles of Economics (Micro and Macro)", "HSS"],
    ["BL2.5", "General Principles of Contract and Specific Relief Act", "CORE"],
  ],
  3: [
    ["BL3.1", "Legal and Constitutional History", "HSS"],
    ["BL3.2", "Public Administration", "HSS"],
    ["BL3.3", "Sociology of Law", "HSS"],
    ["BL3.4", "Jurisprudence & Legal Theory", "CORE"],
    ["BL3.5", "Special Contracts", "CORE"],
  ],
  4: [
    ["BL4.1", "Law and Economics", "HSS"],
    ["BL4.2", "Law of Crimes (Indian Penal Code)", "CORE"],
    ["BL4.3", "Family Law-I", "CORE"],
    ["BL4.4", "Constitutional Law-I", "CORE"],
    ["BL4.5", "Law of Civil Procedure & Limitation", "CORE"],
  ],
  5: [
    ["BL5.1", "Family Law-II", "CORE"],
    ["BL5.2", "Constitutional Law-II", "CORE"],
    ["BL5.3", "Law of Property and Easements", "CORE"],
    ["BL5.4", "Public International Law", "CORE"],
    ["BL5.5", "Law of Criminal Procedure", "CORE"],
  ],
  6: [
    ["BL6.1", "Law of Evidence", "CORE"],
    ["BL6.2", "Administrative Law", "CORE"],
    ["BL6.3", "Company Law", "CORE"],
    ["BL6.4", "Environmental Law", "CORE"],
    ["BL6.5", "Intellectual Property Law", "OPTIONAL"],
  ],
  7: [
    ["BL7.1", "Labour Law-I", "CORE"],
    ["BL7.2", "Investment Laws", "OPTIONAL"],
    ["BL7.3", "Private International Law", "OPTIONAL"],
    ["BL7.4", "Hons. Paper-I: Constitutional Theory", "HONOURS"],
    ["BL7.5", "Hons. Paper-II: Federalism and Centre-State Relations", "HONOURS"],
  ],
  8: [
    ["BL8.1", "Labour Law-II", "CORE"],
    ["BL8.2", "Principles of Legislation and Interpretation of Statutes", "OPTIONAL"],
    ["BL8.3", "Mediation (with Conciliation)", "CORE"],
    ["BL8.4", "Hons. Paper-III: Judicial Review", "HONOURS"],
    ["BL8.5", "Hons. Paper-IV: Comparative Federalism", "HONOURS"],
  ],
};

export const LEGACY_BALLB_2025: Record<number, [string, string, string][]> = {
  1: [
    ["BL1.1", "General English (Grammar and Phonetics) (English-I)", "HSS"],
    ["BL1.2", "Indian History (Ancient, Medieval and Modern) (History-I)", "HSS"],
    ["BL1.3", "Political Theory, State and Political Obligations (Political Science-I)", "HSS"],
    ["BL1.4", "Principles of Sociology and Theoretical Sociology (Sociology-I)", "HSS"],
    ["BL1.5", "Law of Torts, MVA and Consumer Protection", "CORE"],
    ["BL1.6", "Legal Methods (Opt.-I)", "OPTIONAL"],
  ],
  2: [
    ["BL2.1", "Law and Literature (Legal Language) (English-II)", "HSS"],
    ["BL2.2", "Modern Indian and World History (History-II)", "HSS"],
    ["BL2.3", "International Relations (Political Science-II)", "HSS"],
    ["BL2.4", "Indian Society: Structural Dynamics (Sociology-II)", "HSS"],
    ["BL2.5", "General Principles of Economics (Micro and Macro) (Economics-I)", "HSS"],
    ["BL2.6", "General Principles of Contract and Specific Relief Act", "CORE"],
  ],
};

/** Academic year in which a batch studied a given semester. */
export function academicYearOf(admissionYear: number, semester: number) {
  const y = admissionYear + Math.floor((semester - 1) / 2);
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}
