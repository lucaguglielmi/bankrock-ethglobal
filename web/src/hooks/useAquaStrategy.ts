"use client";

/**
 * A rock's Aqua position: actual balances, per-stream virtual balances, what is executable right
 * now, and fees earned.
 *
 * It reads `GET /api/rocks/[id]/strategy`, not the chain directly, for one reason: the server has
 * the provider RPC (`SEPOLIA_RPC_URL`). The browser would fall back to viem's public endpoint,
 * which rate-limits and refuses wide `eth_getLogs` (X-5), and a rate-limited read must not look
 * like an empty position.
 *
 * Everything is capability-shaped (D-013). While the first read is in flight the capability is
 * UNAVAILABLE with a "reading" reason, so check `isLoading` before rendering `reason`, or the
 * first frame will explain that something is missing when it is merely in flight. Refetches keep
 * the last good value, so the 15-second poll never flashes an empty state.
 *
 * What the consuming card must not do (spec 04, `contracts/aqua/NOTES.md` §7):
 *   - never add two streams' virtual balances together and label the result capital;
 *   - never show `virtual` as what a visitor can trade — that is `executable`;
 *   - never annualise the fee figure into an APY (D-004).
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";
import { unavailable, type Capability } from "@/lib/demo";
import { parseStrategyView, type ParsedStrategyView, type RockStrategyViewJson } from "@/lib/aqua";

const REFETCH_MS = 15_000;

export type StrategyView = ParsedStrategyView;
export type { ParsedStream } from "@/lib/aqua";

export interface UseAquaStrategyResult {
  strategy: Capability<StrategyView>;
  isLoading: boolean;
  refresh: () => void;
}

export function aquaStrategyQueryKey(rockId: string, maker?: Address) {
  return ["aqua-strategy", rockId, maker ?? "registry"] as const;
}

type StrategyResponse =
  | { state: "REAL"; rockId: string; value: RockStrategyViewJson }
  | { state: "UNAVAILABLE"; rockId: string; reason: string };

async function fetchStrategy(
  rockId: string,
  maker?: Address,
): Promise<Capability<StrategyView>> {
  const query = maker ? `?maker=${maker}` : "";
  let response: Response;
  try {
    response = await fetch(`/api/rocks/${encodeURIComponent(rockId)}/strategy${query}`, {
      headers: { accept: "application/json" },
    });
  } catch {
    return unavailable("The strategy could not be read: the application is unreachable");
  }

  if (!response.ok) {
    return unavailable(`The strategy could not be read (HTTP ${response.status})`);
  }

  let body: StrategyResponse;
  try {
    body = (await response.json()) as StrategyResponse;
  } catch {
    return unavailable("The strategy endpoint returned something that is not JSON");
  }

  if (body.state !== "REAL") {
    return unavailable(body.reason ?? "This rock has no live Aqua strategy");
  }

  try {
    return { state: "REAL", value: parseStrategyView(body.value) };
  } catch (err) {
    return unavailable(
      `The strategy response could not be read: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * @param rockId the public rock id.
 * @param maker  the Rock Account. Optional — the server resolves it from the registry when the
 *               caller does not know it yet.
 */
export function useAquaStrategy(rockId: string, maker?: Address): UseAquaStrategyResult {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: aquaStrategyQueryKey(rockId, maker),
    queryFn: () => fetchStrategy(rockId, maker),
    enabled: rockId.trim() !== "",
    refetchInterval: REFETCH_MS,
    staleTime: REFETCH_MS,
    // `fetchStrategy` resolves with UNAVAILABLE instead of throwing, so a retry would only repeat
    // a configuration error. The 15-second poll is the retry.
    retry: false,
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: aquaStrategyQueryKey(rockId, maker) });
  }, [queryClient, rockId, maker]);

  return {
    strategy: query.data ?? unavailable("Reading this rock's Aqua strategy…"),
    isLoading: query.isPending,
    refresh,
  };
}
