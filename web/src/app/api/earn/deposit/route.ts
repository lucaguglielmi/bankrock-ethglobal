/**
 * POST /api/earn/deposit — forwards a wallet-signed deposit into the configured vault.
 *
 * See `lib/earn/write-route.server.ts` for the checks; this file only names the action.
 */

import { handleEarnWrite } from "@/lib/earn/write-route.server";

export async function POST(req: Request) {
  return handleEarnWrite(req, "deposit");
}
