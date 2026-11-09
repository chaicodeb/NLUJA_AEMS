import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { canManage } from "@/lib/moot/moot";
import { ROLES, STAGES, criteriaFor } from "@/lib/moot/shared";
import { Badge, Card, CardHeader, PageHeader, Table, TD, TH, THead, TR } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { ScoreSheet } from "./score-sheet";

export default async function MootRoundPage({ params }: PageProps<"/moot/[id]/round/[roundId]">) {
  const user = await requirePage("/moot");
  const { id, roundId } = await params;
  const round = await db.mootRound.findUnique({ where: { id: roundId }, include: { scores: true } });
  if (!round || round.competitionId !== id) notFound();
  const teams = await db.mootTeam.findMany({ where: { id: { in: [round.petitionerId, round.respondentId] } }, include: { members: { include: { student: true }, orderBy: { role: "asc" } } } });
  const side = (tid: string) => (tid === round.petitionerId ? "Petitioner" : "Respondent");
  const ordered = [...teams].sort((a) => (a.id === round.petitionerId ? -1 : 1));
  const participants = ordered.flatMap((t) => t.members.map((m) => ({ id: m.id, name: m.student.name, role: m.role, team: t.code, side: side(t.id), criteria: criteriaFor(m.role) })));
  const manage = await canManage(id, user);
  const byJudge = Object.fromEntries(round.judges.map((j) => [j, Object.fromEntries(round.scores.filter((s) => s.judge === j).map((s) => [s.memberId, s.criteria as Record<string, number>]))]));

  return (
    <div className="space-y-6">
      <Link href={`/moot/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Competition</Link>
      <PageHeader
        eyebrow={`${STAGES[round.stage]} · ${round.courtroom} · ${formatDate(round.startsAt, true)}`}
        title={round.name}
        description={`Bench: ${round.judges.join(", ")} · each judge's sheet scores every speaker on five criteria (5 each) and each researcher on two (5 each)`}
        actions={<Badge tone={round.status === "SCORED" ? "green" : "amber"}>{round.status === "SCORED" ? "All sheets in" : `${new Set(round.scores.map((s) => s.judge)).size}/${round.judges.length} sheets in`}</Badge>}
      />
      {manage && <ScoreSheet roundId={round.id} judges={round.judges} participants={participants} existing={byJudge} />}
      <Card>
        <CardHeader title="Sheets received" />
        <Table>
          <THead>
            <tr>
              <TH>Participant</TH>
              {round.judges.map((j) => <TH key={j} className="text-right">{j}</TH>)}
            </tr>
          </THead>
          <tbody>
            {participants.map((p) => (
              <TR key={p.id}>
                <TD>{p.name}<div className="text-xs text-muted-foreground">Team {p.team} · {p.side} · {ROLES[p.role]}</div></TD>
                {round.judges.map((j) => {
                  const s = round.scores.find((x) => x.judge === j && x.memberId === p.id);
                  return <TD key={j} className="text-right">{s ? `${s.total}/${p.criteria.reduce((a, c) => a + c.max, 0)}` : "—"}</TD>;
                })}
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
