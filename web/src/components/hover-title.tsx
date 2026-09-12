"use client";
import React from 'react';

export function HoverTitle({ children }: { children: React.ReactNode }) {
  return (
    <div 
      id="hero-title"
      className="pointer-events-auto cursor-default"
      onMouseEnter={() => window.dispatchEvent(new Event('rock-hover-enter'))}
      onMouseLeave={() => window.dispatchEvent(new Event('rock-hover-leave'))}
    >
      {children}
    </div>
  );
}
