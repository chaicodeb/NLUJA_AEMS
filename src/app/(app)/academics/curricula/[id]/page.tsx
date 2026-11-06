import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { CATEGORIES, curriculumDetail } from "@/lib/academics/curriculum";
import { Badge, Callout, Card, CardBody, CardHeader, PageHeader, Stat, Table, TD, TH, THead, TR } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { AddCourse, ApproveForm, CloneForm, DraftCourseActions, FacultySelect } from "./client";

const CATEGORY_TONE: Record<string, "brand" | "green" | "blue" | "violet" | "amber" | "neutral"> = {
  CORE: "brand", CLINICAL: "green", MOOT: "green", HONOURS: "violet", OPTIONAL: "blue", HSS: "neutral", SPECIALIZATION: "violet", DISSERTATION: "amber",
};

export default async function CurriculumPage({ params }: PageProps<"/academics/curricula/[id]">) {
  const user = await requirePage("/academics/programmes");
  const { id } = await params;
  const { cv, bySem, credits } = await curriculumDetail(id);
  const [schemes, facultyUsers] = await Promise.all([db.evaluationScheme.findMany({ orderBy: { code: "asc" } }), db.user.findMany({ where: { role: "FACULTY" }, orderBy: { name: "asc" } })]);
  const schemeOpts = schemes.map((s) => ({ id: s.id, name: s.name }));
  const faculty = facultyUsers.map((f) => ({ id: f.id, name: f.name }));
  const draft = cv.status === "DRAFT";
  const canDraft = ["ACADEMIC_STAFF", "ADMIN"].includes(user.role);
  const canAssign = ["ACADEMIC_STAFF", "HOD", "ADMIN"].includes(user.role);
  const canApprove = ["REGISTRAR", "VC", "ADMIN"].includes(user.role);
  const year = cv.effectiveFrom + 2 > 2027 ? cv.effectiveFrom + 1 : 2027;
  const semesters = Array.from({ length: cv.programme.durationSemesters }, (_, i) => i + 1);

  return (
    <div className="space-y-6">
      <Link href="/academics/programmes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Programmes & curricula
      </Link>
      <PageHeader
        eyebrow={`${cv.programme.name} · ${cv.code}`}
        title={cv.name}
        description={cv.notes ?? undefined}
        actions={
          !draft && canDraft ? (
            <CloneForm sourceId={cv.id} suggestion={{ code: cv.code.replace(/\d{4}$/, String(year)), name: `${cv.programme.name} Curriculum — ${year}-${String(year + 1).slice(2)} onwards`, effectiveFrom: year }} />
          ) : (
            <Badge tone={draft ? "amber" : "green"}>{draft ? "Draft" : "Approved"}</Badge>
          )
        }
      />
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Courses" value={cv.courses.length} tone="brand" />
        <Stat label="Credits" value={credits} hint={cv.totalCredits ? `Programme requires ${cv.totalCredits}` : undefined} tone={cv.totalCredits && credits !== cv.totalCredits ? "amber" : "green"} />
        <Stat label="Effective" value={<span className="text-xl">{cv.effectiveFrom}{cv.effectiveTo ? `–${cv.effectiveTo}` : "+"}</span>} hint="Year of admission" />
        <Stat label="Batches on this version" value={cv.batches.length} hint={cv.batches.map((b) => `${b.code} (${b._count.students})`).join(", ") || "None yet"} />
      </div>

      {draft ? (
        <Callout tone="amber" title={`Draft${cv.basedOnCode ? ` revision of ${cv.basedOnCode}` : ""}`}>
          Add, edit or remove courses freely. The draft applies to no batch until the Academic Council&apos;s approval is recorded; approval checks that every semester has courses and the credits add up{cv.totalCredits ? ` to ${cv.totalCredits}` : ""}{cv.basedOnCode ? `, and closes ${cv.basedOnCode} for later admissions` : ""}.
        </Callout>
      ) : (
        <Callout tone="green" title={`Approved${cv.approvalRef ? ` — ${cv.approvalRef}` : ""}${cv.approvedAt ? ` (recorded ${formatDate(cv.approvedAt)})` : ""}`}>
          The course structure is frozen so results of batches on this version never change retrospectively. Teachers can still be reassigned; to revise courses, start a new version.
        </Callout>
      )}
      {draft && canApprove && (
        <Card>
          <CardHeader title="Academic Council approval" description="Record the resolution once the Council has approved the revision." />
          <CardBody><ApproveForm curriculumId={cv.id} /></CardBody>
        </Card>
      )}

      {semesters.map((sem) => {
        const list = bySem.get(sem) ?? [];
        if (!list.length && !draft) return null;
        return (
          <Card key={sem}>
            <CardHeader title={`Semester ${sem}`} description={`${list.length} course${list.length === 1 ? "" : "s"} · ${list.reduce((a, c) => a + c.credits, 0)} credits`} />
            {list.length > 0 && (
              <Table>
                <THead>
                  <tr>
                    <TH>Code</TH>
                    <TH>Course</TH>
                    <TH>Category</TH>
                    <TH className="text-right">Credits</TH>
                    <TH>Evaluation scheme</TH>
                    <TH>Teacher</TH>
                    {draft && canDraft && <TH />}
                  </tr>
                </THead>
                <tbody>
                  {list.map((c) => (
                    <TR key={c.id}>
                      <TD className="font-mono text-xs">{c.code}</TD>
                      <TD className="font-medium">{c.title}<div className="text-xs font-normal text-muted-foreground">{c.plannedSessions} planned sessions{c._count.enrolments ? ` · ${c._count.enrolments} registrations` : ""}</div></TD>
                      <TD><Badge tone={CATEGORY_TONE[c.category]}>{c.category}</Badge></TD>
                      <TD className="text-right">{c.credits}</TD>
                      <TD className="text-xs text-muted-foreground">{c.scheme.name}</TD>
                      <TD>{canAssign && !draft ? <FacultySelect courseId={c.id} value={c.facultyId} faculty={faculty} code={c.code} /> : <span className="text-sm text-muted-foreground">{c.faculty?.name ?? "—"}</span>}</TD>
                      {draft && canDraft && (
                        <TD className="min-w-24">
                          <DraftCourseActions
                            curriculumId={cv.id}
                            schemes={schemeOpts}
                            faculty={faculty}
                            categories={CATEGORIES}
                            course={{ id: c.id, code: c.code, title: c.title, semester: c.semester, credits: c.credits, category: c.category, schemeId: c.schemeId, plannedSessions: c.plannedSessions, facultyId: c.facultyId }}
                          />
                        </TD>
                      )}
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
            {draft && canDraft && (
              <CardBody className="border-t border-border">
                <AddCourse curriculumId={cv.id} semester={sem} schemes={schemeOpts} faculty={faculty} categories={CATEGORIES} credits={cv.creditsPerCourse} />
              </CardBody>
            )}
          </Card>
        );
      })}
    </div>
  );
}
