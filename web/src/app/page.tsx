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
            A rock with an NFC chip that holds a yield-bearing liquidity position with automatic rebalancing.
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

      <section className="mx-auto w-full max-w-7xl px-[var(--gutter)] py-24 flex flex-col gap-32">
        {/* The 3 Learn Pages */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-16">
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-bold tracking-tight">The physical object</h2>
            <p className="text-ink-2 leading-relaxed">How it&apos;s made, the NFC activation flow, and true ownership mechanics.</p>
            <Link href="/learn/rock" className="inline-flex items-center gap-1.5 font-semibold hover:opacity-70 transition-opacity">Learn more <ArrowRight className="size-4" /></Link>
          </div>
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-bold tracking-tight">DeFi & Aqua</h2>
            <p className="text-ink-2 leading-relaxed">The smart account architecture and shared liquidity powering Bank Rock.</p>
            <Link href="/learn/defi" className="inline-flex items-center gap-1.5 font-semibold hover:opacity-70 transition-opacity">Learn more <ArrowRight className="size-4" /></Link>
          </div>
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-bold tracking-tight">Security & Privacy</h2>
            <p className="text-ink-2 leading-relaxed">Self-custody, telemetry, and keeping the physical-to-digital bridge safe.</p>
            <Link href="/learn/security" className="inline-flex items-center gap-1.5 font-semibold hover:opacity-70 transition-opacity">Learn more <ArrowRight className="size-4" /></Link>
          </div>
        </div>

        {/* MCP Terminal Section */}
        <div className="w-full flex flex-col items-center py-20 border-y border-black/5">
          <div className="flex items-center gap-2 text-ink-3 mb-4 font-mono text-label font-medium uppercase tracking-widest">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
            <span>MCP Endpoint</span>
          </div>
          <div className="bg-black text-white px-6 py-4 rounded-xl shadow-2xl flex items-center justify-between gap-6 w-full max-w-2xl font-mono">
            <code className="text-sm truncate opacity-90">npx -y @bankrock/mcp-server</code>
            <div className="flex items-center gap-4 shrink-0">
              <button className="hover:text-white/70 transition-colors" title="Copy prompt">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              </button>
              <Link href="/mcp" className="text-sm border border-white/20 hover:bg-white/10 px-4 py-2 rounded-lg transition-colors font-sans font-medium">
                Docs
              </Link>
            </div>
          </div>
        </div>
      </section>

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
