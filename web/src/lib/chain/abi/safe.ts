/**
 * The slice of a Safe's `OwnerManager` the application reads.
 *
 * It is the browser-side twin of `contracts/contracts/interfaces/ISafeOwnerManager.sol`, which the
 * registry staticcalls in `_accountAnswersTo` to decide whether a Rock Account still answers to a
 * rock's owner. Asking the account the same question the chain asks is how the app establishes
 * authority for an awakened rock (D-037) instead of re-deriving an address the registry may no
 * longer name.
 *
 * Read-only by construction: there is no `addOwner`, `removeOwner` or `swapOwner` here. The one
 * write the app ever makes to a Safe's owner set is the pre-signed `swapOwner` of Flow E, which
 * has its own single-function ABI next to the code that encodes it (`lib/rock-account.ts`).
 */
export const SAFE_OWNER_MANAGER_ABI = [
  {
    type: "function",
    name: "isOwner",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getOwners",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
  },
] as const;
