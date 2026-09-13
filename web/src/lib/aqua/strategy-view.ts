/**
 * A rock's live Aqua position, as JSON — the one read behind `GET /api/rocks/[id]/strategy` and
 * the hosted MCP tools.
 *
 * The route used to own this sequence (resolve the maker from the registry, probe the streams,
 * scan `Pushed` events for realised fees, serialise). The MCP endpoint runs inside the same
 * Worker and cannot call the route over HTTP — `global_fetch_strictly_public` in wrangler.jsonc
 * blocks a Worker from fetching its own hostname — so the sequence lives here and both call it.
 * One implementation keeps D-030's strategy encoding and D-019's honesty rules in one place.
 *
 * Every branch that cannot produce a real number says so instead of producing one (D-013): the
 * result is `REAL` with the serialised view, or `UNAVAILABLE` with the reason.
 */

import { getAddress, zeroAddress, type Address, type Hex } from "viem";
import { real, unavailable, type Capability } from "@/lib/demo";
import { readRock } from "@/lib/rock-account";
import { logger } from "@/lib/telemetry";
import { getAppDeployBlock } from "./config";
import { readAccruedFees, readRockStreams } from "./read";
import {
  serializeFees,
  serializeStrategyView,
  type AccruedFeesJson,
  type RockStrategyViewJson,
} from "./serialize";
import { DEFAULT_STREAMS } from "./strategy";

export interface ReadRockStrategyViewParams {
  /** Already validated by the caller (`parseRockId`). */
  rockId: string;
  /** The Rock Account. Resolved from the registry when omitted. */
  maker?: Address;
  /** Which streams to probe. Defaults to the catalogue, `DEFAULT_STREAMS`. */
  streams?: ReadonlyArray<{ streamIndex: number; feeBps: number; label?: string }>;
  /** Scan Aqua's own `Pushed` events for realised fees (one more `eth_getLogs`). Default true. */
  fees?: boolean;
}

/** The reason `readRock` returned something other than a readable record. */
export const ROCK_RECORD_NOT_READABLE_REASON = "This rock's record is not readable";
export const NO_ROCK_ACCOUNT_STRATEGY_REASON =
  "This rock has no Rock Account yet, so it has no strategy";
export const STRATEGY_READ_FAILED_REASON = "The Aqua strategy could not be read from the chain";
export const FEES_NEED_DEPLOY_BLOCK_REASON =
  "Set AQUA_APP_DEPLOY_BLOCK to read fees earned since the app was deployed";

export async function readRockStrategyView(
  params: ReadRockStrategyViewParams,
): Promise<Capability<RockStrategyViewJson>> {
  // Who the maker is: the caller may say, or the registry can.
  let maker: Address;
  if (params.maker) {
    maker = getAddress(params.maker);
  } else {
    const rock = await readRock(params.rockId);
    if (rock.state !== "REAL") {
      return unavailable(
        rock.state === "UNAVAILABLE" ? rock.reason : ROCK_RECORD_NOT_READABLE_REASON,
      );
    }
    if (!rock.value.smartAccount || rock.value.smartAccount === zeroAddress) {
      return unavailable(NO_ROCK_ACCOUNT_STRATEGY_REASON);
    }
    maker = rock.value.smartAccount;
  }

  try {
    const view = await readRockStreams({
      rockId: params.rockId,
      maker,
      streams: params.streams ?? DEFAULT_STREAMS,
    });
    if (view.state === "UNAVAILABLE") return unavailable(view.reason);

    // Fees are read from Aqua's own Pushed events (contracts/aqua/NOTES.md §6). The scan is
    // skipped rather than approximated when it cannot be bounded or the RPC refuses the range.
    const fees = new Map<Hex, AccruedFeesJson | string>();
    if (params.fees !== false) {
      if (getAppDeployBlock() === undefined) {
        for (const stream of view.value.streams) {
          fees.set(stream.strategyHash, FEES_NEED_DEPLOY_BLOCK_REASON);
        }
      } else {
        for (const stream of view.value.streams) {
          const accrued = await readAccruedFees({
            maker,
            app: view.value.app,
            strategyHash: stream.strategyHash,
            feeBps: stream.feeBps,
          });
          fees.set(
            stream.strategyHash,
            accrued.state === "UNAVAILABLE" ? accrued.reason : serializeFees(accrued.value),
          );
        }
      }
    }

    return real(serializeStrategyView(view.value, fees));
  } catch (error) {
    logger.error("Error reading the Aqua strategy", error, { rockId: params.rockId });
    return unavailable(STRATEGY_READ_FAILED_REASON);
  }
}
