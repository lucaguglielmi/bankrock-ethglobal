"use client";

/**
 * Contact sheet — the shop's "Claim an OG Rock" and "Become a Sponsor" forms (spec 15 S-6,
 * spec 17 L-5).
 *
 * What this file used to be: `handleSubmit` was two `setTimeout`s. It showed "Message Sent!" and
 * closed itself, having sent nothing anywhere. Its submit button also sat below the fold of a
 * 640 px phone, and further below it with the keyboard open (L-5).
 *
 * What it is now: a real `POST /api/contact`. Success is shown only for a 2xx. A 503 renders the
 * route's own reason — the request was not stored, so it was not received. The submit button
 * lives in the sheet's sticky footer and is reachable without scrolling.
 *
 * The route also emails the submitter a copy. The success copy says so only when the response
 * reports that email as sent; otherwise it says what is true — the message is stored.
 */

import * as React from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { UnavailableState } from "@/components/ui/unavailable-state";

const FORM_ID = "contact-sheet-form";

type ContactKind = "og_rock" | "sponsor";

type Status =
  | { state: "idle" }
  | { state: "sending" }
  | { state: "sent"; acknowledged: boolean }
  | { state: "error"; message: string }
  | { state: "unavailable"; reason: string };

interface ContactModalProps {
  triggerText: string;
  title: string;
  variant?: "dark" | "light";
}

/** The request kind the API expects, read from the surface this form was opened from. */
export function contactKindFor(title: string, variant?: "dark" | "light"): ContactKind {
  if (/sponsor/i.test(title)) return "sponsor";
  if (variant === "light") return "sponsor";
  return "og_rock";
}

interface ContactResponseBody {
  state?: string;
  reason?: string;
  error?: string;
  email?: { acknowledgement?: { sent?: boolean } };
}

