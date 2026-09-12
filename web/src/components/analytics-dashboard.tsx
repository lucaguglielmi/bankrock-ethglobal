"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

export interface YieldDataPoint {
  date: string;
  tvl: number;
  fees: number;
  apy: number;
}

interface AnalyticsDashboardProps {
  data: YieldDataPoint[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-black/90 text-white p-3 rounded-xl text-xs font-mono border border-neutral-700/50 shadow-xl backdrop-blur-xl">
        <p className="text-neutral-400 mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }} className="font-bold">
            {entry.name}: {entry.name === "APY" ? `${entry.value.toFixed(2)}%` : `$${entry.value.toFixed(2)}`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export function AnalyticsDashboard({ data }: AnalyticsDashboardProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-neutral-400 font-mono">
        Awaiting Yield Data...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="h-64 w-full"
      >
        <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">
          Portfolio Value (TVL)
        </h4>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorTvl" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#000000" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#000000" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#A3A3A3" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#A3A3A3" }} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="tvl"
              name="TVL"
              stroke="#000000"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorTvl)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="h-48 w-full"
      >
        <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">
          Cumulative Maker Fees
        </h4>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#A3A3A3" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#A3A3A3" }} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="fees" name="Fees" fill="#16A34A" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  );
}
