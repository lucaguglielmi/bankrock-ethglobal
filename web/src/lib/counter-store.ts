import { logger } from "./telemetry";

export interface CounterCheckResult {
  valid: boolean;
  previousCounter: number;
  newCounter: number;
  reason?: string;
}

// In-memory atomic store for local dev or edge fallback
const memoryCounterStore = new Map<string, number>();

/**
 * Validates that an incoming NFC tap contains a strictly greater read counter (SDMReadCtr)
 * than the last recorded counter for the given tag UID.
 * 
 * Supports:
 * 1. Upstash Redis REST API (atomic Lua script) if UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set.
 * 2. In-memory atomic store with CAS for local dev / fallback.
 */
export async function verifyAndIncrementCounter(
  rockId: string | number,
  uid: string,
  incomingCounter: number
): Promise<CounterCheckResult> {
  const normalizedUid = uid.toUpperCase().replace(/[^A-F0-9]/g, "");
  const key = `ntag_counter:${normalizedUid}`;

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  // 1. If Upstash Redis is configured, execute atomic conditional update via REST
  if (redisUrl && redisToken) {
    try {
      // Atomic Lua script:
      // If current value exists and incomingCounter <= current, return {0, current}
      // Else set new value and return {1, current or 0}
      const luaScript = `
        local cur = redis.call('GET', KEYS[1])
        if cur then
          local curNum = tonumber(cur)
          local inNum = tonumber(ARGV[1])
          if inNum <= curNum then
            return {0, curNum}
          end
        end
        redis.call('SET', KEYS[1], ARGV[1])
        return {1, cur and tonumber(cur) or 0}
      `;

      const res = await fetch(`${redisUrl}/eval`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${redisToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([luaScript, 1, key, incomingCounter]),
      });

      if (res.ok) {
        const data = await res.json() as { result?: [number, number] };
        if (data.result && Array.isArray(data.result)) {
          const [successCode, prev] = data.result;
          const isSuccess = successCode === 1;

          if (!isSuccess) {
            logger.warn("NFC replay attack detected via Redis counter store", {
              action: "NFC_REPLAY_DETECTED",
              rockId,
              uid: normalizedUid,
              incomingCounter,
              previousCounter: prev,
            });

            return {
              valid: false,
              previousCounter: prev,
              newCounter: incomingCounter,
              reason: `Replay detected: Counter ${incomingCounter} <= recorded counter ${prev}`,
            };
          }

          logger.info("NFC counter atomically updated in Redis", {
            action: "NFC_COUNTER_VERIFIED",
            rockId,
            uid: normalizedUid,
            incomingCounter,
            previousCounter: prev,
          });

          return {
            valid: true,
            previousCounter: prev,
            newCounter: incomingCounter,
          };
        }
      }
    } catch (err) {
      logger.error("Error connecting to Redis counter store, using atomic fallback", err, {
        rockId,
        uid: normalizedUid,
      });
    }
  }

  // 2. In-memory atomic fallback
  const lastCounter = memoryCounterStore.get(key) ?? 0;

  if (incomingCounter <= lastCounter) {
    logger.warn("NFC replay detected via atomic memory store", {
      action: "NFC_REPLAY_DETECTED",
      rockId,
      uid: normalizedUid,
      incomingCounter,
      previousCounter: lastCounter,
    });

    return {
      valid: false,
      previousCounter: lastCounter,
      newCounter: incomingCounter,
      reason: `Replay detected: Counter ${incomingCounter} is not greater than ${lastCounter}`,
    };
  }

  // Atomically update
  memoryCounterStore.set(key, incomingCounter);

  logger.info("NFC counter verified and incremented (in-memory store)", {
    action: "NFC_COUNTER_VERIFIED",
    rockId,
    uid: normalizedUid,
    incomingCounter,
    previousCounter: lastCounter,
  });

  return {
    valid: true,
    previousCounter: lastCounter,
    newCounter: incomingCounter,
  };
}

/**
 * Returns the current recorded counter for an NTAG chip.
 */
export async function getRecordedCounter(uid: string): Promise<number> {
  const normalizedUid = uid.toUpperCase().replace(/[^A-F0-9]/g, "");
  const key = `ntag_counter:${normalizedUid}`;

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (redisUrl && redisToken) {
    try {
      const res = await fetch(`${redisUrl}/get/${key}`, {
        headers: { Authorization: `Bearer ${redisToken}` },
      });
      if (res.ok) {
        const json = await res.json() as { result?: string | null };
        if (json.result) {
          return parseInt(json.result, 10);
        }
      }
    } catch (err) {
      // Fallback
    }
  }

  return memoryCounterStore.get(key) ?? 0;
}
