/**
 * GET /api/telemetry - operator log view (SA-2, SA-3).
 *
 *  - it was public. It served wallet addresses, NFC UIDs, full recipient email addresses and
 *    error stacks to anyone. It now requires `x-admin-key: <ADMIN_API_KEY>`, compared in constant
 *    time, and an unset key is a 503 rather than an open door (D-017);
 *  - entries are redacted before they reach the buffer (see lib/telemetry), so even an
 *    authenticated operator does not get raw PII;
 *  - POST is **removed**. It accepted arbitrary log injection from anyone, and the MCP server
 *    reads this buffer and relays it to an AI agent - that was a prompt-injection path into the
 *    user's agent (SA-3). Server code calls `logger` directly; nothing needs an ingest endpoint.
 */

import { NextResponse } from "next/server";
import { requireAdminApiKey } from "@/lib/secure";
import { getTelemetryMetrics, queryTelemetryLogs, type LogLevel } from "@/lib/telemetry";

const LEVELS = new Set<LogLevel>(["DEBUG", "INFO", "WARN", "ERROR"]);

export async function GET(req: Request) {
  const guard = requireAdminApiKey(req);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(req.url);

  if (searchParams.get("metrics") === "true") {
    return NextResponse.json({
      state: "REAL",
      data: getTelemetryMetrics(),
      timestamp: new Date().toISOString(),
    });
  }

  const levelParam = searchParams.get("level")?.toUpperCase();
  const level = levelParam && LEVELS.has(levelParam as LogLevel) ? (levelParam as LogLevel) : undefined;
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 50;

  const logs = queryTelemetryLogs({
    level,
    rockId: searchParams.get("rockId") || undefined,
    userId: searchParams.get("userId") || undefined,
    limit: Number.isFinite(limit) ? limit : 50,
  });

  return NextResponse.json({
    state: "REAL",
    count: logs.length,
    logs,
    timestamp: new Date().toISOString(),
  });
}
