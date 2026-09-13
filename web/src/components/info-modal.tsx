"use client";

/**
 * A short explanation, opened from a landing-page link (spec 17 §4.4).
 *
 * Was a hand-rolled portal that locked page scroll by writing to the body's inline style (L-14)
 * and set its heading at 36 px with display-grade negative tracking (T-7). It is now a `Sheet`:
 * Escape, the backdrop, focus handling and the scroll lock all come from the primitive.
 *
 * `content` accepts nodes, not only a string, so a caller can wrap the unfamiliar words in a
 * glossary `Term` and keep the sheet to one plain paragraph.
 */

import * as React from "react";
import { ArrowRight } from "lucide-react";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

interface InfoModalProps {
  triggerText: string;
  title: string;
  content: React.ReactNode;
}

export function InfoModal({ triggerText, title, content }: InfoModalProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="default"
        onClick={() => setIsOpen(true)}
        className="rounded-full border-white/20 bg-white/5 text-base font-semibold hover:bg-white/10 hover:text-current"
      >
        {triggerText}
        <ArrowRight aria-hidden />
      </Button>

      <Sheet
        open={isOpen}
        onOpenChange={setIsOpen}
        title={title}
        footer={
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => setIsOpen(false)}
          >
            Got it
          </Button>
        }
      >
        <SheetBody>
          {typeof content === "string" ? (
            <p className="max-w-prose text-base text-ink-2">{content}</p>
          ) : (
            <div className="flex max-w-prose flex-col gap-4 text-base text-ink-2">{content}</div>
          )}
        </SheetBody>
      </Sheet>
    </>
  );
}
