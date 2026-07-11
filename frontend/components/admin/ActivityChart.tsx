"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ActivityPoint {
  date: string;
  messages: number;
  calls?: number;
}

interface ActivityChartProps {
  data: ActivityPoint[];
  messagesLabel: string;
}

export function ActivityChart({ data, messagesLabel }: ActivityChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    label: d.date.slice(5),
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.4} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="text-muted-foreground" width={32} />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.5rem",
              fontSize: "12px",
            }}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
            formatter={(value) => [value, messagesLabel]}
          />
          <Bar dataKey="messages" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
