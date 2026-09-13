/**
 * Alert email dispatch (S-5, E-6, D-022, SA-7).
 *
 *  - `sendAlertEmail` returns `success: false` with a reason when it did not send. It previously
 *    returned `success: true` from a "sandbox preview" that sent nothing, and the MCP server
 *    reported that as DISPATCHED;
 *  - every interpolated value is HTML-escaped (SA-7);
 *  - links are built from NEXT_PUBLIC_APP_URL, never from a preview-domain literal (D-022);
 *  - an explorer link is rendered only for a real transaction hash (D-014);
 *  - until `bank-rock.com` is verified in Resend, the sandbox sender delivers only to the Resend
 *    account owner's own inbox (E-6). That is reported, not hidden.
 */

import { Resend } from "resend";
import { appPath, explorer } from "@/lib/chain";
import { optionalEnv } from "@/lib/demo";
import { publicReason } from "@/lib/errors";
import { escapeHtml, escapeHtmlAttributeUrl } from "@/lib/html";
import { logger } from "@/lib/telemetry";

export interface AlertEmailPayload {
  to: string;
  rockId: string | number;
  topic: string;
  topicTitle: string;
  severity: "danger" | "warning" | "profit" | "info" | "security";
  summary: string;
  details?: { label: string; value: string }[];
  /** Only ever a real, broadcast transaction hash. */
  txHash?: string;
  ctaUrl?: string;
}

export interface EmailDispatchResult {
  /** True only when the provider accepted the message for delivery. */
  success: boolean;
  id?: string;
  /** `sent` — accepted by Resend. `not_sent` — nothing left this process. */
  mode: "sent" | "not_sent";
  /** Why it was not sent, when it was not. */
  reason?: string;
  message: string;
}

const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;

export function generateAlertEmailHtml(payload: AlertEmailPayload): string {
  const { rockId, topicTitle, severity, summary, details, txHash, ctaUrl } = payload;

  const severityColor =
    severity === "danger"
      ? "#dc2626"
      : severity === "warning"
        ? "#ea580c"
        : severity === "profit"
          ? "#16a34a"
          : severity === "security"
            ? "#0284c7"
            : "#000000";

  const severityBadge =
    severity === "danger"
      ? "HIGH RISK DETECTED"
      : severity === "warning"
        ? "WARNING"
        : severity === "profit"
          ? "PROFIT CAPTURED"
          : severity === "security"
            ? "SECURITY NOTICE"
            : "AUTOMATION REPORT";

  const safeRockId = escapeHtml(rockId);

  const detailsHtml =
    details && details.length > 0
      ? `
    <table style="width: 100%; border-collapse: collapse; margin: 24px 0; border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden;">
      ${details
        .map(
          (d) => `
        <tr style="border-bottom: 1px solid #f0f0f0;">
          <td style="padding: 12px 16px; font-size: 12px; font-family: monospace; color: #737373; text-transform: uppercase;">${escapeHtml(d.label)}</td>
          <td style="padding: 12px 16px; font-size: 13px; font-weight: 600; color: #171717; text-align: right;">${escapeHtml(d.value)}</td>
        </tr>
      `,
        )
        .join("")}
    </table>
  `
      : "";

  // A transaction link is rendered only for a well-formed, real hash (D-014).
  const txHtml =
    txHash && TX_HASH_REGEX.test(txHash)
      ? `
    <div style="background-color: #f5f5f5; padding: 12px 16px; border-radius: 8px; margin: 16px 0; font-family: monospace; font-size: 12px; word-break: break-all;">
      <span style="color: #737373;">Transaction: </span>
      <a href="${escapeHtmlAttributeUrl(explorer.tx(txHash))}" style="color: #000000; text-decoration: underline;" target="_blank">${escapeHtml(txHash)}</a>
    </div>
  `
      : "";

  const buttonUrl = escapeHtmlAttributeUrl(ctaUrl || appPath(`/rock/${rockId}`));

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(topicTitle)} — Bank Rock #${safeRockId}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #fafafa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <div style="max-width: 580px; margin: 40px auto; background-color: #ffffff; border: 1px solid #e5e5e5; border-radius: 20px; overflow: hidden;">

    <div style="padding: 24px 32px; border-bottom: 1px solid #f0f0f0;">
      <span style="font-size: 18px; font-weight: 900; letter-spacing: -0.5px; color: #000000;">BANK ROCK</span>
      <span style="font-size: 12px; font-family: monospace; color: #737373; float: right;">ROCK #${safeRockId} • SEPOLIA</span>
    </div>

    <div style="padding: 32px 32px 16px 32px;">
      <div style="display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-family: monospace; font-weight: 700; letter-spacing: 0.5px; color: ${severityColor}; background-color: ${severityColor}15; margin-bottom: 16px;">
        ${severityBadge}
      </div>
      <h1 style="margin: 0 0 12px 0; font-size: 26px; font-weight: 800; letter-spacing: -0.8px; color: #0a0a0a; line-height: 1.2;">
        ${escapeHtml(topicTitle)}
      </h1>
      <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #525252;">
        ${escapeHtml(summary)}
      </p>
    </div>

    <div style="padding: 0 32px;">
      ${detailsHtml}
      ${txHtml}
    </div>

    <div style="padding: 24px 32px 32px 32px;">
      <a href="${buttonUrl}" style="display: block; width: 100%; text-align: center; background-color: #000000; color: #ffffff; padding: 14px 24px; border-radius: 12px; font-size: 14px; font-weight: 700; text-decoration: none; box-sizing: border-box;">
        Open Rock #${safeRockId}
      </a>
    </div>

    <div style="padding: 20px 32px; background-color: #fbfbfb; border-top: 1px solid #f0f0f0; font-size: 11px; color: #a3a3a3; line-height: 1.5;">
      <p style="margin: 0 0 6px 0;">You received this notification because your email is registered to monitor Bank Rock #${safeRockId}.</p>
      <p style="margin: 0;">Picked by hand near Florence.</p>
    </div>

  </div>
