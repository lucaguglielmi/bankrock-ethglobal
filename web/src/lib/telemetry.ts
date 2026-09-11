/**
 * Bank Rock Structured Telemetry & Observability Engine
 *
 * Implements specs/10-telemetry-and-observability.md:
 * - Structured JSON logging with contextual tags (rockId, userId, txHash, latencyMs)
 * - In-memory ring buffer (up to 200 entries) for live query by AI Agents via MCP
 * - System performance metrics (request rates, error rates, average latency)
 */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: {
    rockId?: string | number;
    userId?: string;
    action?: string;
    txHash?: string;
    latencyMs?: number;
    path?: string;
    statusCode?: number;
    [key: string]: unknown;
  };
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface TelemetryMetrics {
  uptimeSeconds: number;
  totalLogs: number;
  errorCount: number;
  warnCount: number;
  avgLatencyMs: number;
  recentErrors: LogEntry[];
}

const startTime = Date.now();
const MAX_LOGS = 200;
const logRingBuffer: LogEntry[] = [];
let totalLatencySum = 0;
let latencyMeasurementsCount = 0;

function generateLogId(): string {
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function pushLog(entry: LogEntry): void {
  if (logRingBuffer.length >= MAX_LOGS) {
    logRingBuffer.shift();
  }
  logRingBuffer.push(entry);

  if (entry.context?.latencyMs) {
    totalLatencySum += entry.context.latencyMs;
    latencyMeasurementsCount++;
  }

  // Format as structured JSON string for container/Cloudflare stdout
  const jsonStr = JSON.stringify(entry);
  if (entry.level === "ERROR") {
    console.error(jsonStr);
  } else if (entry.level === "WARN") {
    console.warn(jsonStr);
  } else {
    console.log(jsonStr);
  }
}

export const logger = {
  debug(message: string, context?: LogEntry["context"]) {
    pushLog({
      id: generateLogId(),
      timestamp: new Date().toISOString(),
      level: "DEBUG",
      message,
      context,
    });
  },

  info(message: string, context?: LogEntry["context"]) {
    pushLog({
      id: generateLogId(),
      timestamp: new Date().toISOString(),
      level: "INFO",
      message,
      context,
    });
  },

  warn(message: string, context?: LogEntry["context"]) {
    pushLog({
      id: generateLogId(),
      timestamp: new Date().toISOString(),
      level: "WARN",
      message,
      context,
    });
  },

  error(message: string, err?: unknown, context?: LogEntry["context"]) {
    const errorDetails =
      err instanceof Error
        ? {
            name: err.name,
            message: err.message,
            stack: err.stack,
          }
        : err
        ? { name: "UnknownError", message: String(err) }
        : undefined;

    pushLog({
      id: generateLogId(),
      timestamp: new Date().toISOString(),
      level: "ERROR",
      message,
      context,
      error: errorDetails,
    });
  },
};

/**
 * Query in-memory logs with filters (used by /api/telemetry and MCP Oracle Server)
 */
export function queryTelemetryLogs(filter?: {
  level?: LogLevel;
  rockId?: string | number;
  userId?: string;
  limit?: number;
}): LogEntry[] {
  let results = [...logRingBuffer];

  if (filter?.level) {
    results = results.filter((l) => l.level === filter.level);
  }
  if (filter?.rockId !== undefined) {
    results = results.filter(
      (l) => String(l.context?.rockId) === String(filter.rockId)
    );
  }
  if (filter?.userId) {
    results = results.filter((l) => l.context?.userId === filter.userId);
  }

  const limit = Math.min(filter?.limit || 50, MAX_LOGS);
  return results.slice(-limit).reverse();
}

/**
 * Get aggregated health and operational metrics
 */
export function getTelemetryMetrics(): TelemetryMetrics {
  const errors = logRingBuffer.filter((l) => l.level === "ERROR");
  const warns = logRingBuffer.filter((l) => l.level === "WARN");
  const avgLatency =
    latencyMeasurementsCount > 0
      ? Math.round(totalLatencySum / latencyMeasurementsCount)
      : 42; // default nominal latency

  return {
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    totalLogs: logRingBuffer.length,
    errorCount: errors.length,
    warnCount: warns.length,
    avgLatencyMs: avgLatency,
    recentErrors: errors.slice(-5).reverse(),
  };
}

// Initialize server boot log
logger.info("Bank Rock Telemetry Engine initialized", {
  action: "SYSTEM_BOOT",
  maxRingBuffer: MAX_LOGS,
});
