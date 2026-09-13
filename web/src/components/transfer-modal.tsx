"use client";

/**
 * "Gift this rock" sheet — Flow E (spec 02), spec 17 Part 5 "Give sheet", spec 15 SC-5 / X-3.
 * Opened from the Ownership tab of the rock page.
 *
 * What this file used to be: a hand-rolled modal that called `transferOwnership` immediately and
 * unconditionally, accepted `name.eth` as a recipient and passed the raw string on as
 * `` `0x${string}` `` for viem to choke on (X-3), rendered a synthesized hash with an
 * explorer link built from it (D-014), and narrated a Safe/paymaster route that does not exist.
 *
 * What it is now: the pending handover Flow E always specified. The owner names the recipient,
 * picks an expiry, optionally writes a message, and creates a handover. The rock does not move
 * until that recipient taps the tag and claims it, on the rock page itself. There is no
 * immediate-transfer path any more.
 *
 * One signature does **two** things (spec 08, 2:10): it opens the handover on chain, and it
 * pre-signs the Safe owner swap that the recipient cannot produce for themselves. The second one
 * is the one this sheet used to lose. It was stored fire-and-forget, so "The gift is waiting"
 * could be printed over a gift the claim route would refuse forever — and the only person able to
 * repair it, the giver, had been told everything was fine. The done step now confirms the stored
 * key with the server and offers to sign it again when it is missing (defect A2).
 *
 * The recipient is **required**. An unnamed gift ("whoever taps it") cannot carry the
 * pre-signed Rock Account owner swap — there is no address to sign it for — and after the
 * contract audit the giver's Safe loses authority the moment the rock changes owner. Whoever
 * claimed such a gift would own a rock whose account nobody could drive under sponsorship. So
 * the address is asked for up front, where the mistake is still cheap.
 *
 * Naming that recipient used to mean one thing: pasting 42 characters out of the giver's own
 * clipboard, which on stage means a chat app and twenty seconds nobody has (B1). So the sheet
 * also reads `?give=<address>` from the URL. The recipient shows a QR of that link from their own
 * phone (`MyAddressQr`), the giver's stock camera opens it, and the sheet comes up with the
 * address already in the field. Paste is untouched and still the fallback.
 *
 * Three rules about that parameter:
 *  - it is validated as a lowercase or correctly checksummed 20-byte address and otherwise
 *    ignored entirely (`lib/give-link.ts`). A scanned link is untrusted input;
 *  - it is stripped from the URL the moment it is read, so a reload does not silently re-prefill
 *    a recipient the giver has since thought better of;
 *  - it opens the sheet by itself **only for the rock's own owner**. To anyone else the link is
 *    an ordinary rock page, which is what it is.
 */

import * as React from "react";
import { isAddress, getAddress } from "viem";
import { ArrowRight, Clipboard } from "lucide-react";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Address } from "@/components/ui/address";
import { TxHash } from "@/components/ui/tx-hash";
import { SimulatedBadge } from "@/components/ui/simulated-badge";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { cn } from "@/lib/ui/cn";
import { explorer } from "@/lib/chain";
import { useGiveParam } from "@/hooks/useGiveParam";
import { useAuth } from "@/context/auth-context";
import type { Capability } from "@/lib/demo";
import type { HandoverKeyResult } from "@/lib/handover-key";
import { useRockActions } from "@/hooks/useBankRock";

const DAY_SECONDS = 24 * 60 * 60;

const EXPIRY_OPTIONS = [
  { days: 1, label: "1 day" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
] as const;

const MESSAGE_MAX = 280;

type Step = "form" | "review" | "done";

type HandoverResult = Capability<{
  txHash: `0x${string}`;
  /** Whether the server confirmed the pre-signed Safe owner swap. REAL, or a reason. */
  handoverKey: HandoverKeyResult;
}>;

export interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  rockId: string;
  /** The current owner, shown on the review step. */
  currentOwner: string;
  /**
   * Compatibility callback. It now means "a handover was created", not "ownership moved":
   * nothing moves until the named recipient taps the rock and claims it.
   */
  onTransferSuccess?: (newOwner: string, txHash?: string) => void;
  /** Precise form of the callback above. The recipient is always a real address. */
  onHandoverInitiated?: (
    recipient: `0x${string}`,
    result: HandoverResult,
  ) => void;
}