</body>
</html>
  `.trim();
}

/**
 * The configured sender. Falls back to Resend's documented test sender, `onboarding@resend.dev`,
 * which is reported as sandbox: it delivers only to the Resend account owner's own inbox.
 */
export function alertSender(): { from: string; sandbox: boolean } {
  const configured = optionalEnv("ALERT_FROM_ADDRESS");
  if (configured) return { from: configured, sandbox: false };
  return { from: "Bank Rock <onboarding@resend.dev>", sandbox: true };
}

/**
 * Sends an alert email.
 *
 * Returns `success: false` with a reason whenever nothing was sent: no API key, a provider error,
 * or a network failure. There is no preview mode that reports success.
 */
export async function sendAlertEmail(payload: AlertEmailPayload): Promise<EmailDispatchResult> {
  const start = Date.now();
  const apiKey = optionalEnv("RESEND_API_KEY");

  if (!apiKey || !apiKey.startsWith("re_")) {
    const reason = "RESEND_API_KEY is not configured";
    logger.warn("Alert email not sent", {
      action: "EMAIL_ALERT_NOT_SENT",
      rockId: payload.rockId,
      topic: payload.topic,
      reason,
    });
    return {
      success: false,
      mode: "not_sent",
      reason,
      message: "No email was sent: the mail provider is not configured.",
    };
  }

  const { from, sandbox } = alertSender();
  const html = generateAlertEmailHtml(payload);

  try {
    const resend = new Resend(apiKey);
    const data = await resend.emails.send({
      from,
      to: payload.to,
      subject: `[Bank Rock #${payload.rockId}] ${payload.topicTitle}`,
      html,
    });

    if (!data.data?.id) {
      const reason = data.error?.message || "The mail provider rejected the message";
      logger.warn("Alert email rejected by provider", {
        action: "EMAIL_ALERT_REJECTED",
        rockId: payload.rockId,
        topic: payload.topic,
        reason,
      });
      return {
        success: false,
        mode: "not_sent",
        reason,
        message: `No email was sent: ${reason}`,
      };
    }

    logger.info("Alert email accepted by provider", {
      action: "EMAIL_ALERT_SENT",
      rockId: payload.rockId,
      recipient: payload.to,
      topic: payload.topic,
      latencyMs: Date.now() - start,
    });

    return {
      success: true,
      id: data.data.id,
      mode: "sent",
      message: sandbox
        ? // E-6: the sandbox sender only reaches the Resend account owner's own inbox.
          "Accepted by the provider using the sandbox sender: until bank-rock.com is verified in Resend, it is delivered only to the Resend account owner's inbox."
        : "Accepted by the provider for delivery.",
    };
  } catch (err) {
    // The provider's own rejection message is reported above; a thrown exception can carry a URL
    // or a key, so it is mapped to a fixed reason instead (audit P-2).
    const reason = publicReason(err);
    logger.error("Alert email dispatch failed", err, {
      action: "EMAIL_ALERT_FAILED",
      rockId: payload.rockId,
      topic: payload.topic,
    });
    return {
      success: false,
      mode: "not_sent",
      reason,
      message: `No email was sent: ${reason}`,
    };
  }
}
