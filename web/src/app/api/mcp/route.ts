/**
 * `/api/mcp` — the hosted Model Context Protocol endpoint (spec 11 §5; D-008, D-019).
 *
 * This is the URL a person pastes into ChatGPT (Developer mode → custom connector), claude.ai or
 * the Claude apps (Settings → Connectors → Add custom connector), Claude Code
 * (`claude mcp add --transport http`) or Cursor. It speaks Streamable HTTP: a client POSTs a
 * JSON-RPC message and gets a JSON answer. It is public and unauthenticated on purpose — every
 * tool reads state that the rock pages already show to anyone — and it holds no key.
 *
 *   POST    the whole protocol: initialize, tools/list, tools/call
 *   GET     405 — this server opens no server-to-client stream, which the protocol allows
 *   DELETE  405 — stateless: there is no session to terminate
 *
 * Metered like the other public reads (audit P-10), a little more generously because one
 * conversation makes several calls and the clients connect from shared egress addresses. A read
 * route fails open when the limiter cannot be consulted (P-11, documented in lib/rate-limit.ts).
 */

import { NextResponse } from "next/server";
import { handleMcpRequest } from "@/lib/mcp/server";
import { consumeIpRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Calls per client address per minute. A tool call costs the same reads as one page view. */
export const MCP_RATE_LIMIT = 120;

export async function POST(req: Request) {
  const limit = await consumeIpRateLimit(req, "mcp", MCP_RATE_LIMIT, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32000, message: "Too Many Requests" }, id: null },
      { status: 429, headers: { "retry-after": "60" } },
    );
  }
  return handleMcpRequest(req);
}

function notOffered(what: string) {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: `${what}. This is the Bank Rock MCP endpoint: POST JSON-RPC here, or read /mcp for how to connect a client.`,
      },
      id: null,
    },
    { status: 405, headers: { allow: "POST" } },
  );
}

/** No standalone SSE stream: nothing here is pushed to a client between its own requests. */
export async function GET() {
  return notOffered("This endpoint offers no server-to-client stream");
}

/** Stateless: no session was issued, so there is none to end. */
export async function DELETE() {
  return notOffered("This endpoint issues no session");
}
