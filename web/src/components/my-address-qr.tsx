"use client";

/**
 * "My address" — the recipient's half of the give link (B1, Flow E, spec 08 beat 2:10).
 *
 * The recipient opens this on their own phone; the giver points their camera at it and the stock
 * camera app opens `…/rock/<id>?give=<address>`, which prefills the give sheet. That is the whole
 * mechanism: no scanner, no camera permission, no camera library — only a generator
 * (`lib/qr.ts`), which is a few hundred lines of arithmetic and no dependency.
 *
 * Two details that are not decoration:
 *
 *  - the symbol is always dark-on-white, in both themes. A QR rendered in theme colours is a QR
 *    that a camera cannot read on a dark phone, and this is the one surface where legibility
 *    means "a machine can read it", not "a person can".
 *  - the address is shown as text with a copy button underneath. The link is the fast path, not
 *    the only path: paste still works, and the giver may be on a laptop.
 */

import * as React from "react";
import { usePathname } from "next/navigation";
import { Address } from "@/components/ui/address";
import { buildGiveLink } from "@/lib/give-link";
import { encodeQr, qrPathData, qrViewBoxSize } from "@/lib/qr";
import { cn } from "@/lib/ui/cn";

export interface MyAddressQrProps {
  /** The signed-in wallet. Nothing is rendered without one. */
  address: string;
  /**
   * Overrides the path the link points at. Defaults to the page this is rendered on, so opening
   * it from a rock page hands the giver a link back to that rock.
   */
  path?: string;
  className?: string;
}

/** The quiet zone the standard requires. Four light modules on every side. */
const QUIET_ZONE = 4;

export function MyAddressQr({ address, path, className }: MyAddressQrProps) {
  const pathname = usePathname();
  const link = React.useMemo(
    () => buildGiveLink(address, path ?? pathname),
    [address, path, pathname],
  );

  const symbol = React.useMemo(() => {
    try {
      const matrix = encodeQr(link);
      return {
        path: qrPathData(matrix, QUIET_ZONE),
        size: qrViewBoxSize(matrix, QUIET_ZONE),
      };
    } catch {
      // The only way this throws is a payload past version 10, which a 90-character URL is not.
      // If it ever does, the address below is still the whole answer.
      return null;
    }
  }, [link]);

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {symbol ? (
        <div className="rounded-2xl border border-border bg-white p-3">
          <svg
            viewBox={`0 0 ${symbol.size} ${symbol.size}`}
            width="216"
            height="216"
            shapeRendering="crispEdges"
            role="img"
            aria-label="QR code of a link that names this wallet as the recipient of a rock"
            className="block h-auto w-full max-w-56"
          >
            <rect width={symbol.size} height={symbol.size} fill="#ffffff" />
            <path d={symbol.path} fill="#000000" />
          </svg>
        </div>
      ) : null}

      <Address value={address} />

      <p className="max-w-prose text-center text-sm text-ink-2">
        Point the giver&apos;s camera at this. It opens Bank Rock with your address already filled
        in — no typing, no pasting.
      </p>
    </div>
  );
}
