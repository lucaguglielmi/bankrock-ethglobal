/**
 * The give link — naming a recipient in the time it takes to point a camera (B1, Flow E).
 *
 * The give sheet used to accept exactly one thing: an address pasted out of the giver's own
 * clipboard. On stage that means the recipient has to get 42 characters from their phone into the
 * giver's, and there is no path that does not involve a chat app. ENS was rejected outright
 * (X-3), and a QR *scanner* would mean a camera library, a permission prompt and a viewfinder.
 *
 * So the arrow is reversed. The recipient shows a link; the giver's own camera app opens it:
 *
 *   https://bank-rock.com/rock/<id>?give=<address>     shown from a rock page
 *   https://bank-rock.com/?give=<address>              shown from anywhere else
 *
 * No camera library, no scanner UI, no new permission — the phone's stock camera already reads
 * QR codes and opens links. The app's side of it is this module: build the link, read the
 * parameter back, and strip it so a reload does not prefill a stale recipient.
 *
 * Nothing here fabricates or shortens an address: `readGiveAddress` accepts a lowercase or
 * correctly checksummed 20-byte address and returns the checksummed form, and returns null for
 * everything else — an ENS name, a truncated address, a wrong-checksum address, or a second
 * `give` parameter smuggled in behind the first.
 */

import { getAddress, isAddress } from "viem";
import { appUrl } from "@/lib/chain";

/** The query parameter a scanned link carries. */
export const GIVE_PARAM = "give";

/**
 * The recipient named in a URL query string, or null.
 *
 * `strict` checksum validation is the point: a mixed-case address whose checksum does not match
 * is a corrupted address, and the one thing worse than asking the giver to paste is sending a
 * rock to an address nobody holds.
 */
export function readGiveAddress(search: string): `0x${string}` | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } catch {
    return null;
  }

  const values = params.getAll(GIVE_PARAM);
  // Two different values is an ambiguous link, not a recipient.
  if (values.length === 0) return null;
  if (values.length > 1 && new Set(values.map((v) => v.toLowerCase())).size > 1) return null;

  const raw = values[0].trim();
  if (!isAddress(raw, { strict: true })) return null;
  return getAddress(raw);
}

/**
 * The same query string with every `give` parameter removed, ready for `history.replaceState`.
 * Returns `""` when nothing is left, so the caller can drop the `?` entirely.
 */
export function stripGiveParam(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.delete(GIVE_PARAM);
  const rest = params.toString();
  return rest === "" ? "" : `?${rest}`;
}

/** The path a give link should point at: the rock being looked at, or the home page. */
export function giveLinkPath(pathname: string | null | undefined): string {
  const match = /^\/rock\/(\d+)(?:\/|$)/.exec(pathname ?? "");
  return match ? `/rock/${match[1]}` : "/";
}

/**
 * The link the recipient's QR encodes.
 *
 * The origin comes from `lib/chain`'s `appUrl` (D-022) — there is one canonical origin and it is
 * never written out here.
 */
export function buildGiveLink(address: string, pathname?: string | null): string {
  const checksummed = isAddress(address, { strict: false }) ? getAddress(address) : address;
  const base = appUrl.endsWith("/") ? appUrl.slice(0, -1) : appUrl;
  return `${base}${giveLinkPath(pathname)}?${GIVE_PARAM}=${checksummed}`;
}
