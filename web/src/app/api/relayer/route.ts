/**
 * GET /api/relayer — is claim relaying configured?
 *
 * The gift-claim path needs an operator key to pay gas for a recipient who has none. The client
 * has no way to know whether that key exists, and it must not offer a "claim your rock" button
 * that can only fail. This answers the capability question and nothing else: the relayer's
 * address, balance and key are never disclosed.
 */

import { NextResponse } from "next/server";
import { relayerAccount } from "@/lib/rock-account.server";

export async function GET() {
  const relayer = relayerAccount();

  if (relayer.state === "UNAVAILABLE") {
    return NextResponse.json({ state: "UNAVAILABLE", reason: relayer.reason });
  }

  return NextResponse.json({ state: "REAL" });
}
