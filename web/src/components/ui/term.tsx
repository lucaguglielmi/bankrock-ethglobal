"use client";

/**
 * A glossary word in running text.
 *
 * `<Term k="rockAccount" />` renders the glossary's own wording ("Rock Account") and, on a
 * pointer, a tooltip with its one-sentence definition; on touch, a tappable popover with the same
 * sentence (`HelpTerm`, spec 17 §4.4). `<Term k="rockAccount">its account</Term>` keeps the
 * sentence but shows the caller's words inline, so a definition can be attached to whatever
 * phrasing the paragraph needs.
 *
 * The text comes from `lib/ui/glossary.ts` and nowhere else, so the same word means the same
 * thing on every page.
 */

import * as React from "react";
import { HelpTerm } from "@/components/ui/popover";
import { GLOSSARY, type GlossaryKey } from "@/lib/ui/glossary";

export interface TermProps {
  /** Which glossary entry to explain. */
  k: GlossaryKey;
  /** The words shown inline. Defaults to the entry's own `term`. */
  children?: React.ReactNode;
  className?: string;
}

export function Term({ k, children, className }: TermProps) {
  const entry = GLOSSARY[k];
  return (
    <HelpTerm term={children ?? entry.term} className={className}>
      {entry.definition}
    </HelpTerm>
  );
}
