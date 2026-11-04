import Link from "next/link";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/session";
import { Badge, Card, PageHeader, Table, TD, TH, THead, TR } from "@/components/ui";

export default async function StudentsPage({ searchParams }: PageProps<"/students">) {
  await requirePage("/students");
  const { batch, q } = await searchParams;
  const batches = await db.batch.findMany({ orderBy: { code: "asc" } });
  const students = await db.student.findMany({
    where: {
      ...(batch ? { batch: { code: String(batch) } } : {}),
      ...(q ? { OR: [{ name: { contains: String(q), mode: "insensitive" } }, { rollNo: { contains: String(q), mode: "insensitive" } }, { uid: { contains: String(q), mode: "insensitive" } }] } : {}),
    },
    include: { batch: true, semResults: { orderBy: { semester: "desc" }, take: 1 } },
    orderBy: [{ batch: { code: "asc" } }, { rollNo: "asc" }],
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Student Lifecycle"
        title="Student master"
        description="Single UID-based student record referenced by every module — attendance, examinations, results and documents."
      />
      <Card>
        <form className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          <input name="q" defaultValue={q ? String(q) : ""} placeholder="Search name, roll no. or UID" className="h-9 w-72 rounded-md border border-border px-3 text-sm" />
          <select name="batch" defaultValue={batch ? String(batch) : ""} className="h-9 rounded-md border border-border px-3 text-sm">
            <option value="">All batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.code}>{b.name}</option>
            ))}
          </select>
          <button className="h-9 rounded-md bg-brand-700 px-4 text-sm font-medium text-white">Filter</button>
          <span className="ml-auto text-sm text-muted-foreground">{students.length} students</span>
        </form>
        <Table>
          <THead>
            <tr>
              <TH>UID</TH>
              <TH>Roll No.</TH>
              <TH>Name</TH>
              <TH>Batch</TH>
              <TH>Category</TH>
              <TH className="text-right">CGPA</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <tbody>
            {students.map((s) => (
              <TR key={s.id}>
                <TD className="font-mono text-xs">{s.uid}</TD>
                <TD className="font-mono text-xs">{s.rollNo}</TD>
                <TD>
                  <Link href={`/students/${s.id}`} className="font-medium text-brand-700 hover:underline">{s.name}</Link>
                </TD>
                <TD>{s.batch.name}</TD>
                <TD>{s.category}</TD>
                <TD className="text-right">{s.semResults[0]?.cgpa.toFixed(2) ?? "—"}</TD>
                <TD><Badge tone="green">{s.status}</Badge></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
