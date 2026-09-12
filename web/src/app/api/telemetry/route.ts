import { NextResponse } from "next/server";
import { queryTelemetryLogs, getTelemetryMetrics, logger, type LogLevel } from "@/lib/telemetry";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const metricsOnly = searchParams.get("metrics") === "true";

  if (metricsOnly) {
    return NextResponse.json({
      success: true,
      data: getTelemetryMetrics(),
      timestamp: new Date().toISOString(),
    });
  }

  const level = (searchParams.get("level")?.toUpperCase() as LogLevel) || undefined;
  const rockId = searchParams.get("rockId") || undefined;
  const userId = searchParams.get("userId") || undefined;
  const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 50;

  const logs = queryTelemetryLogs({
    level,
    rockId,
    userId,
    limit,
  });

  return NextResponse.json({
    success: true,
    count: logs.length,
    logs,
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as any;
    const { level, message, context, error } = body;

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    if (level === "ERROR") {
      logger.error(message, error, context);
    } else if (level === "WARN") {
      logger.warn(message, context);
    } else if (level === "DEBUG") {
      logger.debug(message, context);
    } else {
      logger.info(message, context);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("Failed to ingest client telemetry", err);
    return NextResponse.json({ error: "Failed to record telemetry" }, { status: 500 });
  }
}
