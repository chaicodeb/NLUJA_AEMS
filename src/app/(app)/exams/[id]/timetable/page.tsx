import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePage } from "@/lib/session";
import { timetableContext } from "@/lib/exams/timetable";
import { Badge, Callout, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { TimetableEditor } from "./editor";

export default async function TimetablePage({ params }: PageProps<"/exams/[id]/timetable">) {
  const user = await requirePage("/exams");
  const { id } = await params;
  const ctx = await timetableContext(id);
  const { exam } = ctx;
  return (
    <div className="space-y-6">
      <Link href={exam.status === "PLANNED" ? "/exams" : `/exams/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {exam.status === "PLANNED" ? "Examinations" : exam.name}
      </Link>
      <PageHeader
        eyebrow={`${exam.code} · ${exam.parity.toLowerCase()} semester · ${exam.academicYear}`}
        title={`Timetable — ${exam.name}`}
        description={`Window ${formatDate(exam.startDate)} – ${formatDate(exam.endDate)}. Papers are derived from the curriculum of each running batch.`}
        actions={
          <div className="flex gap-2">
            <Badge tone="brand">{exam.status.replace("_", " ")}</Badge>
            {exam.timetablePublishedAt ? <Badge tone="green">Published {formatDate(exam.timetablePublishedAt)}</Badge> : <Badge tone="amber">Not published</Badge>}
          </div>
        }
      />
      {ctx.slots.length === 0 && <Callout tone="amber">No running batch has papers with a written examination in this semester.</Callout>}
      <TimetableEditor
        examId={id}
        slots={ctx.slots}
        rules={ctx.rules}
        locked={ctx.locked}
        canEdit={["COE", "EXAM_STAFF", "ADMIN"].includes(user.role)}
        canPublish={["COE", "ADMIN"].includes(user.role)}
        published={!!exam.timetablePublishedAt}
      />
    </div>
  );
}
