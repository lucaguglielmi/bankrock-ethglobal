"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, Volume2, VolumeX } from "lucide-react";
import { useAudio } from "@/context/audio-context";
import { isDemoMode } from "@/lib/demo";
import { LoginButton } from "@/components/login-button";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/ui/cn";

const NAV_LINKS = [
  { href: "/shop", label: "Shop" },
] as const;

/** The explainer pages, grouped under one heading in the phone menu. */
const HOW_IT_WORKS_LINKS = [
  { href: "/learn/rock", label: "The physical" },
  { href: "/learn/defi", label: "The DeFi position" },
  { href: "/learn/security", label: "Security" },
] as const;

const MCP_LINK = { href: "/mcp", label: "MCP endpoint" } as const;

/**
 * Fixed site header (spec 17 §4.3, L-2, L-3). Below `md` the nav links
 * collapse into a `Sheet`; from `md` up they render inline as before. The
 * `Live Demo` entry only exists while NEXT_PUBLIC_DEMO_MODE is on (spec 15
 * D-013).
 */
export function Header() {
  const pathname = usePathname();
  const { isMuted, toggleMute } = useAudio();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const demoMode = isDemoMode();

  const isLinkActive = (href: string) => pathname === href;
  const isLiveDemoActive = pathname.startsWith("/rock");

  const soundLabel = isMuted ? "Unmute sounds" : "Mute sounds";

  return (
    <header
      className="fixed inset-x-0 top-0 border-b border-black/5 bg-white/70 pt-[var(--safe-top)] backdrop-blur-md"
      style={{ height: "var(--header-h)", zIndex: "var(--z-header)" }}
    >
      <nav aria-label="Main navigation" className="flex h-[calc(var(--header-h)-var(--safe-top))] items-center justify-between px-[var(--gutter)]">
        <Link href="/" aria-label="Bank Rock home" className="min-w-0 shrink hover:opacity-70 motion-safe:transition-opacity">
          <Image
            src="/brand/logo-animated.svg"
            alt="Bank Rock"
            width={951}
            height={226}
            unoptimized
            loading="eager"
            className="block h-auto w-28 sm:w-36 lg:w-48"
          />
        </Link>

        {/* >= md: inline links, sound, auth */}
        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm motion-safe:transition-opacity",
                isLinkActive(link.href)
                  ? "border-b border-ink pb-0.5 font-semibold text-ink"
                  : "font-medium text-ink-2 hover:opacity-70"
              )}
            >
              {link.label}
            </Link>
          ))}
          {demoMode ? (
            <Link
              href="/rock/1"
              className={cn(
                "flex items-center gap-1 text-sm motion-safe:transition-colors",
                isLiveDemoActive
                  ? "border-b border-ink pb-0.5 font-semibold text-ink"
                  : "font-medium text-ink-3 hover:text-ink"
              )}
            >
              Live Demo
              <ArrowRight className="size-3.5" />
            </Link>
          ) : null}
          <IconButton aria-label={soundLabel} onClick={toggleMute}>
            {isMuted ? <VolumeX /> : <Volume2 />}
          </IconButton>
          <LoginButton />
        </div>

        {/* < md: sound, auth, menu */}
        <div className="flex items-center gap-1 md:hidden">
          <IconButton aria-label={soundLabel} onClick={toggleMute}>
            {isMuted ? <VolumeX /> : <Volume2 />}
          </IconButton>
          <LoginButton />
          <IconButton aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            <Menu />
          </IconButton>
        </div>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="Menu">
        <nav className="flex flex-col py-2">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={cn(
                "flex h-12 items-center text-base",
                isLinkActive(link.href) ? "font-semibold text-ink" : "font-medium text-ink-2"
              )}
            >
              {link.label}
            </Link>
          ))}
          {demoMode ? (
            <Link
              href="/rock/1"
              onClick={() => setMenuOpen(false)}
              className={cn(
                "flex h-12 items-center gap-1.5 text-base",
                isLiveDemoActive ? "font-semibold text-ink" : "font-medium text-ink-2"
              )}
            >
              Live Demo
              <ArrowRight className="size-4" />
            </Link>
          ) : null}

          <p className="mt-3 flex h-10 items-center text-label font-semibold uppercase tracking-wide text-ink-3">
            How does it work
          </p>
          {HOW_IT_WORKS_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={cn(
                "flex h-12 items-center pl-3 text-base",
                isLinkActive(link.href) ? "font-semibold text-ink" : "font-medium text-ink-2"
              )}
            >
              {link.label}
            </Link>
          ))}

          <Link
            href={MCP_LINK.href}
            onClick={() => setMenuOpen(false)}
            className={cn(
              "mt-3 flex h-12 items-center text-base",
              isLinkActive(MCP_LINK.href) ? "font-semibold text-ink" : "font-medium text-ink-2"
            )}
          >
            {MCP_LINK.label}
          </Link>
        </nav>
      </Sheet>
    </header>
  );
}
