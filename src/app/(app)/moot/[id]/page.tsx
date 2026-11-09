import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Award, BookOpen, Mic, Search } from "lucide-react";
import { requirePage } from "@/lib/session";
import { canManage, competitionView } from "@/lib/moot/moot";
import { COURTROOMS, MEMORIAL_CRITERIA, ROLES, STAGES } from "@/lib/moot/shared";
import { Badge, Callout, Card, CardHeader, PageHeader, Stat, Table, TD, TH, THead, TR, buttonVariants } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { MemorialEditor, PostMarksButton, ScheduleRoundForm } from "./client";

export default async function MootCompetitionPage({ params }: PageProps<"/moot/[id]">) {
  const user = await requirePage("/moot");
  const { id } = await params;
  const v = await competitionView(id);
  if (!v) notFound();
  const manage = await canManage(id, user);
  const { competition: c, weights, standings, rounds, awards, marks } = v;
  const teamCode = new Map(c.teams.map((t) => [t.id, t.code]));
  const pct = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(1)}`);

  return (
    <div className="space-y-6">
      <Link href="/moot" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Moot court</Link>
      <PageHeader eyebrow={`Moot court · weights memorial ${weights.memorial}% · oral ${weights.oral}% · researcher ${weights.researcher}%`} title={c.name} description={c.problem} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Best speaker" value={awards.bestSpeaker ? awards.bestSpeaker.member.student.name : "—"} hint={awards.bestSpeaker ? `${(awards.bestSpeaker.avg! * 100).toFixed(1)}% over ${awards.bestSpeaker.sheets} score sheets` : "After two rounds"} tone="brand" />
        <Stat label="Best researcher" value={awards.bestResearcher ? awards.bestResearcher.member.student.name : "—"} hint={awards.bestResearcher ? `${(awards.bestResearcher.avg! * 100).toFixed(1)}%` : undefined} tone="green" />
        <Stat label="Best memorial" value={awards.bestMemorial ? `Team ${awards.bestMemorial.code}` : "—"} hint={awards.bestMemorial ? `${awards.bestMemorial.memorial}/100` : undefined} tone="amber" />
      </div>

      <Card>
        <CardHeader title="Team rankings" description="Ranked by rounds won, then the weighted score (memorial, oral and researcher), then memorial — recalculated as each score sheet is entered" />
        <Table>
          <THead>
            <tr>
              <TH>#</TH>
              <TH>Team</TH>
              <TH className="text-right">Played</TH>
              <TH className="text-right">Won</TH>
              <TH className="text-right">Memorial</TH>
              <TH className="text-right">Oral %</TH>
              <TH className="text-right">Researcher %</TH>
              <TH className="text-right">Weighted score</TH>
            </tr>
          </THead>
          <tbody>
            {standings.map((s) => (
              <TR key={s.team.id}>
                <TD>{s.rank <= 3 ? <Badge tone={s.rank === 1 ? "amber" : "neutral"}><Award className="h-3 w-3" /> {s.rank}</Badge> : s.rank}</TD>
                <TD>
                  <div className="font-medium">Team {s.team.code}</div>
                  <div className="text-xs text-muted-foreground">{s.team.members.map((m) => `${m.student.name} (${ROLES[m.role]})`).join(", ")}</div>
                </TD>
                <TD className="text-right">{s.played}</TD>
                <TD className="text-right font-semibold">{s.wins}</TD>
                <TD className="text-right">{s.memorial ?? "—"}</TD>
                <TD className="text-right">{pct(s.oral)}</TD>
                <TD className="text-right">{pct(s.research)}</TD>
                <TD className="text-right font-semibold">{s.total.toFixed(2)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Rounds and court halls" description={`${COURTROOMS.join(" · ")} — a hall or a team cannot be booked twice at the same time`} />
        <Table>
          <THead>
            <tr>
              <TH>Round</TH>
              <TH>Hall and time</TH>
              <TH>Bench</TH>
              <TH>Result</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {rounds.map(({ round: r, petitionerPoints, respondentPoints, winner }) => (
              <TR key={r.id}>
                <TD>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{STAGES[r.stage]} · Petitioner {teamCode.get(r.petitionerId)} · Respondent {teamCode.get(r.respondentId)}</div>
                </TD>
                <TD className="text-xs">{r.courtroom}<div className="text-muted-foreground">{formatDate(r.startsAt, true)} · {r.durationMins} min</div></TD>
                <TD className="text-xs">{r.judges.join(", ")}</TD>
                <TD className="text-xs">
                  {r.status === "SCORED" ? (
                    <>
                      <Badge tone="green">{teamCode.get(winner!)} won</Badge>
                      <div className="mt-1 text-muted-foreground">{teamCode.get(r.petitionerId)} {petitionerPoints} – {respondentPoints} {teamCode.get(r.respondentId)}</div>
                    </>
                  ) : (
                    <Badge tone="amber">{r.scores.length ? "Score sheets coming in" : "Scheduled"}</Badge>
                  )}
                </TD>
                <TD className="text-right">
                  <Link href={`/moot/${c.id}/round/${r.id}`} className={buttonVariants({ size: "sm", variant: r.status === "SCORED" ? "outline" : "default" })}>
                    {r.status === "SCORED" ? "Score sheets" : manage ? "Enter scores" : "Open"}
                  </Link>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
        {manage && (
          <div className="border-t border-border p-4 sm:p-5">
            <ScheduleRoundForm competitionId={c.id} teams={c.teams.map((t) => ({ id: t.id, code: t.code }))} courtrooms={COURTROOMS} />
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Teams and memorials" description={`Memorial out of 100: ${MEMORIAL_CRITERIA.map((k) => `${k.name} ${k.max}`).join(" · ")}`} />
        <Table>
          <THead>
            <tr>
              <TH>Team</TH>
              <TH>Members</TH>
              <TH className="text-right">Memorial</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {c.teams.map((t) => (
              <TR key={t.id}>
                <TD className="font-medium">Team {t.code}</TD>
                <TD className="text-xs">
                  {t.members.map((m) => (
                    <div key={m.id} className="flex items-center gap-1.5">
                      {m.role === "RESEARCHER" ? <Search className="h-3 w-3 text-muted-foreground" /> : <Mic className="h-3 w-3 text-muted-foreground" />}
                      {m.student.name} <span className="text-muted-foreground">· {ROLES[m.role]} · {m.student.rollNo}</span>
                    </div>
                  ))}
                </TD>
                <TD className="text-right">
                  <div className="font-semibold">{t.memorial ?? "—"}</div>
                  {t.memorialBy && <div className="text-[11px] text-muted-foreground">{t.memorialBy}</div>}
                </TD>
                <TD className="text-right">{manage && <MemorialEditor teamId={t.id} code={t.code} criteria={MEMORIAL_CRITERIA} initial={(t.memorialDetail as Record<string, number> | null) ?? {}} />}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader
          title="Internal marks from the moot"
          description="Moot Memorial (25) from the team's memorial; Oral Argumentation (5 criteria × 5) from the judges' averages — researchers are marked on their researcher score"
          action={manage ? <PostMarksButton competitionId={c.id} /> : undefined}
        />
        <Callout tone="blue">
          <span className="inline-flex items-start gap-1.5"><BookOpen className="mt-0.5 h-4 w-4 shrink-0" /> Posting writes these into the course teacher&apos;s Moot Memorial and Oral Argumentation sheets as drafts. If those sheets are already verified, the Controller of Examinations must reopen them first — the marks lock is never bypassed.</span>
        </Callout>
        <Table>
          <THead>
            <tr>
              <TH>Student</TH>
              <TH>Team · role</TH>
              <TH className="text-right">Memorial /25</TH>
              <TH className="text-right">Oral /25</TH>
            </tr>
          </THead>
          <tbody>
            {marks.map((m) => (
              <TR key={m.student.id}>
                <TD><span className="font-mono text-xs text-muted-foreground">{m.student.rollNo}</span> {m.student.name}</TD>
                <TD className="text-xs">{m.team} · {ROLES[m.role]}</TD>
                <TD className="text-right">{m.memo ?? "—"}</TD>
                <TD className="text-right">{m.oralTotal ?? "—"}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