export function ContactModal({ triggerText, title, variant = "dark" }: ContactModalProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [status, setStatus] = React.useState<Status>({ state: "idle" });
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [message, setMessage] = React.useState("");
  // Only asked for the OG-rock / barter form (ported from main's contact form, folded into the
  // stored `message` with a label rather than becoming new columns — both are free text and
  // neither needs to be queried on its own).
  const [skill, setSkill] = React.useState("");
  const [link, setLink] = React.useState("");

  const kind = contactKindFor(title, variant);
  const messageLabel =
    kind === "sponsor" ? "How would you like to sponsor?" : "What are you bartering, or why should you get one?";

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setStatus({ state: "sending" });

      const composedMessage = [
        message.trim(),
        skill.trim() ? `What they can do well: ${skill.trim()}` : null,
        link.trim() ? `Portfolio / social link: ${link.trim()}` : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join("\n\n");

      try {
        const response = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            message: composedMessage,
            kind,
          }),
        });

        const body = (await response.json().catch(() => ({}))) as ContactResponseBody;

        if (response.ok) {
          setStatus({ state: "sent", acknowledged: body.email?.acknowledgement?.sent === true });
          return;
        }

        if (response.status === 503) {
          setStatus({
            state: "unavailable",
            reason:
              body.reason ?? "Your message could not be stored, so it was not received.",
          });
          return;
        }

        if (response.status === 429) {
          setStatus({
            state: "error",
            message: "That is a lot of messages. Try again in an hour.",
          });
          return;
        }

        setStatus({
          state: "error",
          message: body.error ?? "The message was not sent. Check the fields and try again.",
        });
      } catch {
        setStatus({
          state: "error",
          message: "The message was not sent — the network did not answer.",
        });
      }
    },
    [name, email, message, skill, link, kind],
  );

  const handleOpenChange = React.useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setStatus({ state: "idle" });
    }
  }, []);

  const sending = status.state === "sending";
  const finished = status.state === "sent" || status.state === "unavailable";

  return (
    <>
      <Button
        type="button"
        variant={variant === "dark" ? "default" : "outline"}
        size="lg"
        className="w-full rounded-full"
        onClick={() => setIsOpen(true)}
      >
        {triggerText}
      </Button>

      <Sheet
        open={isOpen}
        onOpenChange={handleOpenChange}
        title={title}
        footer={
          finished ? (
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={() => handleOpenChange(false)}
            >
              Close
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              {status.state === "error" ? (
                <p role="alert" className="text-sm text-danger">
                  {status.message}
                </p>
              ) : null}
              <Button type="submit" form={FORM_ID} size="lg" className="w-full" disabled={sending}>
                <span className="motion-safe:transition-opacity">
                  {sending ? "Sending…" : "Send message"}
                </span>
                {sending ? (
                  <Loader2 aria-hidden className="motion-safe:animate-spin" />
                ) : (
                  <ArrowRight aria-hidden />
                )}
              </Button>
            </div>
          )
        }
      >
        <SheetBody>
          {status.state === "sent" ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 aria-hidden className="size-10 text-positive" />
              <h3 className="text-h3 font-semibold text-ink">Message received</h3>
              <p className="max-w-prose text-base text-ink-2">
                It is stored and we will read it. We will reply to the address you gave us.
                {status.acknowledged ? " We have emailed you a copy." : null}
              </p>
            </div>
          ) : status.state === "unavailable" ? (
            <UnavailableState reason={status.reason} />
          ) : (
            <form id={FORM_ID} onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label htmlFor="contact-name" className="text-label text-ink-3">
                  YOUR NAME
                </label>
                <input
                  id="contact-name"
                  name="name"
                  type="text"
                  required
                  maxLength={120}
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-border bg-transparent px-3 text-base text-ink outline-none placeholder:text-ink-4 focus:border-ring focus:ring-3 focus:ring-ring/50"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="contact-email" className="text-label text-ink-3">
                  YOUR EMAIL
                </label>
                <input
                  id="contact-email"
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  spellCheck={false}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-border bg-transparent px-3 text-base text-ink outline-none placeholder:text-ink-4 focus:border-ring focus:ring-3 focus:ring-ring/50"
                />
                <p className="text-sm text-ink-2">This is the only way we can reply.</p>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="contact-message" className="text-label text-ink-3">
                  {messageLabel.toUpperCase()}
                </label>
                <textarea
                  id="contact-message"
                  name="message"
                  required
                  rows={5}
                  maxLength={4000}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  className="w-full resize-none rounded-2xl border border-border bg-transparent px-3 py-3 text-base text-ink outline-none placeholder:text-ink-4 focus:border-ring focus:ring-3 focus:ring-ring/50"
                />
              </div>

              {kind === "og_rock" ? (
                <>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="contact-skill" className="text-label text-ink-3">
                      WHAT&apos;S SOMETHING YOU CAN DO VERY WELL? (OPTIONAL)
                    </label>
                    <input
                      id="contact-skill"
                      name="skill"
                      type="text"
                      maxLength={200}
                      value={skill}
                      onChange={(event) => setSkill(event.target.value)}
                      className="h-12 w-full rounded-2xl border border-border bg-transparent px-3 text-base text-ink outline-none placeholder:text-ink-4 focus:border-ring focus:ring-3 focus:ring-ring/50"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label htmlFor="contact-link" className="text-label text-ink-3">
                      LINK TO YOUR PORTFOLIO, TWITTER, OR WEBSITE (OPTIONAL)
                    </label>
                    <input
                      id="contact-link"
                      name="link"
                      type="text"
                      maxLength={300}
                      autoComplete="url"
                      spellCheck={false}
                      value={link}
                      onChange={(event) => setLink(event.target.value)}
                      className="h-12 w-full rounded-2xl border border-border bg-transparent px-3 text-base text-ink outline-none placeholder:text-ink-4 focus:border-ring focus:ring-3 focus:ring-ring/50"
                    />
                  </div>
                </>
              ) : null}
            </form>
          )}
        </SheetBody>
      </Sheet>
    </>
  );
}
