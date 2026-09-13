"use client";

import { motion } from "framer-motion";

export function AquaArchitectureDiagram() {
  return (
    <div className="flex size-full items-center justify-center bg-transparent p-6">
      <div className="relative aspect-square w-full max-w-[320px]">
        <svg viewBox="0 0 320 320" className="size-full overflow-visible font-sans">
          <defs>
            <radialGradient id="account-gradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#262626" />
              <stop offset="100%" stopColor="#0a0a0a" />
            </radialGradient>
            
            {/* Arrowhead for Push (Inward) */}
            <marker id="arrow-push" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto-start-reverse">
              <path d="M 0 1 L 8 5 L 0 9 z" className="fill-ink" />
            </marker>
            
            {/* Arrowhead for Pull (Outward) */}
            <marker id="arrow-pull" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto-start-reverse">
              <path d="M 0 1 L 8 5 L 0 9 z" className="fill-ink" />
            </marker>
          </defs>

          {/* Outer Boundary (Ship / Dock) */}
          <circle
            cx="160"
            cy="160"
            r="120"
            className="fill-transparent stroke-border stroke-[1.5]"
          />
          <text x="160" y="28" className="text-sm font-semibold fill-ink-2" textAnchor="middle">
            Ship / Dock
          </text>

          {/* PUSH Arrows (Flowing IN to the center) */}
          <g>
            <motion.path
              d="M 65,100 L 95,123"
              className="stroke-ink stroke-2"
              markerEnd="url(#arrow-push)"
              animate={{ opacity: [0.1, 1, 0.1] }}
              transition={{ duration: 2, repeat: Infinity, delay: 0 }}
            />
            <text x="45" y="95" className="text-sm font-medium fill-ink" textAnchor="middle">Push</text>

            <motion.path
              d="M 40,160 L 85,160"
              className="stroke-ink stroke-2"
              markerEnd="url(#arrow-push)"
              animate={{ opacity: [0.1, 1, 0.1] }}
              transition={{ duration: 2, repeat: Infinity, delay: 0.6 }}
            />
            <text x="25" y="155" className="text-sm font-medium fill-ink" textAnchor="middle">Push</text>

            <motion.path
              d="M 65,220 L 95,197"
              className="stroke-ink stroke-2"
              markerEnd="url(#arrow-push)"
              animate={{ opacity: [0.1, 1, 0.1] }}
              transition={{ duration: 2, repeat: Infinity, delay: 1.2 }}
            />
            <text x="45" y="235" className="text-sm font-medium fill-ink" textAnchor="middle">Push</text>
          </g>

          {/* PULL Arrows (Flowing OUT from the center) */}
          <g>
            <motion.path
              d="M 225,123 L 255,100"
              className="stroke-ink stroke-2"
              markerEnd="url(#arrow-pull)"
              animate={{ opacity: [0.1, 1, 0.1] }}
              transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
            />
            <text x="275" y="95" className="text-sm font-medium fill-ink" textAnchor="middle">Pull</text>

            <motion.path
              d="M 235,160 L 280,160"
              className="stroke-ink stroke-2"
              markerEnd="url(#arrow-pull)"
              animate={{ opacity: [0.1, 1, 0.1] }}
              transition={{ duration: 2, repeat: Infinity, delay: 0.9 }}
            />
            <text x="295" y="155" className="text-sm font-medium fill-ink" textAnchor="middle">Pull</text>

            <motion.path
              d="M 225,197 L 255,220"
              className="stroke-ink stroke-2"
              markerEnd="url(#arrow-pull)"
              animate={{ opacity: [0.1, 1, 0.1] }}
              transition={{ duration: 2, repeat: Infinity, delay: 1.5 }}
            />
            <text x="275" y="235" className="text-sm font-medium fill-ink" textAnchor="middle">Pull</text>
          </g>

          {/* Central Smart Account */}
          <motion.circle
            cx="160"
            cy="160"
            r="60"
            fill="url(#account-gradient)"
            className="shadow-2xl"
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
          <text x="160" y="156" className="text-sm font-semibold fill-white" textAnchor="middle">
            ERC-4337
          </text>
          <text x="160" y="174" className="text-sm font-semibold fill-white" textAnchor="middle">
            Smart Account
          </text>
        </svg>
      </div>
    </div>
  );
}
