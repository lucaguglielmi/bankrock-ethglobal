"use client";

/**
 * Charts for a rock's recorded history (spec 17 L-11, Part 5 "Admin").
 *
 * Fixes: the heading no longer sits inside the `h-64` box that the chart tries to fill, so the
 * chart stops overflowing; ticks are 13 px (the `text-caption` size) rather than 10 px; the x
 * axis keeps its first and last label instead of dropping them at phone width; and an empty
 * series renders an honest empty state instead of the words "Awaiting Yield Data".
 *
 * There is no yield-rate series here and there will not be one: decision D-004 forbids the claim
 * regardless of data quality (spec 15 N-3).
 */

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { UnavailableState } from "@/components/ui/unavailable-state";

export interface YieldDataPoint {
  date: string;
  /** Reserve value in USDC at the snapshot. */
  tvl: number;
  /** Fees recorded for that day, in USDC. */
  fees: number;
}

export interface AnalyticsDashboardProps {
  data: YieldDataPoint[];
  /** Shown when there is no series at all. */
  emptyReason?: string;
}

/** 13 px — the `text-caption` size, which is the floor for anything a reader must parse. */
const TICK = { fontSize: 13, fill: "#525252" } as const;
const GRID_STROKE = "#e5e5e5";
const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: "1px solid #e5e5e5",
  fontSize: 13,
  color: "#404040",
} as const;

const usdc = (value: number) => `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function AnalyticsDashboard({
  data,
  emptyReason = "There is no recorded history for this rock yet.",
}: AnalyticsDashboardProps) {
  if (!data || data.length === 0) {
    return <UnavailableState reason={emptyReason} />;
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h4 className="text-label text-ink-3">Reserve over time (USDC)</h4>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="reserveFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#171717" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#171717" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
              <XAxis
                dataKey="date"
                interval="preserveStartEnd"
                tick={TICK}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={TICK}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={usdc}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => usdc(Number(value))} />
              <Area
                type="monotone"
                dataKey="tvl"
                name="Reserve"
                stroke="#171717"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#reserveFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h4 className="text-label text-ink-3">Fees recorded (USDC)</h4>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
              <XAxis
                dataKey="date"
                interval="preserveStartEnd"
                tick={TICK}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={TICK}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={usdc}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => usdc(Number(value))} />
              <Bar dataKey="fees" name="Fees" fill="#15803d" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
