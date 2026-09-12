"use client";

/**
 * "Add from any wallet, exchange or chain" — Privy universal deposit addresses (spec 20 Part 12).
 *
 * `useDepositAddress` opens Privy's own flow: the user picks the chain and asset they already
 * hold, Privy shows a deposit address for it, and whatever arrives there is bridged or swapped
 * into the destination — the user's embedded wallet, in the savings vault's asset on the vault's
 * chain — with no bridge UI, no approvals and no gas on the user's side (D-035).
 *
 * Nothing here chooses an address: the destination chain and asset are the vault's, read from
 * Privy, and the destination wallet is the one the server resolved for the signed-in user. When
 * Privy cannot open the flow the reason is one of a fixed set keyed on Privy's error code, and
 * the fallback is the plain wallet address — never a simulated deposit (D-013).
 */

import * as React from "react";
import { useDepositAddress, type DepositAddressModalErrorCode } from "@privy-io/react-auth";
import type { Address as AddressType } from "viem";
import { Address } from "@/components/ui/address";
import { Button } from "@/components/ui/button";
import type { EarnVault } from "@/lib/earn/shared";

export interface DepositAnywhereButtonProps {
  /** The embedded wallet that receives the converted funds. */
  address: AddressType;
  /** The vault whose asset and chain the deposit is converted into. */
  vault: EarnVault;
  explorerHref?: string;
  /** Fired when Privy reports the deposit complete, so the balance can be re-read. */
  onCompleted?: () => void;
}

/** Fixed sentences per Privy error code. `USER_EXITED` is silence: the user closed it. */
const REASONS: Partial<Record<DepositAddressModalErrorCode, string>> = {
  DEPOSIT_ADDRESSES_NOT_ENABLED:
    "Deposit addresses are not switched on for this app in the Privy dashboard yet",
  NOT_AUTHENTICATED: "Sign in again to deposit",
  ROUTE_UNAVAILABLE: "Privy has no route from that chain and asset right now",
  UNSUPPORTED_ROUTE: "Privy has no route from that chain and asset right now",
  UNSUPPORTED_CHAIN: "Privy does not accept deposits from that chain",
  UNSUPPORTED_CURRENCY: "Privy does not accept deposits of that asset",
  NO_SWAP_ROUTES_FOUND: "Privy found no way to convert that asset right now",
  NO_INTERNAL_SWAP_ROUTES_FOUND: "Privy found no way to convert that asset right now",
  NO_QUOTES: "Privy could not price that route right now",
  AMOUNT_TOO_LOW: "That amount is below the minimum for this route",
  INSUFFICIENT_LIQUIDITY: "Not enough liquidity on that route right now",
  DEPOSIT_FAILED: "The deposit did not complete",
  DEPOSIT_REFUNDED: "The deposit was refunded to where it came from",
  TIMEOUT_WAITING_FOR_NEXT_ORDER: "No deposit arrived in time; the address stays valid",
  TIMEOUT_ORDER_COMPLETION:
    "The deposit is taking longer than expected; it arrives on its own once it lands",
  SANCTIONED_WALLET_ADDRESS: "Privy refused that source address",
  REFUND_WALLET_CREATION_FAILED: "Privy could not prepare a refund address",
  UNEXPECTED_STATE: "The deposit flow ended in an unexpected state",
  UNKNOWN_ERROR: "The deposit flow could not be completed",
};

/** Privy's rejection may carry the code as `code`, `name` or inside `message`. */
export function depositReasonFor(err: unknown): string | null {
  const candidates: unknown[] = [];
  if (err && typeof err === "object") {
    candidates.push((err as { code?: unknown }).code, (err as { name?: unknown }).name);
    candidates.push((err as { message?: unknown }).message);
  } else {
    candidates.push(err);
  }
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    if (candidate.includes("USER_EXITED")) return null;
    for (const [code, reason] of Object.entries(REASONS)) {
      if (candidate.includes(code)) return reason ?? null;
    }
  }
  return REASONS.UNKNOWN_ERROR ?? null;
}

export function DepositAnywhereButton({
  address,
  vault,
  explorerHref,
  onCompleted,
}: DepositAnywhereButtonProps) {
  const { createDepositAddress } = useDepositAddress();
  const [busy, setBusy] = React.useState(false);
  const [reason, setReason] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const handleClick = React.useCallback(async () => {
    setBusy(true);
    setReason(null);
    setDone(false);
    try {
      await createDepositAddress({
        destinationChain: vault.caip2,
        destinationCurrency: vault.asset.address,
        destinationAddress: address,
      });
      setDone(true);
      onCompleted?.();
    } catch (err) {
      setReason(depositReasonFor(err));
    } finally {
      setBusy(false);
    }
  }, [createDepositAddress, vault, address, onCompleted]);

  const symbol = vault.asset.symbol.toUpperCase();

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" className="w-full" onClick={handleClick} disabled={busy}>
        {busy ? "Waiting for the deposit…" : "Add from any wallet, exchange or chain"}
      </Button>
      {done ? (
        <p role="status" className="text-sm text-positive">
          Deposit received. It lands in your wallet as {symbol}.
        </p>
      ) : null}
      {reason ? (
        <div className="flex flex-col gap-1">
          <p role="alert" className="max-w-prose text-sm text-ink-2">
            {reason}. You can still send {symbol} on {vault.caip2 === "eip155:8453" ? "Base" : "the vault's chain"} straight to your wallet:
          </p>
          <Address value={address} explorerHref={explorerHref} />
        </div>
      ) : null}
    </div>
  );
}
