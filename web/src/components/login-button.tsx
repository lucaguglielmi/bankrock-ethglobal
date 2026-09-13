"use client";

import * as React from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Address } from "@/components/ui/address";
import { HelpTerm } from "@/components/ui/popover";
import { truncateMiddle } from "@/lib/ui/format";
import { explorer } from "@/lib/chain";
import { MyAddressQr } from "@/components/my-address-qr";
import { TapRockAnimation } from "@/components/tap-rock-animation";
import { ArrowRight, QrCode } from "lucide-react";

/** Where the account sheet's "Demo mode" link goes. Placeholder - the real demo entry point is decided later. */
export const DEMO_MODE_HREF = "/rock/420";

/**
 * The header auth control (spec 17 §4.3). Signed out: a `Connect` button.
 * Unavailable (spec 15 A-1/A-2 removed the fabricated wallet - sign-in can
 * genuinely be unconfigured): a muted, non-interactive-looking chip with a
 * `HelpTerm` naming the reason. Signed in: one 44 px chip that opens the
 * account `Sheet` - nothing else lives in the header.
 */
export function LoginButton() {
  const {
    ready,
    authenticated,
    login,
    logout,
    address,
    unavailable,
    unavailableReason,
  } = useAuth();
  const [accountOpen, setAccountOpen] = React.useState(false);
  const [loggingOut, setLoggingOut] = React.useState(false);
  // "Gift the rock to someone" (B1, Flow E): the code is collapsed by default so the account
  // sheet stays one screen, and reset whenever the sheet closes so it never reopens showing a
  // code nobody asked for.
  const [showCode, setShowCode] = React.useState(false);

  const closeAccount = () => {
    setAccountOpen(false);
    setShowCode(false);
  };

  if (!ready) {
    return (
      <Button size="default" disabled>
        Loading…
      </Button>
    );
  }

  if (unavailable) {
    return (
      <HelpTerm
        term={
          <span className="inline-flex h-11 items-center rounded-full border border-border bg-muted px-4 text-sm font-medium text-ink-3">
            Sign-in unavailable
          </span>
        }
      >
        {unavailableReason ?? "Sign-in is not configured."}
      </HelpTerm>
    );
  }

  if (authenticated && address) {
    const handleLogout = async () => {
      setLoggingOut(true);
      try {
        await logout();
        closeAccount();
      } finally {
        setLoggingOut(false);
      }
    };

    return (
      <>
        <button
          type="button"
          onClick={() => setAccountOpen(true)}
          className="inline-flex h-11 items-center rounded-full border border-border bg-muted px-4 font-mono text-caption text-ink-2 hover:bg-muted/70 hover:text-ink motion-safe:transition-colors"
        >
          {truncateMiddle(address)}
        </button>

        <Sheet
          open={accountOpen}
          onOpenChange={(open) => {
            setAccountOpen(open);
            if (!open) setShowCode(false);
          }}
          title="Account"
          footer={
            <Button
              size="default"
              variant="outline"
              className="w-full"
              onClick={handleLogout}
              disabled={loggingOut}
            >
              Log out
            </Button>
          }
        >
          <div className="flex flex-col gap-6 py-4">
            {/* Wallet and network, compact: the address with copy + explorer, the chain as a quiet chip. */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <Address value={address} explorerHref={explorer.address(address)} />
              <span className="inline-flex items-center rounded-full border border-border px-2.5 py-1 text-caption text-ink-3">
                Ethereum Sepolia
              </span>
            </div>

            {/* The invitation to tap (Flow A). Pure CSS motion; static under reduced motion. */}
            <TapRockAnimation />

            <div className="flex flex-col items-center gap-3">
              {/*
                Receiving a rock (Flow E): show a code the giver's own camera can read, instead of
                getting 42 characters from this phone into theirs. `MyAddressQr` builds the link
                from the page it is opened on, so from a rock page it points back at that rock.
              */}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-11 rounded-full px-4"
                aria-expanded={showCode}
                onClick={() => setShowCode((open) => !open)}
              >
                <QrCode aria-hidden />
                {showCode ? "Hide code" : "Gift the rock to someone"}
              </Button>
              {showCode ? <MyAddressQr address={address} className="mt-1" /> : null}

              {/* A quiet link, not a button: it only navigates. Closing the sheet first so it is
                  not left open over the destination. */}
              <Link
                href={DEMO_MODE_HREF}
                onClick={closeAccount}
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink hover:text-ink-2 motion-safe:transition-colors"
              >
                Demo mode
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
          </div>
        </Sheet>
      </>
    );
  }

  return (
    <Button size="default" onClick={() => login()}>
      Connect
    </Button>
  );
}
