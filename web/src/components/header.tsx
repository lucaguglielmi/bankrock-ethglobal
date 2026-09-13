"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, Volume2, VolumeX } from "lucide-react";
import { useAudio } from "@/context/audio-context";
import { useAuth } from "@/context/auth-context";
import { truncateMiddle } from "@/lib/ui/format";
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

/** The funded live rock on Sepolia. Rock 1 is retired; this is the only in-app path to a real rock page. */
const LIVE_ROCK_LINK = { href: "/rock/3", label: "Live rock" } as const;

/**
 * Fixed site header (spec 17 §4.3, L-2, L-3). Below `md` the nav links
 * collapse into a `Sheet`; from `md` up they render inline as before. The
 * `Live rock` entry is always present and points at the funded live rock;
 * it reads as active on every `/rock/*` page.
 */
export function Header() {
  const pathname = usePathname();
  const { isMuted, toggleMute } = useAudio();
  const auth = useAuth();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);

  const isLinkActive = (href: string) => pathname === href;
  const isRockActive = pathname.startsWith("/rock");

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
          <Link
            href={LIVE_ROCK_LINK.href}
            className={cn(
              "flex items-center gap-1 text-sm motion-safe:transition-colors",
              isRockActive
                ? "border-b border-ink pb-0.5 font-semibold text-ink"
                : "font-medium text-ink-3 hover:text-ink"
            )}
          >
            {LIVE_ROCK_LINK.label}
            <ArrowRight className="size-3.5" />
          </Link>
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
          {/* Account first: "Sign in / Register" when signed out, "Log out" when signed in. The
              same `login` / `logout` the header button uses; nothing here fabricates a state
              (an unavailable sign-in shows its reason, never a button that would fail). */}
          {auth.ready && auth.unavailable ? (
            <p className="flex min-h-12 items-center text-base font-medium text-ink-3">
              {auth.unavailableReason ?? "Sign-in is not configured."}
            </p>
          ) : auth.ready && auth.authenticated ? (
            <button
              type="button"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                try {
                  await auth.logout();
                } finally {
                  setSigningOut(false);
                  setMenuOpen(false);
                }
              }}
              className="flex h-12 items-center justify-between text-left text-base font-medium text-ink-2"
            >
              <span>{signingOut ? "Logging out…" : "Log out"}</span>
              {auth.address ? (
                <span className="font-mono text-label text-ink-3">{truncateMiddle(auth.address)}</span>
              ) : null}
            </button>
          ) : auth.ready ? (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                void auth.login();
              }}
              className="flex h-12 items-center text-left text-base font-semibold text-ink"
            >
              Sign in / Register
            </button>
          ) : null}
          <div className="my-1 border-t border-border" />

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
          <Link
            href={LIVE_ROCK_LINK.href}
            onClick={() => setMenuOpen(false)}
            className={cn(
              "flex h-12 items-center gap-1.5 text-base",
              isRockActive ? "font-semibold text-ink" : "font-medium text-ink-2"
            )}
          >
            {LIVE_ROCK_LINK.label}
            <ArrowRight className="size-4" />
          </Link>

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
