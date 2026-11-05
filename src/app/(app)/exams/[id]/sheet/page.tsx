import Image from "next/image";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { sessionKey } from "@/lib/exams/seating";
import { formatDate } from "@/lib/utils";
import { PrintButton } from "./print-button";

export default async function AttendanceSheet({ params, searchParams }: PageProps<"/exams/[id]/sheet">) {
  await requirePage("/exams");
  const { id } = await params;
  const { session } = await searchParams;
  const exam = await db.exam.findUnique({ where: { id }, include: { papers: { include: { course: true } } } });
  if (!exam) notFound();
  const papers = exam.papers.filter((p) => sessionKey(p.date, p.session) === session);
  if (!papers.length) notFound();
  const seats = await db.seatAllocation.findMany({
    where: { examPaperId: { in: papers.map((p) => p.id) } },
    include: { student: true, room: true, examPaper: { include: { course: true } } },
    orderBy: { benchNo: "asc" },
  });
  const duties = await db.invigilation.findMany({ where: { examId: id, session: papers[0].session, date: new Date(`${String(session).split("|")[0]}T00:00:00.000Z`) }, include: { user: true } });
  const rooms = Array.from(new Map(seats.map((s) => [s.roomId, s.room])).values()).sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div className="space-y-8">
      <div className="no-print flex justify-end">
        <PrintButton />
      </div>
      {rooms.map((room) => (
        <section key={room.id} className="break-after-page rounded-lg border border-border bg-white p-8 text-sm print:border-0 print:p-0">
          <div className="flex items-center gap-4 border-b border-border pb-4">
            <Image src="/brand/footer_logo.webp" alt="" width={56} height={56} />
            <div className="flex-1 text-center">
              <div className="font-serif text-base font-bold text-brand-800">NATIONAL LAW UNIVERSITY AND JUDICIAL ACADEMY, ASSAM</div>
              <div className="text-xs">{exam.name}</div>
              <div className="mt-1 font-semibold tracking-wide">ATTENDANCE SHEET</div>
            </div>
            <div className="w-14" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1 text-xs sm:grid-cols-4">
            <div><span className="text-muted-foreground">Date:</span> {formatDate(papers[0].date)}</div>
            <div><span className="text-muted-foreground">Session:</span> {papers[0].session === "FN" ? "Forenoon" : "Afternoon"}</div>
            <div><span className="text-muted-foreground">Room:</span> {room.name}</div>
            <div><span className="text-muted-foreground">Invigilator:</span> {duties.find((d) => d.roomId === room.id)?.user.name ?? "—"}</div>
          </div>
          <table className="mt-4 w-full border-collapse text-xs">
            <thead>
              <tr className="bg-muted/60">
                {["#", "Bench", "Roll No.", "Name of candidate", "Paper", "Answer booklet no.", "Signature of candidate"].map((h) => (
                  <th key={h} className="border border-border px-2 py-1.5 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {seats
                .filter((s) => s.roomId === room.id)
                .map((s, i) => (
                  <tr key={s.id}>
                    <td className="border border-border px-2 py-2.5">{i + 1}</td>
                    <td className="border border-border px-2 py-2.5 font-mono font-semibold">{s.benchNo.split("/")[1]}</td>
                    <td className="border border-border px-2 py-2.5 font-mono">{s.student.rollNo}</td>
                    <td className="border border-border px-2 py-2.5">{s.student.name}</td>
                    <td className="border border-border px-2 py-2.5 font-mono">{s.examPaper.course.code}</td>
                    <td className="w-32 border border-border px-2 py-2.5" />
                    <td className="w-40 border border-border px-2 py-2.5" />
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="mt-10 grid grid-cols-2 gap-8 text-xs">
            <div className="border-t border-foreground/40 pt-1">Signature of Invigilator (with date)</div>
            <div className="border-t border-foreground/40 pt-1 text-right">Signature of Chief Superintendent</div>
          </div>
        </section>
      ))}
    </div>
  );
}
