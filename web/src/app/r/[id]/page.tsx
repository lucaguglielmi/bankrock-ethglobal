/**
 * The NFC tag URL (R-7, D-022, spec 06).
 *
 * The NDEF payload written to every tag is `https://bank-rock.com/r/{slug}?e=…&c=…`. This route
 * preserves the query verbatim and redirects to `/rock/{slug}`, so the SDM parameters survive the
 * hop and reach the verifier unchanged.
 *
 * Why it does not resolve the tag itself
 * --------------------------------------
 * The obvious design is for this route to work out which rock the tag *currently* belongs to and
 * redirect there. It cannot, and the reason matters:
 *
 *  - the only identifier in the URL is `e`, the encrypted PICC data. Reading the UID out of it
 *    means running the verifier — and the verifier advances the tag's read counter. A counter that
 *    advances on a redirect would burn the tap: the rock page would then present a stale counter
 *    and the registry would reject the attestation as a replay. Verification happens exactly once
 *    per tap, on the page that uses its result;
 *  - the number in the path is the number printed on the tag, which is not authoritative. A tag
 *    whose rock was archived awakens a *different* rock id next (`archiveRock` releases the tag),
 *    and the tag itself is never reprogrammed.
 *
 * So resolution happens after verification, on the rock page, from data the verifier already
 * returns. The SIGNED attestation carries `message.uidHash` — `keccak256(uid)`, not the UID, so
 * nothing about the physical tag leaks — and `resolveRockForTag(uidHash)` in `lib/rock-account.ts`
 * reads `rockIdForUid(uidHash)` from the registry with it. The rock page then:
 *
 *   1. resolves a different rock id than the path      -> navigate there, the tag has moved on;
 *   2. resolves null and the path rock is archived     -> offer the next free id from
 *                                                         `GET /api/rocks/next-id` and awaken into it;
 *   3. resolves null and the path rock is dormant      -> awaken the rock in the path;
 *   4. resolves the path rock                          -> stay.
 *
 * This file stays a redirect on purpose: a redirect is the one thing that can happen before
 * verification without costing anything.
 */

import { redirect } from "next/navigation";

interface TagPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function serialise(searchParams: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      query.append(key, value);
    } else if (Array.isArray(value)) {
      for (const entry of value) query.append(key, entry);
    }
  }
  return query.toString();
}

export default async function TagPage({ params, searchParams }: TagPageProps) {
  const { id } = await params;
  const query = serialise(await searchParams);
  const target = `/rock/${encodeURIComponent(id)}${query ? `?${query}` : ""}`;

  // Outside try/catch: `redirect` signals by throwing.
  redirect(target);
}
