/**
 * Contact-form email dispatch (S-6, SA-7, E-6).
 *
 * The shop's two forms ("Claim a Testnet Rock" and "Sponsor Bank Rock") store a row in D1 first;
 * the row is what makes a submission a success. This module then sends two emails through
 * Resend, independently of each other:
 *
 *  - an **operator notification** to `CONTACT_NOTIFY_EMAIL` (falling back to
 *    `ALERT_EMAIL_ADDRESS`), with `replyTo` set to the submitter so the owner answers from the
 *    inbox. No default recipient: unset means `not_sent`, with the variable named;
 *  - an **acknowledgement** to the submitter.
 *
 * Same contract as `sendAlertEmail` (`lib/email-service.ts`): it never throws, and it never reports
 * a send that did not happen — no API key, a provider rejection or a network error is
 * `success: false` with a reason. Every interpolated value is HTML-escaped (SA-7).
 *
 * Two things differ from the alert path on purpose:
 *
 *  - the `reason` a result carries is a fixed sentence written here, never the provider's own
 *    text. The alert results reach an operator; these reach the anonymous caller of
 *    `POST /api/contact`, and Resend's rejection for a sandbox sender names the account owner's
 *    inbox (audit P-2). The provider's text goes to telemetry, which redacts it;
 *  - until `bank-rock.com` is verified in Resend, the sandbox sender delivers only to the Resend
 *    account owner's own inbox (E-6), so in sandbox the acknowledgement to a stranger is rejected
 *    or undelivered. That is reported in the result, not hidden.
 *
 * Alert delivery is untouched by this module and stays intentionally sandboxed until mainnet
 * (DEMO-STATE K-9).
 */

import { Resend } from "resend";
import { appPath } from "@/lib/chain";
import { optionalEnv } from "@/lib/demo";
import { alertSender, type EmailDispatchResult } from "@/lib/email-service";
import { publicReason } from "@/lib/errors";
import { escapeHtml, escapeHtmlAttributeUrl } from "@/lib/html";
import { logger } from "@/lib/telemetry";

export type ContactKind = "og_rock" | "sponsor";

export interface ContactEmailInput {
  /** The `contact_requests.id` the row was stored under. */
  id: string;
  kind: ContactKind;
  name: string;
  /** Already validated and lower-cased by the route. */
  email: string;
  message: string;
  /** Milliseconds since the epoch, as stored. */
  createdAt: number;
}

export interface ContactEmailDispatch {
  /** The notification to the owner's inbox. */
  operator: EmailDispatchResult;
  /** The copy sent back to the submitter. */
  acknowledgement: EmailDispatchResult;
}

type ContactEmailTarget = keyof ContactEmailDispatch;

/** The two sentences a rejection can carry outward. Written here; nothing is interpolated. */
const PROVIDER_REJECTED_REASON = "the mail provider rejected the message";
const SANDBOX_NOTE =
  "until bank-rock.com is verified in Resend, the sandbox sender delivers only to the Resend account owner's inbox";

/**
 * The sender for contact mail: `CONTACT_FROM_ADDRESS`, else the alert sender — which is
 * `ALERT_FROM_ADDRESS` or the Resend sandbox, reported as such.
 */
export function contactSender(): { from: string; sandbox: boolean } {
  const configured = optionalEnv("CONTACT_FROM_ADDRESS");
  if (configured) return { from: configured, sandbox: false };
  return alertSender();
}

/** The inbox the operator notification goes to, or undefined when none is configured. */
export function contactNotifyAddress(): string | undefined {
  return optionalEnv("CONTACT_NOTIFY_EMAIL") ?? optionalEnv("ALERT_EMAIL_ADDRESS");
}

function formTitle(kind: ContactKind): string {
  return kind === "sponsor" ? "Sponsor Bank Rock" : "Claim a Testnet Rock";
}

function requestLabel(kind: ContactKind): string {
  return kind === "sponsor" ? "sponsor" : "testnet rock";
}

