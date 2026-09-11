"use client";

import dynamic from "next/dynamic";

export const HowItWorksDynamic = dynamic(
  () => import("@/components/how-it-works").then((mod) => mod.HowItWorks),
  { ssr: false }
);
