"use client";

import dynamic from "next/dynamic";

export const RockCanvasDynamic = dynamic(
  () => import("@/components/rock-canvas").then((mod) => mod.RockCanvas),
  { ssr: false }
);