function ExpiryOption({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      type="button"
      variant={selected ? "default" : "outline"}
      aria-pressed={selected}
      onClick={onSelect}
      className="h-12 w-full text-sm font-semibold"
    >
      {label}
    </Button>
  );
}

export function TransferModal({
  isOpen,
  onClose,
  rockId,
  currentOwner,
  onTransferSuccess,
  onHandoverInitiated,
}: TransferModalProps) {
  const { initiateHandover, storeHandoverKey, isPending } = useRockActions();
  const { address: signedInAddress } = useAuth();

  const [step, setStep] = React.useState<Step>("form");
  /** What the giver has typed. Null means "untouched", which is what lets the link fill it in. */
  const [typedRecipient, setTypedRecipient] = React.useState<string | null>(null);
  /** Set once the giver closes a sheet the link opened, so it does not reopen behind them. */
  const [linkDismissed, setLinkDismissed] = React.useState(false);
  const [expiryDays, setExpiryDays] = React.useState<number>(7);
  const [message, setMessage] = React.useState("");
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [result, setResult] = React.useState<HandoverResult | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  /** The hand-over key's state, which a retry can change without re-opening the gift. */
  const [handoverKey, setHandoverKey] = React.useState<HandoverKeyResult | null>(null);

  // The address a scanned link named, read and stripped from the URL exactly once.
  const scannedRecipient = useGiveParam();

  // The field shows what the giver typed; until they touch it, it shows what the link named.
  const recipient = typedRecipient ?? scannedRecipient ?? "";

  // A scanned link opens the sheet by itself, but only for the rock's own owner: to anyone else
  // the link is an ordinary rock page. Derived, not stored, so there is no effect to get wrong.
  const viewerIsOwner =
    Boolean(signedInAddress) &&
    Boolean(currentOwner) &&
    signedInAddress?.toLowerCase() === currentOwner.toLowerCase();
  const openedByLink = scannedRecipient !== null && viewerIsOwner && !linkDismissed;

  const handleClose = React.useCallback(() => {
    setLinkDismissed(true);
    onClose();
  }, [onClose]);

  const trimmedRecipient = recipient.trim();
  const isEmpty = trimmedRecipient === "";
  const looksLikeEns = /\.eth$/i.test(trimmedRecipient);
  const isValidAddress = !isEmpty && isAddress(trimmedRecipient, { strict: false });
  const isSelf =
    isValidAddress &&
    Boolean(currentOwner) &&
    trimmedRecipient.toLowerCase() === currentOwner.toLowerCase();

  // Empty is not an error while the field is untouched — it is simply not ready yet.
  const recipientError = looksLikeEns
    ? "ENS names are not supported yet. Paste the recipient's address, starting with 0x."
    : !isEmpty && !isValidAddress
      ? "That is not an Ethereum address. Paste the full address, starting with 0x."
      : isSelf
        ? "That is your own address. Name someone else."
        : null;

  const canReview = isValidAddress && recipientError === null;

  const handlePaste = React.useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setTypedRecipient(text.trim());
    } catch {
      // Clipboard access denied or unavailable — the field is still typable.
    }
  }, []);

  const handleConfirm = React.useCallback(async () => {
    if (!canReview || !acknowledged) return;
    setSubmitError(null);

    const expiresAt = Math.floor(Date.now() / 1000) + expiryDays * DAY_SECONDS;
    const namedRecipient = getAddress(trimmedRecipient) as `0x${string}`;
    const trimmedMessage = message.trim();

    try {
      const capability = await initiateHandover(
        rockId,
        namedRecipient,
        expiresAt,
        trimmedMessage === "" ? undefined : trimmedMessage,
      );
      setResult(capability);
      setHandoverKey(capability.state === "UNAVAILABLE" ? null : capability.value.handoverKey);
      setStep("done");
      onHandoverInitiated?.(namedRecipient, capability);
      if (capability.state === "REAL") {
        onTransferSuccess?.(namedRecipient, capability.value.txHash);
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "The handover was not opened. Nothing has changed.",
      );
    }
  }, [
    canReview,
    acknowledged,
    expiryDays,
    trimmedRecipient,
    message,
    initiateHandover,
    rockId,
    onHandoverInitiated,
    onTransferSuccess,
  ]);

  /**
   * Signs and stores the hand-over key again, for a gift that is already on chain.
   *
   * It deliberately does not call `initiateHandover`: the handover exists, and opening it a second
   * time would be a second transaction for an event that has already happened.
   */
  const handleRetryKey = React.useCallback(async () => {
    if (!canReview) return;
    setHandoverKey(null);
    const again = await storeHandoverKey(rockId, getAddress(trimmedRecipient) as `0x${string}`);
    setHandoverKey(again);
  }, [canReview, storeHandoverKey, rockId, trimmedRecipient]);

  let footer: React.ReactNode;
  if (step === "form") {
    footer = (
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={!canReview}
        onClick={() => setStep("review")}
      >
        Review
        <ArrowRight aria-hidden />
      </Button>
    );
  } else if (step === "review") {
    footer = (
      <div className="flex flex-col gap-2">
        {submitError ? (
          <p role="alert" className="text-sm text-danger">
            {submitError}
          </p>
        ) : null}
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={!acknowledged || isPending}
          onClick={handleConfirm}
        >
          <span className="motion-safe:transition-opacity">
            {isPending ? "Opening the gift…" : "Gift this rock"}
          </span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="default"
          className="w-full"
          disabled={isPending}
          onClick={() => setStep("form")}
        >
          Back
        </Button>
      </div>
    );
  } else {
    const keyMissing =
      result?.state !== "UNAVAILABLE" && handoverKey !== null && handoverKey.state === "UNAVAILABLE";
    footer = (
      <div className="flex flex-col gap-2">
        {keyMissing ? (
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={isPending}
            onClick={handleRetryKey}
          >
            <span className="motion-safe:transition-opacity">
              {isPending ? "Signing…" : "Sign the handover key again"}
            </span>
          </Button>
        ) : null}
        <Button
          type="button"
          size="lg"
          variant={keyMissing ? "outline" : "default"}
          className="w-full"
          onClick={handleClose}
        >
          {keyMissing ? "Leave it for now" : "Done"}
        </Button>
      </div>
    );
  }

  return (
    <Sheet
      open={isOpen || openedByLink}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      title="Gift this rock"
      description={`Rock #${rockId} and its liquidity stay yours until the person you name taps it.`}
      footer={footer}
    >
      <SheetBody className="flex flex-col gap-6">
        {step === "form" ? (
          <>
            <div className="flex flex-col gap-2">
              <label htmlFor="give-recipient" className="text-label text-ink-3">
                WHO GETS IT
              </label>
              <div
                className={cn(
                  "flex items-center gap-2 rounded-2xl border border-border px-3 py-1.5",
                  "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
                )}
              >
                <input
                  id="give-recipient"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="0x…"
                  required
                  value={recipient}
                  onChange={(event) => setTypedRecipient(event.target.value)}
                  aria-describedby="give-recipient-hint"
                  aria-invalid={recipientError !== null}
                  className="h-11 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-4"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 shrink-0 px-3 text-sm"
                  onClick={handlePaste}
                >
                  <Clipboard aria-hidden />
                  Paste
                </Button>
              </div>
              {recipientError ? (
                <p role="alert" className="text-sm text-danger">
                  {recipientError}
                </p>
              ) : (
                <p id="give-recipient-hint" className="text-sm text-ink-2">
                  {scannedRecipient !== null &&
                  trimmedRecipient.toLowerCase() === scannedRecipient.toLowerCase()
                    ? "Filled in from the code you scanned. Check it against their screen before you confirm."
                    : "The person you name will be able to claim the rock and its account when they tap it."}
                </p>
              )}
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-label text-ink-3">HOW LONG THEY HAVE</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {EXPIRY_OPTIONS.map((option) => (
                  <ExpiryOption
                    key={option.days}
                    label={option.label}
                    selected={expiryDays === option.days}
                    onSelect={() => setExpiryDays(option.days)}
                  />
                ))}
              </div>
              <p className="text-sm text-ink-2">
                After that the handover lapses and the rock is simply still yours. That window is
                how long they have to <em>claim</em> it. The gasless part — the sponsored
                transaction that hands over the account — only stays valid for a short time after
                you sign. If they tap in after it expires, you&apos;ll get asked to sign once more
                before the handover can finish.
              </p>
            </fieldset>

            <div className="flex flex-col gap-2">
              <label htmlFor="give-message" className="text-label text-ink-3">
                A MESSAGE (OPTIONAL)
              </label>
              <textarea
                id="give-message"
                rows={3}
                maxLength={MESSAGE_MAX}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Happy birthday."
                className="w-full resize-none rounded-2xl border border-border bg-transparent px-3 py-3 text-base text-ink outline-none placeholder:text-ink-4 focus:border-ring focus:ring-3 focus:ring-ring/50"
              />
              <p className="text-sm text-ink-3">
                {message.length} of {MESSAGE_MAX} characters. They see it when they claim.
              </p>
            </div>
          </>
        ) : null}

        {step === "review" ? (
          <>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 text-sm">
              <dt className="text-ink-3">From you</dt>
              <dd className="justify-self-end">
                {currentOwner ? (
                  <Address value={currentOwner} />
                ) : (
                  <span className="text-ink-3">Not signed in</span>
                )}
              </dd>

              <dt className="text-ink-3">To</dt>
              <dd className="justify-self-end">
                <Address value={trimmedRecipient} />
              </dd>

              <dt className="text-ink-3">They have</dt>
              <dd className="justify-self-end font-medium text-ink">
                {EXPIRY_OPTIONS.find((option) => option.days === expiryDays)?.label}
              </dd>
            </dl>

            {message.trim() !== "" ? (
              <div className="rounded-2xl border border-border p-4">
                <span className="text-label text-ink-3">YOUR MESSAGE</span>
                <p className="mt-2 max-w-prose text-base text-ink-2">{message.trim()}</p>
              </div>
            ) : null}

            <div className="rounded-2xl border border-border p-4">
              <h3 className="text-h3 font-semibold text-ink">What happens next</h3>
              <p className="mt-2 max-w-prose text-base text-ink-2">
                The rock stays in your account until they tap it and claim it. Until then you can
                cancel, and nothing about the rock changes.
              </p>
            </div>

            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base text-ink-2 select-none">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="size-6 shrink-0 rounded border-border accent-primary"
              />
              <span>
                I want to hand rock #{rockId} to this address.
              </span>
            </label>
          </>
        ) : null}

        {step === "done" && result ? (
          <>
            {result.state === "UNAVAILABLE" ? (
              <UnavailableState reason={result.reason} />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-h3 font-semibold text-ink">
                    {handoverKey === null || handoverKey.state === "UNAVAILABLE"
                      ? "The handover is not finished"
                      : "The handover is open"}
                  </h3>
                  {result.state === "DEMO" ? <SimulatedBadge /> : null}
                </div>
                {handoverKey !== null && handoverKey.state !== "UNAVAILABLE" ? (
                  <p className="max-w-prose text-base text-ink-2">
                    Ownership changes when they tap it. Until then the rock stays yours.
                  </p>
                ) : (
                  /*
                   * The handover is on chain and the key that moves the account with it is not.
                   * Saying "waiting" here would be a lie the recipient pays for: the claim route
                   * refuses a gift with no stored owner swap, and only this giver can sign one.
                   */
                  <div className="flex flex-col gap-2">
                    <p className="max-w-prose text-base text-ink-2">
                      The handover is on chain, but the key that hands over the rock&apos;s account
                      is not stored. If they tap the rock now, the claim will be refused. Sign the
                      key again to finish the handover — this does not open a second one.
                    </p>
                    <UnavailableState
                      reason={
                        handoverKey === null
                          ? "The hand-over key has not been confirmed"
                          : handoverKey.reason
                      }
                    />
                  </div>
                )}
                <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 text-sm">
                  <dt className="text-ink-3">To</dt>
                  <dd className="justify-self-end">
                    <Address value={trimmedRecipient} />
                  </dd>
                  <dt className="text-ink-3">Transaction</dt>
                  <dd className="justify-self-end">
                    {result.state === "REAL" ? (
                      <TxHash
                        value={result.value.txHash}
                        explorerHref={explorer.tx(result.value.txHash)}
                      />
                    ) : (
                      <span className="text-ink-3">no transaction — simulated</span>
                    )}
                  </dd>
                </dl>
              </div>
            )}
          </>
        ) : null}
      </SheetBody>
    </Sheet>
  );
}
