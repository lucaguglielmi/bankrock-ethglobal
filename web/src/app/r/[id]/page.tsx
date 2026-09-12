/**
 * The NFC tag URL (R-7, D-022, spec 06).
 *
 * The NDEF payload written to every tag is
 * `https://bank-rock.com/r/{publicRockId}?e=…&c=…`. This route existed only as
 * a 404, which is why no physical tag could be encoded. It resolves to the rock
 * page and preserves the query string verbatim, so the SDM parameters survive
 * the hop and reach the verifier unchanged.
 *
 * No UI: `redirect` throws `NEXT_REDIRECT` and terminates rendering.
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
