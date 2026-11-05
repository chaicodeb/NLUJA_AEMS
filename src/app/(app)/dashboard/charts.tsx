"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const BRAND = "#d06d17";
const LEAF = "#2f7d3a";
const RED = "#dc2626";
const AMBER = "#d97706";
const VIOLET = "#7c3aed";
const SKY = "#0284c7";

export function AttendanceChart({ data }: { data: { band: string; count: number; tone: "red" | "amber" | "green" }[] }) {
  const color = { red: RED, amber: AMBER, green: LEAF };
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6dfd7" />
        <XAxis dataKey="band" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v) => [`${v} course registrations`, ""]} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((d) => <Cell key={d.band} fill={color[d.tone]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EligibilityPie({ data }: { data: { name: string; value: number }[] }) {
  const colors: Record<string, string> = { Eligible: LEAF, Ineligible: RED, "Pending relaxation": AMBER, Relaxed: SKY };
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
          {data.map((d) => <Cell key={d.name} fill={colors[d.name] ?? BRAND} />)}
        </Pie>
        <Tooltip />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function EvaluationProgressChart({ data }: { data: { paper: string; finalised: number; pending: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6dfd7" />
        <XAxis dataKey="paper" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={45} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="finalised" stackId="a" fill={LEAF} name="Finalised" />
        <Bar dataKey="pending" stackId="a" fill={AMBER} name="Pending" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ResultsByBatchChart({ data }: { data: { batch: string; pass: number; backlog: number; withheld: number; avgSgpa: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6dfd7" />
        <XAxis dataKey="batch" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="pass" stackId="a" fill={LEAF} name="Pass" />
        <Bar dataKey="backlog" stackId="a" fill={RED} name="Backlog" />
        <Bar dataKey="withheld" stackId="a" fill={VIOLET} name="Withheld" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
