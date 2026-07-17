"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Brass-led monochrome palette (see globals.css --chart-1..5). chart-1 is
// brass, the rest step through ink and grays so the set never reads rainbow.
const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

// Detects prefers-reduced-motion so chart entrance animations can be opted
// out of (accessibility requirement). Guarded so it never sets state to an
// unchanged value.
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced((prev) => (prev === mq.matches ? prev : mq.matches));
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

interface TooltipEntry {
  name?: string | number;
  value?: string | number;
  color?: string;
  payload?: { fill?: string };
}

function ChartTooltip({
  active,
  payload,
  label,
  prefix = "",
  suffix = "",
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  prefix?: string;
  suffix?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      {label != null && label !== "" && (
        <p className="mb-1 font-medium text-foreground">{label}</p>
      )}
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-1.5 text-muted-foreground">
          <span
            aria-hidden
            className="inline-block size-2 rounded-full"
            style={{ backgroundColor: entry.color ?? entry.payload?.fill }}
          />
          <span>{entry.name}</span>
          <span className="ml-auto pl-3 font-mono tabular-nums text-foreground">
            {prefix}
            {entry.value}
            {suffix}
          </span>
        </p>
      ))}
    </div>
  );
}

export function VolumeChart({
  data,
  summary,
}: {
  data: Array<{ label: string; calls: number }>;
  summary: string;
}) {
  const reduced = useReducedMotion();
  return (
    <div>
      <div role="img" aria-label={summary} style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="var(--muted-foreground)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="var(--muted-foreground)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={34}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.4 }}
              content={<ChartTooltip suffix=" calls" />}
            />
            <Bar
              dataKey="calls"
              name="Calls"
              fill="var(--chart-1)"
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
              isAnimationActive={!reduced}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <span aria-hidden className="inline-block size-2.5 rounded-sm bg-[var(--chart-1)]" />
        Calls per period
      </div>
      {/* Visually-hidden table alternative for screen readers.
          The wrapper carries `sr-only`: a bare `display: table` element treats
          the 1px width as a minimum and auto-expands to its content width,
          which overflows the page. A block wrapper clips it correctly. */}
      <div className="sr-only">
        <table>
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th>Period</th>
              <th>Calls</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <td>{d.label}</td>
                <td>{d.calls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function IntentChart({
  data,
}: {
  data: Array<{ intent: string; percentage: number }>;
}) {
  const reduced = useReducedMotion();
  const summary = `Caller intent distribution: ${data
    .map((d) => `${d.intent} ${d.percentage} percent`)
    .join(", ")}.`;
  return (
    <div>
      <div role="img" aria-label={summary} style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              unit="%"
              stroke="var(--muted-foreground)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="intent"
              width={130}
              stroke="var(--muted-foreground)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.4 }}
              content={<ChartTooltip suffix="%" />}
            />
            <Bar dataKey="percentage" name="Share" radius={[0, 4, 4, 0]} isAnimationActive={!reduced}>
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Legend near the chart */}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {data.map((d, i) => (
          <li key={d.intent} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-sm"
              style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
            />
            {d.intent}
          </li>
        ))}
      </ul>
      {/* `sr-only` lives on the wrapper, not the table: see VolumeChart. */}
      <div className="sr-only">
        <table>
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th>Intent</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.intent}>
                <td>{d.intent}</td>
                <td>{d.percentage}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}

export function CostDonut({
  telephony,
  aiProcessing,
  total,
}: {
  telephony: number;
  aiProcessing: number;
  total: number;
}) {
  const reduced = useReducedMotion();
  const slices = [
    { name: "Telephony", value: Number(telephony.toFixed(2)) },
    { name: "AI Processing", value: Number(aiProcessing.toFixed(2)) },
  ];
  const summary = `Cost split: Telephony $${telephony.toFixed(2)}, AI Processing $${aiProcessing.toFixed(2)}, total $${total.toFixed(2)}.`;
  return (
    <div className="relative" role="img" aria-label={summary} style={{ height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius={58}
            outerRadius={82}
            paddingAngle={2}
            strokeWidth={0}
            isAnimationActive={!reduced}
          >
            {slices.map((_, i) => (
              <Cell key={i} fill={PALETTE[i === 0 ? 0 : 2]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip prefix="$" />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-muted-foreground">Total</span>
        <span className="font-mono text-lg font-semibold tabular-nums">
          ${total.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
