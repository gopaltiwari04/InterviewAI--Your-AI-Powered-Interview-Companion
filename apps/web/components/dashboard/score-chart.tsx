"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface TrendPoint {
  date: string;
  overall: number | null;
  technical: number | null;
  communication: number | null;
}

export function ScoreChart({ data }: { data: TrendPoint[] }) {
  const points = data.map((d) => ({ ...d, label: new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) }));
  return (
    <div className="h-72 w-full" role="img" aria-label={`Score trend over ${data.length} evaluated interviews`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.15} />
          <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip />
          <Legend />
          <Line type="monotone" name="Overall" dataKey="overall" stroke="#4f46e5" strokeWidth={3} dot={{ r: 3 }} connectNulls />
          <Line type="monotone" name="Technical" dataKey="technical" stroke="#059669" strokeWidth={2} connectNulls />
          <Line type="monotone" name="Communication" dataKey="communication" stroke="#d97706" strokeWidth={2} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SkillChart({ data }: { data: { label: string; average: number; samples: number }[] }) {
  return (
    <div className="w-full" style={{ height: Math.max(160, data.length * 32) }} role="img" aria-label="Average score by skill">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" strokeOpacity={0.15} />
          <XAxis type="number" domain={[0, 100]} fontSize={12} />
          <YAxis type="category" dataKey="label" width={170} fontSize={12} tickLine={false} />
          <Tooltip formatter={(v) => [`${v}/100`, "Average"]} />
          <Bar dataKey="average" fill="#4f46e5" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
