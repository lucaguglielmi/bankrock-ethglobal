import * as React from "react";
import { Github } from "lucide-react";

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <footer className="w-full bg-white pb-[calc(var(--dock-h,80px)+3rem)] pt-24 text-center flex justify-center">
        <a 
          href="https://github.com/lucaguglielmi/bankrock-ethglobal" 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-full border border-border bg-white px-5 py-2.5 text-sm font-semibold text-ink-3 hover:bg-neutral-50 hover:text-ink transition-colors shadow-sm"
        >
          <Github className="size-4" />
          <span>View project on GitHub</span>
        </a>
      </footer>
    </>
  );
}
