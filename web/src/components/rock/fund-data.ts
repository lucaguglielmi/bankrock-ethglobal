/**
 * What the "Fund this rock" sheet puts on screen — addresses only, no numbers.
 *
 * Funding a rock on Sepolia is an ordinary transfer to the Rock Account: no bridge, no route, no
 * quote (Flow B step 9; spec 16 Part 3). The three things an operator needs are the account to
 * send to, the two token contracts that identify what to send, and a link to check the transfer
 * landed. This module assembles exactly those, capability-shaped: an address that is not
 * configured or not yet known produces UNAVAILABLE naming what is missing, never a placeholder.
 *
 * It is pure so it can be tested without a browser: the caller passes the addresses it read from
 * `lib/chain`, which stays the only module allowed to hold one (D-015). Balances are *not* here —
 * they are a live read the sheet takes from the page's own `reserves` capability.
 */

import { zeroAddress } from "viem";
import { explorer } from "@/lib/chain";
import { real, unavailable, type Capability } from "@/lib/demo";

export interface FundingTarget {
  /** What this address is, in the reader's words. */
  label: string;
  /** One line saying why it is on screen. */
  hint: string;
  address: string;
  /** Sepolia Etherscan, from `lib/chain`. */
  explorerHref: string;
}

export interface FundingTargets {
  /** Where to send tokens. */
  rockAccount: Capability<FundingTarget>;
  /** The two token contracts, so the right asset is sent and can be added to a wallet. */
  tokens: Capability<FundingTarget>[];
}

export interface FundingTargetsInput {
  /** The Rock Account from the registry. Absent while the rock has none. */
  rockAccount?: string;
  /** `tokens.USDC.address` — undefined when NEXT_PUBLIC_USDC_ADDRESS is unset. */
  usdc?: string;
  /** `tokens.WETH.address` — undefined when NEXT_PUBLIC_WETH_ADDRESS is unset. */
  weth?: string;
}

export const NO_ROCK_ACCOUNT_REASON =
  "This rock has no account yet, so there is nowhere to send tokens";

/** The zero address is "no account", not an account. It is never offered as a destination. */
const ZERO_ADDRESS: string = zeroAddress;

function tokenTarget(
  symbol: "USDC" | "WETH",
  address: string | undefined,
  envName: string,
): Capability<FundingTarget> {
  if (!address || address.toLowerCase() === ZERO_ADDRESS) {
    return unavailable(`${envName} is not configured, so the ${symbol} contract cannot be shown`);
  }
  return real({
    label: symbol,
    hint: `The ${symbol} contract on Sepolia — send this token, not one that shares its name`,
    address,
    explorerHref: explorer.address(address),
  });
}

export function fundingTargets(input: FundingTargetsInput): FundingTargets {
  const account = input.rockAccount;
  const rockAccount: Capability<FundingTarget> =
    !account || account.toLowerCase() === ZERO_ADDRESS
      ? unavailable(NO_ROCK_ACCOUNT_REASON)
      : real({
          label: "This rock's account",
          hint: "Send USDC or WETH here. Only this rock's owner can move what arrives.",
          address: account,
          explorerHref: explorer.address(account),
        });

  return {
    rockAccount,
    tokens: [
      tokenTarget("USDC", input.usdc, "NEXT_PUBLIC_USDC_ADDRESS"),
      tokenTarget("WETH", input.weth, "NEXT_PUBLIC_WETH_ADDRESS"),
    ],
  };
}
