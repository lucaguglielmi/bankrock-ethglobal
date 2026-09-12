import Link from "next/link";
import { AnimatedText } from "@/components/animated-text";
import { RockCanvasDynamic } from "@/components/rock-canvas-dynamic";
import { ArrowRight } from "lucide-react";
import { NewsletterSignup } from "@/components/newsletter-signup";
import { StoryCarousel } from "@/components/story-carousel";
import { HowItWorksDynamic } from "@/components/how-it-works-dynamic";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col bg-white text-ink selection:bg-black selection:text-white">
      {/* Hero Section — pulled up by its own height to sit under the transparent header (spec 17 §4.2) */}
      <section className="relative -mx-[var(--gutter)] -mt-[calc(var(--header-h)+var(--safe-top))] flex min-h-dvh flex-col items-center justify-center overflow-hidden px-[var(--gutter)]">
        {/* 3D Canvas Background */}
        <div className="pointer-events-auto absolute inset-0 z-0 mix-blend-multiply opacity-80">
          <RockCanvasDynamic />
        </div>

        <div className="pointer-events-none relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center pt-[calc(var(--header-h)+var(--safe-top))] text-center">
          <AnimatedText text="Tangible DeFi." className="mb-8 text-display font-extrabold text-ink" />

          <p className="mb-12 max-w-prose text-lead text-ink-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-1000 motion-safe:delay-500 motion-safe:fill-mode-forwards">
            A physical interface to your self-custodial liquidity. Tap your Bank Rock to put idle capital into agentic
            trading strategies that earn a share of the trading fees they generate.
          </p>

          <div className="flex w-full flex-col gap-4 pointer-events-auto motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-1000 motion-safe:delay-700 motion-safe:fill-mode-forwards sm:w-auto sm:flex-row">
            <Button size="lg" className="w-full sm:w-auto" render={<Link href="/shop" />}>
              Get your Rock
              <ArrowRight className="size-5" aria-hidden />
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto" render={<Link href="#how-it-works" />}>
              See how it works
            </Button>
          </div>
        </div>
      </section>

      <StoryCarousel />

      {/* How It Works Section */}
      <HowItWorksDynamic />

      {/* Newsletter Signup */}
      <NewsletterSignup />

      {/* Footer */}
      <footer className="relative z-10 -mx-[var(--gutter)] w-auto bg-black px-[var(--gutter)] py-16 text-white sm:py-24">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div className="text-h1 font-extrabold">Bank Rock</div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-medium">
            <Link href="/mcp" className="inline-flex h-11 items-center text-white/70 motion-safe:transition-colors hover:text-white">
              AI Oracle
            </Link>
            <Link href="/shop" className="inline-flex h-11 items-center text-white/70 motion-safe:transition-colors hover:text-white">
              Shop
            </Link>
            <Link href="/terms" className="inline-flex h-11 items-center text-white/70 motion-safe:transition-colors hover:text-white">
              Terms
            </Link>
            <Link href="/privacy" className="inline-flex h-11 items-center text-white/70 motion-safe:transition-colors hover:text-white">
              Privacy
            </Link>
            <Link
              href="https://github.com/lucaguglielmi/bankrock-ethglobal"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center text-white/70 motion-safe:transition-colors hover:text-white"
            >
              GitHub
            </Link>
          </div>
        </div>
      </footer>

    </main>
  );
}