/** A header value: one line, no CR/LF, however the form was filled in. */
function headerText(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** Escaped, with the submitter's line breaks kept. */
function messageHtml(message: string): string {
  return escapeHtml(message).replace(/\r?\n/g, "<br>");
}

const BODY_STYLE =
  "margin: 0; padding: 0; background-color: #fafafa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;";
const CARD_STYLE =
  "max-width: 580px; margin: 40px auto; background-color: #ffffff; border: 1px solid #e5e5e5; border-radius: 20px; overflow: hidden;";
const TEXT_STYLE = "margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #525252;";
const QUOTE_STYLE =
  "margin: 16px 0; padding: 16px; background-color: #f5f5f5; border-radius: 12px; font-size: 15px; line-height: 1.6; color: #171717;";
const META_STYLE = "margin: 0; font-size: 12px; font-family: monospace; color: #737373;";

export function generateOperatorNotificationHtml(input: ContactEmailInput): string {
  const safeName = escapeHtml(input.name);
  const safeEmail = escapeHtml(input.email);
  const safeForm = escapeHtml(formTitle(input.kind));
  const safeId = escapeHtml(input.id);
  const safeWhen = escapeHtml(new Date(input.createdAt).toISOString());
  const adminUrl = escapeHtmlAttributeUrl(appPath("/admin"));

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>New ${escapeHtml(requestLabel(input.kind))} request — Bank Rock</title>
</head>
<body style="${BODY_STYLE}">
  <div style="${CARD_STYLE}">
    <div style="padding: 24px 32px; border-bottom: 1px solid #f0f0f0;">
      <span style="font-size: 18px; font-weight: 900; letter-spacing: -0.5px; color: #000000;">BANK ROCK</span>
      <span style="font-size: 12px; font-family: monospace; color: #737373; float: right;">CONTACT FORM</span>
    </div>
    <div style="padding: 32px 32px 16px 32px;">
      <h1 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #0a0a0a; line-height: 1.2;">
        New ${escapeHtml(requestLabel(input.kind))} request
      </h1>
      <p style="${TEXT_STYLE}">Form: <strong>${safeForm}</strong></p>
      <p style="${TEXT_STYLE}">From: <strong>${safeName}</strong> &lt;${safeEmail}&gt;</p>
      <div style="${QUOTE_STYLE}">${messageHtml(input.message)}</div>
      <p style="${META_STYLE}">Request ${safeId} · ${safeWhen}</p>
    </div>
    <div style="padding: 8px 32px 32px 32px;">
      <a href="${adminUrl}" style="display: block; width: 100%; text-align: center; background-color: #000000; color: #ffffff; padding: 14px 24px; border-radius: 12px; font-size: 14px; font-weight: 700; text-decoration: none; box-sizing: border-box;">
        Open the admin page
      </a>
      <p style="margin: 16px 0 0 0; font-size: 12px; color: #a3a3a3; line-height: 1.5;">Reply to this email to answer ${safeName} directly.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

export function generateAcknowledgementHtml(input: ContactEmailInput): string {
  const safeName = escapeHtml(input.name);
  const safeForm = escapeHtml(formTitle(input.kind));

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>We got your message — Bank Rock</title>
</head>
<body style="${BODY_STYLE}">
  <div style="${CARD_STYLE}">
    <div style="padding: 24px 32px; border-bottom: 1px solid #f0f0f0;">
      <span style="font-size: 18px; font-weight: 900; letter-spacing: -0.5px; color: #000000;">BANK ROCK</span>
    </div>
    <div style="padding: 32px;">
      <p style="${TEXT_STYLE}">Hi ${safeName},</p>
      <p style="${TEXT_STYLE}">Thanks — we received your message through the "${safeForm}" form and will reply to this address. Here is a copy of what you sent:</p>
      <div style="${QUOTE_STYLE}">${messageHtml(input.message)}</div>
      <p style="${TEXT_STYLE}">One thing worth knowing: Bank Rock runs on Ethereum Sepolia, a test network, with test tokens that have no monetary value — there is no mainnet deployment.</p>
      <p style="margin: 24px 0 0 0; font-size: 12px; color: #a3a3a3; line-height: 1.5;">Picked by hand near Florence.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

/**
 * One send, mapped to a result. Never throws.
 *
 * `sandbox` decides only the wording of the outward reason: a rejection while on the sandbox
 * sender is almost always E-6, and the operator reading the response should be told so.
 */
async function sendOne(
  resend: Resend,
  target: ContactEmailTarget,
  input: ContactEmailInput,
  sender: { from: string; sandbox: boolean },
  email: OutgoingEmail,
): Promise<EmailDispatchResult> {
  const start = Date.now();
  const context = { target, contactId: input.id, kind: input.kind };

  try {
    const data = await resend.emails.send({
      from: sender.from,
      to: email.to,
      subject: email.subject,
      html: email.html,
      ...(email.replyTo ? { replyTo: email.replyTo } : {}),
    });

    if (!data.data?.id) {
      const reason = sender.sandbox
        ? `${PROVIDER_REJECTED_REASON} — ${SANDBOX_NOTE}`
        : PROVIDER_REJECTED_REASON;
      // The provider's own words go to telemetry only (redacted there), never outward.
      logger.warn("Contact email rejected by provider", {
        action: "CONTACT_EMAIL_REJECTED",
        ...context,
        providerError: data.error?.message ?? null,
        sandbox: sender.sandbox,
      });
      return { success: false, mode: "not_sent", reason, message: `No email was sent: ${reason}` };
    }

    logger.info("Contact email accepted by provider", {
      action: "CONTACT_EMAIL_SENT",
      ...context,
      sandbox: sender.sandbox,
      latencyMs: Date.now() - start,
    });

    return {
      success: true,
      id: data.data.id,
      mode: "sent",
      message: sender.sandbox
        ? // E-6: the sandbox sender only reaches the Resend account owner's own inbox.
          "Accepted by the provider using the sandbox sender: until bank-rock.com is verified in Resend, it is delivered only to the Resend account owner's inbox."
        : "Accepted by the provider for delivery.",
    };
  } catch (err) {
    // A thrown exception can carry a URL or a key, so it is mapped to a fixed reason (audit P-2).
    const reason = publicReason(err);
    logger.error("Contact email dispatch failed", err, { action: "CONTACT_EMAIL_FAILED", ...context });
    return { success: false, mode: "not_sent", reason, message: `No email was sent: ${reason}` };
  }
}

function notSent(
  target: ContactEmailTarget,
  input: ContactEmailInput,
  reason: string,
): EmailDispatchResult {
  logger.warn("Contact email not sent", {
    action: "CONTACT_EMAIL_NOT_SENT",
    target,
    contactId: input.id,
    kind: input.kind,
    reason,
  });
  return {
    success: false,
    mode: "not_sent",
    reason,
    message: `No email was sent: ${reason}`,
  };
}

/**
 * Sends the operator notification and the submitter acknowledgement for one stored request.
 *
 * The two are sent independently — one failing does not stop the other — and each result says
 * on its own whether the provider accepted it. Never throws.
 */
export async function sendContactEmails(input: ContactEmailInput): Promise<ContactEmailDispatch> {
  const apiKey = optionalEnv("RESEND_API_KEY");

  if (!apiKey || !apiKey.startsWith("re_")) {
    const reason = "RESEND_API_KEY is not configured";
    return {
      operator: notSent("operator", input, reason),
      acknowledgement: notSent("acknowledgement", input, reason),
    };
  }

  const resend = new Resend(apiKey);
  const sender = contactSender();
  const notifyTo = contactNotifyAddress();
  const safeName = headerText(input.name);

  const operator: Promise<EmailDispatchResult> = notifyTo
    ? sendOne(resend, "operator", input, sender, {
        to: notifyTo,
        replyTo: input.email,
        subject: `[Bank Rock] New ${requestLabel(input.kind)} request from ${safeName}`,
        html: generateOperatorNotificationHtml(input),
      })
    : Promise.resolve(notSent("operator", input, "CONTACT_NOTIFY_EMAIL is not configured"));

  const acknowledgement = sendOne(resend, "acknowledgement", input, sender, {
    to: input.email,
    subject: "We got your message — Bank Rock",
    html: generateAcknowledgementHtml(input),
  });

  const [operatorOutcome, acknowledgementOutcome] = await Promise.allSettled([
    operator,
    acknowledgement,
  ]);

  // `sendOne` and `notSent` do not reject; this keeps the promise never thrown even if one did.
  function settle(
    outcome: PromiseSettledResult<EmailDispatchResult>,
    target: ContactEmailTarget,
  ): EmailDispatchResult {
    if (outcome.status === "fulfilled") return outcome.value;
    const reason = publicReason(outcome.reason);
    logger.error("Contact email dispatch failed", outcome.reason, {
      action: "CONTACT_EMAIL_FAILED",
      target,
      contactId: input.id,
      kind: input.kind,
    });
    return { success: false, mode: "not_sent", reason, message: `No email was sent: ${reason}` };
  }

  return {
    operator: settle(operatorOutcome, "operator"),
    acknowledgement: settle(acknowledgementOutcome, "acknowledgement"),
  };
}
