"use client";

import * as React from "react";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Address } from "@/components/ui/address";
import { HelpTerm } from "@/components/ui/popover";
import { truncateMiddle } from "@/lib/ui/format";
import { explorer } from "@/lib/chain";
import { MyAddressQr } from "@/components/my-address-qr";
import { QrCode } from "lucide-react";

/**
 * The header auth control (spec 17 §4.3). Signed out: a `Connect` button.
 * Unavailable (spec 15 A-1/A-2 removed the fabricated wallet — sign-in can
 * genuinely be unconfigured): a muted, non-interactive-looking chip with a
 * `HelpTerm` naming the reason. Signed in: one 44 px chip that opens the
 * account `Sheet` — nothing else lives in the header.
 */
export function LoginButton() {
  const {
    ready,
    authenticated,
    login,
    logout,
    address,
    isEmbedded,
    lastLoginMethod,
    unavailable,
    unavailableReason,
  } = useAuth();
  const [accountOpen, setAccountOpen] = React.useState(false);
  const [loggingOut, setLoggingOut] = React.useState(false);
  // "My address" (B1): collapsed by default so the account sheet stays one screen, and reset
  // whenever the sheet closes so it never reopens showing a code nobody asked for.
  const [showCode, setShowCode] = React.useState(false);

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
        setAccountOpen(false);
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
          <div className="flex flex-col gap-5 py-4">
            <div>
              <p className="text-label uppercase text-ink-3">Address</p>
              <Address value={address} explorerHref={explorer.address(address)} className="mt-1" />
            </div>

            {/*
              Receiving a rock (Flow E): show a code the giver's own camera can read, instead of
              getting 42 characters from this phone into theirs. `MyAddressQr` builds the link
              from the page it is opened on, so from a rock page it points back at that rock.
            */}
            <div>
              <Button
                type="button"
                size="default"
                variant={showCode ? "default" : "outline"}
                className="w-full"
                aria-expanded={showCode}
                onClick={() => setShowCode((open) => !open)}
              >
                <QrCode aria-hidden />
                {showCode ? "Hide my code" : "Show my code to receive a rock"}
              </Button>
              {showCode ? <MyAddressQr address={address} className="mt-4" /> : null}
            </div>
            <div>
              <p className="text-label uppercase text-ink-3">Network</p>
              <p className="mt-1 text-base text-ink">Ethereum Sepolia</p>
            </div>
            <div>
              <p className="text-label uppercase text-ink-3">Wallet type</p>
              <p className="mt-1 text-base text-ink">{isEmbedded ? "Embedded" : "External"}</p>
            </div>
            {lastLoginMethod ? (
              <p className="text-sm text-ink-2">
                Last signed in with{" "}
                <span className="font-medium capitalize text-ink">{lastLoginMethod}</span>
              </p>
            ) : null}
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
