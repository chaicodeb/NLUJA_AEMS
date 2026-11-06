"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CopyPlus, Pencil, Plus, Stamp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Label, Select } from "@/components/ui";
import { approveCurriculumAction, assignFacultyAction, cloneCurriculumAction, deleteCourseAction, saveCourseAction } from "../../actions";

type Option = { id: string; name: string };
export type CourseValues = { id?: string; code: string; title: string; semester: number; credits: number; category: string; schemeId: string; plannedSessions: number; facultyId: string | null };

export function FacultySelect({ courseId, value, faculty, code }: { courseId: string; value: string | null; faculty: Option[]; code: string }) {
  const [pending, start] = useTransition();
  return (
    <Select
      className="h-8 w-48 text-xs"
      value={value ?? ""}
      disabled={pending}
      aria-label={`Teacher for ${code}`}
      onChange={(e) =>
        start(async () => {
          const r = await assignFacultyAction(courseId, e.target.value || null);
          if (r.error) toast.error(r.error);
          else toast.success(`${code}: teacher updated`);
        })
      }
    >
      <option value="">Unassigned</option>
      {faculty.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
    </Select>
  );
}

export function CourseForm({ curriculumId, initial, schemes, faculty, categories, onDone }: { curriculumId: string; initial: CourseValues; schemes: Option[]; faculty: Option[]; categories: string[]; onDone: () => void }) {
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const set = <K extends keyof CourseValues>(k: K, x: CourseValues[K]) => setV((p) => ({ ...p, [k]: x }));
  return (
    <div className="grid gap-2 rounded-lg border border-brand-200 bg-brand-50/40 p-3 sm:grid-cols-8">
      <Input className="h-8 text-xs" placeholder="Code" value={v.code} onChange={(e) => set("code", e.target.value)} aria-label="Course code" />
      <Input className="h-8 text-xs sm:col-span-3" placeholder="Title" value={v.title} onChange={(e) => set("title", e.target.value)} aria-label="Course title" />
      <Select className="h-8 text-xs" value={v.category} onChange={(e) => set("category", e.target.value)} aria-label="Category">
        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
      </Select>
      <Input className="h-8 text-xs" type="number" min={1} max={12} value={v.credits} onChange={(e) => set("credits", Number(e.target.value))} aria-label="Credits" />
      <Input className="h-8 text-xs" type="number" min={10} max={120} value={v.plannedSessions} onChange={(e) => set("plannedSessions", Number(e.target.value))} aria-label="Planned sessions" />
      <Input className="h-8 text-xs" type="number" min={1} max={12} value={v.semester} onChange={(e) => set("semester", Number(e.target.value))} aria-label="Semester" />
      <Select className="h-8 text-xs sm:col-span-3" value={v.schemeId} onChange={(e) => set("schemeId", e.target.value)} aria-label="Evaluation scheme">
        {schemes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
      <Select className="h-8 text-xs sm:col-span-3" value={v.facultyId ?? ""} onChange={(e) => set("facultyId", e.target.value || null)} aria-label="Teacher">
        <option value="">Teacher: unassigned</option>
        {faculty.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </Select>
      <div className="flex justify-end gap-1 sm:col-span-2">
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveCourseAction(curriculumId, v);
              if (r.error) return void toast.error(r.error);
              toast.success(v.id ? `${v.code} updated` : `${v.code.toUpperCase()} added`);
              onDone();
            })
          }
        >
          Save
        </Button>
      </div>
    </div>
  );
}

export function DraftCourseActions(props: { curriculumId: string; course: CourseValues & { id: string }; schemes: Option[]; faculty: Option[]; categories: string[] }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  if (editing)
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
        <div className="w-full max-w-4xl rounded-xl bg-white p-4 shadow-xl">
          <div className="mb-2 text-sm font-medium">Edit {props.course.code}</div>
          <CourseForm {...props} initial={props.course} onDone={() => setEditing(false)} />
        </div>
      </div>
    );
  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label={`Edit ${props.course.code}`}><Pencil className="h-3.5 w-3.5" /></Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        aria-label={`Remove ${props.course.code}`}
        onClick={() => {
          if (!window.confirm(`Remove ${props.course.code} from the draft?`)) return;
          start(async () => {
            const r = await deleteCourseAction(props.course.id);
            if (r.error) toast.error(r.error);
            else toast.success(`${props.course.code} removed`);
          });
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function AddCourse(props: { curriculumId: string; semester: number; schemes: Option[]; faculty: Option[]; categories: string[]; credits: number }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Add course to semester {props.semester}
      </Button>
    );
  return (
    <CourseForm
      {...props}
      initial={{ code: "", title: "", semester: props.semester, credits: props.credits, category: "CORE", schemeId: props.schemes[0]?.id ?? "", plannedSessions: 52, facultyId: null }}
      onDone={() => setOpen(false)}
    />
  );
}

export function CloneForm({ sourceId, suggestion }: { sourceId: string; suggestion: { code: string; name: string; effectiveFrom: number } }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(suggestion);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open)
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <CopyPlus className="h-4 w-4" /> Start a revision
      </Button>
    );
  return (
    <div className="grid w-full gap-2 rounded-lg border border-border bg-white p-3 sm:grid-cols-4">
      <div className="space-y-1">
        <Label htmlFor="cl-code">New code</Label>
        <Input id="cl-code" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="cl-name">Name</Label>
        <Input id="cl-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="cl-from">Effective from (admission year)</Label>
        <Input id="cl-from" type="number" value={v.effectiveFrom} onChange={(e) => setV({ ...v, effectiveFrom: Number(e.target.value) })} />
      </div>
      <div className="flex justify-end gap-2 sm:col-span-4">
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await cloneCurriculumAction(sourceId, v);
              if (r.error) return void toast.error(r.error);
              toast.success("Draft created — every course copied; edit it before approval");
              if ("id" in r) router.push(`/academics/curricula/${r.id}`);
            })
          }
        >
          Create draft
        </Button>
      </div>
    </div>
  );
}

export function ApproveForm({ curriculumId }: { curriculumId: string }) {
  const [ref, setRef] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input className="h-9 w-80" placeholder="Academic Council resolution, e.g. AC/2026/52 dated 05.11.2026" value={ref} onChange={(e) => setRef(e.target.value)} aria-label="Academic Council resolution" />
      <Button
        variant="success"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await approveCurriculumAction(curriculumId, ref);
            if (r.error) toast.error(r.error);
            else toast.success("Curriculum approved — it now applies to batches admitted from the effective year");
          })
        }
      >
        <Stamp className="h-4 w-4" /> Record approval
      </Button>
    </div>
  );
}
