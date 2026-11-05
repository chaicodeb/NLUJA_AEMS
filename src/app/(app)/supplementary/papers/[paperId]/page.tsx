import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/session";
import { awardList } from "@/lib/results/supplementary";
import { Badge, Callout, Card, CardHeader, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { AwardListForm } from "../../client";

export default async function AwardListPage({ params }: PageProps<"/supplementary/papers/[paperId]">) {
  const user = await requirePage("/supplementary");
  const { paperId } = await params;
  const data = await awardList(paperId).catch(() => null);
  if (!data) notFound();
  const { paper, rows } = data;
  const submitted = rows.length > 0 && rows.every((r) => r.supMark?.status === "SUBMITTED");
  const locked = submitted || !["EXAM_STAFF", "COE"].includes(user.role) || ["RESULT", "CLOSED"].includes(paper.exam.status);

  return (
    <div className="space-y-6">
      <div className="text-sm"><Link href="/supplementary" className="text-brand-700 hover:underline">← Supplementary examination</Link></div>
      <PageHeader
        eyebrow={`${paper.exam.code} · award list`}
        title={`${paper.course.code} ${paper.course.title}`}
        description={`${formatDate(paper.date)} · end-semester paper out of ${paper.maxMarks}. Internal assessment is carried forward from the regular attempt.`}
        actions={<Badge tone={submitted ? "green" : "amber"}>{submitted ? "Submitted" : "Draft"}</Badge>}
      />
      {submitted && <Callout tone="green" title="Award list submitted">Marks are locked and will be used when supplementary results are processed.</Callout>}
      <Card>
        <CardHeader title={`${rows.length} candidate(s)`} />
        <AwardListForm
          paperId={paper.id}
          max={paper.maxMarks}
          locked={locked}
          rows={rows.map((r) => ({ id: r.id, rollNo: r.registration.student.rollNo, name: r.registration.student.name, kind: r.kind, marks: r.supMark?.marks ?? null, absent: r.supMark?.absent ?? false }))}
        />
      </Card>
    </div>
  );
}
