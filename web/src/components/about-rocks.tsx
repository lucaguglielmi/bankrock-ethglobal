"use client";

/**
 * "More about the rocks" — the photo sheet on the landing page (spec 17 §4.4, L-5).
 *
 * Was a hand-rolled overlay with no Escape handler that locked page scroll by writing to the
 * body's inline style (L-14). It is now a `Sheet` at `size="lg"`; Escape, the backdrop and the
 * scroll lock come from the primitive.
 */

import * as React from "react";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const ROCK_PHOTOS = [1, 2, 3, 4, 5];

export function AboutRocks() {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="default"
        onClick={() => setIsOpen(true)}
        className="mt-8 px-0 text-base font-semibold text-ink hover:bg-transparent hover:text-link"
      >
        More about the rocks
        <ArrowRight aria-hidden />
      </Button>

      <Sheet
        open={isOpen}
        onOpenChange={setIsOpen}
        title="The physical bearer"
        size="lg"
        footer={
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => setIsOpen(false)}
          >
            Close
          </Button>
        }
      >
        <SheetBody className="flex flex-col gap-6">
          <p className="max-w-prose text-base text-ink-2">
            These are ordinary rocks, picked out of the riverbeds near Florence, then polished and
            sorted. The best ones get an NFC chip and a splash of coloured resin over it, which
            turns them into something you can hand to another person.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ROCK_PHOTOS.map((num) => (
              <div
                key={num}
                className="relative aspect-square max-w-full overflow-hidden rounded-2xl border border-border"
              >
                <Image
                  src={`/rocks/rock${num}.jpg`}
                  alt={`Bank Rock ${num}`}
                  fill
                  className="object-cover motion-safe:transition-transform motion-safe:duration-500 hover:scale-105"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>
            ))}
          </div>
        </SheetBody>
      </Sheet>
    </>
  );
}
