"use client";

/**
 * Reads one rock: its registry record and its Rock Account's token reserves.
 *
 * Both are capability-shaped (D-013). Nothing here ever substitutes a value: an unset registry
 * address, a malformed rock id, an unreachable RPC and a dormant rock each produce UNAVAILABLE
 * with the reason the UI should render.
 *
 * `isLoading` is true for the first read. While it is true the capabilities are UNAVAILABLE with
 * a "reading" reason - check `isLoading` before rendering a reason, or the first frame will
 * explain that something is missing when it is merely in flight. Subsequent refetches keep the
 * last successful value, so a 15-second poll does not flash an empty state.
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { unavailable, type Capability } from "@/lib/demo";
import {
  readReserves,
  readRock,
  type RockRecord,
  type RockReserves,
} from "@/lib/rock-account";
import { useDemoRock } from "@/demo/rock-420/context";
import { useDemoRockRead } from "@/demo/rock-420/hooks";

const REFETCH_MS = 15_000;

export type { RockRecord, RockReserves, RockState } from "@/lib/rock-account";

export interface UseRockResult {
  rock: Capability<RockRecord>;
  reserves: Capability<RockReserves>;
  isLoading: boolean;
  refresh: () => void;
}

export function rockQueryKey(rockId: string) {
  return ["rock", rockId] as const;
}

export function reservesQueryKey(smartAccount: string | undefined) {
  return ["rock-reserves", smartAccount ?? "none"] as const;
}

/**
 * The seam for the demo rock (`web/src/demo/rock-420`, DEMO-STATE.md S-5). Inside
 * `DemoRockProvider` for rock #420 the answer comes from the browser's demo state and the chain
 * is never asked; everywhere else this is exactly `useChainRock`. Both hooks run on every render,
 * so the hook order is the same whichever rock is open.
 */
export function useRock(rockId: string): UseRockResult {
  const demo = useDemoRock();
  const mock = useDemoRockRead();
  const chain = useChainRock(rockId, demo === null);
  return demo ? mock : chain;
}

function useChainRock(rockId: string, enabled: boolean): UseRockResult {
  const queryClient = useQueryClient();

  const rockQuery = useQuery({
    queryKey: rockQueryKey(rockId),
    queryFn: () => readRock(rockId),
    enabled,
    refetchInterval: REFETCH_MS,
    staleTime: REFETCH_MS,
    // `readRock` resolves with UNAVAILABLE instead of throwing, so a retry would only repeat a
    // configuration error. The 15-second poll is the retry.
    retry: false,
  });

  const rock: Capability<RockRecord> =
    rockQuery.data ?? unavailable("Reading the registry…");

  const smartAccount = rock.state === "REAL" ? rock.value.smartAccount : undefined;
  const isDormant = rock.state === "REAL" && rock.value.state === "dormant";

  const reservesQuery = useQuery({
    queryKey: reservesQueryKey(smartAccount),
    queryFn: () => readReserves(smartAccount),
    enabled: enabled && Boolean(smartAccount) && !isDormant,
    refetchInterval: REFETCH_MS,
    staleTime: REFETCH_MS,
    retry: false,
  });

  const reserves: Capability<RockReserves> = isDormant
    ? unavailable("This rock has not been awakened, so it holds nothing")
    : rock.state !== "REAL"
      ? unavailable(rock.state === "UNAVAILABLE" ? rock.reason : "Reading the registry…")
      : (reservesQuery.data ?? unavailable("Reading token balances…"));

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: rockQueryKey(rockId) });
    queryClient.invalidateQueries({ queryKey: reservesQueryKey(smartAccount) });
  }, [queryClient, rockId, smartAccount]);

  return {
    rock,
    reserves,
    isLoading: rockQuery.isPending || (reservesQuery.isPending && reservesQuery.isFetching),
    refresh,
  };
}
