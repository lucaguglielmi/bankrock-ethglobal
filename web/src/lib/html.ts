/**
 * HTML escaping for values interpolated into email bodies (SA-7).
 *
 * Anything that reaches an email template from a request body, a database row or a chain read is
 * attacker-influenced text. It is escaped before interpolation, always.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
  "=": "&#61;",
  "/": "&#47;",
};

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"'`=/]/g, (char) => ESCAPES[char] ?? char);
}

/**
 * Escapes a value destined for an `href`. Only http(s) and mailto survive; anything else - most
 * importantly `javascript:` - collapses to "#".
 */
export function escapeHtmlAttributeUrl(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!/^(https?:|mailto:)/i.test(raw)) return "#";
  return escapeHtml(raw);
}
