import * as React from "react";
import { HelpTerm } from "@/components/ui/popover";
import { Info } from "lucide-react";
import Link from "next/link";

export interface TooltipLinkProps {
  term: string;
  description: string;
  href?: string;
}

export function TooltipLink({ term, description, href }: TooltipLinkProps) {
  return (
    <HelpTerm
      className="cursor-help font-semibold text-ink hover:text-ink-2 transition-colors"
      term={
        <span className="inline-flex items-center gap-1">
          {term}
          <Info className="size-3 text-ink-3" aria-hidden />
        </span>
      }
    >
      <div className="flex flex-col gap-2">
        <span className="text-sm">{description}</span>
        {href && (
          <Link
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink font-semibold underline underline-offset-2 hover:opacity-70"
          >
            Read the docs
          </Link>
        )}
      </div>
    </HelpTerm>
  );
}
