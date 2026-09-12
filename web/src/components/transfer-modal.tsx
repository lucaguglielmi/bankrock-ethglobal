"use client";

/**
 * Give sheet — Flow E (spec 02), spec 17 Part 5 "Give sheet", spec 15 SC-5 / X-3.
 *
 * What this file used to be: a hand-rolled modal that called `transferOwnership` immediately and
 * unconditionally, accepted `name.eth` as a recipient and passed the raw string on as
 * `` `0x${string}` `` for viem to choke on (X-3), rendered a synthesized hash with an
 * explorer link built from it (D-014), and narrated a Safe/paymaster route that does not exist.
 *
 * What it is now: the pending handover Flow E always specified. The owner names the recipient,
 * picks an expiry, optionally writes a message, and creates a handover. The rock does not move
 * until that recipient taps the tag and claims it (`ClaimHandoverSheet`). There is no
 * immediate-transfer path any more.
 *
 * The recipient is **required**. An unnamed gift ("whoever taps it") cannot carry the
 * pre-signed Rock Account owner swap — there is no address to sign it for — and after the
 * contract audit the giver's Safe loses authority the moment the rock changes owner. Whoever
 * claimed such a gift would own a rock whose account nobody could drive under sponsorship. So
 * the address is asked for up front, where the mistake is still cheap.
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
import type { Capability } from "@/lib/demo";
import { useRockActions } from "@/hooks/useBankRock";

const DAY_SECONDS = 24 * 60 * 60;

const EXPIRY_OPTIONS = [
  { days: 1, label: "1 day" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
] as const;

const MESSAGE_MAX = 280;

type Step = "form" | "review" | "done";

type HandoverResult = Capability<{ txHash: `0x${string}` }>;

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
  const { initiateHandover, isPending } = useRockActions();

  const [step, setStep] = React.useState<Step>("form");
  const [recipient, setRecipient] = React.useState("");
  const [expiryDays, setExpiryDays] = React.useState<number>(7);
  const [message, setMessage] = React.useState("");
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [result, setResult] = React.useState<HandoverResult | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

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
        ? "That is your own address. Give the rock to someone else."
        : null;

  const canReview = isValidAddress && recipientError === null;

  const handlePaste = React.useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setRecipient(text.trim());
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
      setStep("done");
      onHandoverInitiated?.(namedRecipient, capability);
      if (capability.state === "REAL") {
        onTransferSuccess?.(namedRecipient, capability.value.txHash);
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "The gift was not created. Nothing has changed.",
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
        Review this gift
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
            {isPending ? "Creating the gift…" : "Give this rock"}
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
    footer = (
      <Button type="button" size="lg" className="w-full" onClick={onClose}>
        Done
      </Button>
    );
  }

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Give this rock"
      description={`Rock #${rockId} stays yours until the person you give it to taps it and claims it.`}
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
                  onChange={(event) => setRecipient(event.target.value)}
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
                  The person you name will be able to claim the rock and its account when they
                  tap it.
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
                After that the gift lapses and the rock is simply still yours. That window is how
                long they have to <em>open</em> the gift. The gasless part — the sponsored
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
                I want to give rock #{rockId} to this address.
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
                  <h3 className="text-h3 font-semibold text-ink">The gift is waiting</h3>
                  {result.state === "DEMO" ? <SimulatedBadge /> : null}
                </div>
                <p className="max-w-prose text-base text-ink-2">
                  They can claim it the next time they tap this rock. The rock stays in your
                  account until they do.
                </p>
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
