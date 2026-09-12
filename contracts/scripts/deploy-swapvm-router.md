# Deploying a SwapVM router to Sepolia — the optional second path

**Status: documented, not done.** Bank Rock ships on the reference `XYCSwap` AquaApp
(`contracts/aqua/`, spec 04's D-023 fallback). This file is what it would take to move to the
SwapVM router instead, and what the move would change in the app. Nothing here has been executed.

Everything below was read on 2026-09-12 from `github.com/1inch/swap-vm` at commit
`afd99c408b4ed610027f4426c6f98650acac9f5f` (2026-09-09) — a shallow clone, not from memory.

## Why it is optional

Spec 15 Phase 3 step 1 asks for this router; step 2 allows the `XYCSwap` fallback if the strategy
encoding costs more than a day. The encoding turned out **not** to be the blocker (see "The E-4
hypothesis is now a fact" below) — but the router is 20 KB of virtual machine we would deploy,
verify and learn, against 5 KB of constant-product app that maps directly onto spec 04's chosen
strategy. The fallback was taken on that basis, not on the encoding.

## Facts that correct the specs

| Spec | Says | Actually |
| --- | --- | --- |
| 15 Phase 3 step 1 | deploy `SwapVMRouter` from `ignition/modules/SwapVMRouter.ts` | For Aqua-shipped strategies the contract is **`AquaSwapVMRouter`** (`ignition/modules/AquaSwapVMRouter.ts`). Plain `SwapVMRouter` has no `AquaOpcodes`, so it cannot read or move Aqua balances. Three modules exist: `SwapVMRouter`, `AquaSwapVMRouter`, `LimitSwapVMRouter`. |
| 16 §1.2 | `hardhat.config.ts` configures only `localhost`; a `sepolia` entry must be added | Still true at `afd99c4`. The repo's own `DEPLOY.md` claims `localhost`, `sepolia` and `mainnet` are configured; the config file has only `localhost`. Believe the config. |
| 16 §1.2 | constructor `(aqua, weth, owner, name, version)` | Confirmed, `contracts/routers/AquaSwapVMRouter.sol`. All five are Ignition parameters with no defaults; a missing one fails validation before any transaction. |
| 16 §1.5 item 4 | *hypothesis*: `strategy` is the ABI-encoded order and `strategyHash == swapVM.hash(order)` | **Confirmed.** See below. |
| 04 "Quoting" | `SwapVMRouter.quote()` | Real signature is `quote(Order order, uint256 amount, bytes takerTraitsAndData) view returns (uint256 amountIn, uint256 amountOut, bytes32 orderHash)`. `web/src/lib/chain/abi/swapvm.ts` currently guesses `quote(address,address,uint256) → uint256`; that ABI is wrong and must be replaced if this path is taken. |

## The E-4 hypothesis is now a fact

`test/solidity/base/AquaStrategyBuilders.sol::shipStrategy`:

```solidity
bytes32 orderHash = swapVM.hash(order);
vm.prank(maker); tokenIn.approve(address(aqua), type(uint256).max);
vm.prank(maker); tokenOut.approve(address(aqua), type(uint256).max);
bytes memory strategy = abi.encode(order);
vm.prank(maker);
bytes32 strategyHash = aqua.ship(address(swapVM), strategy, [tokenIn, tokenOut], [balanceIn, balanceOut]);
vm.assume(strategyHash == orderHash);
```

So, for an Aqua-mode order:

- `strategy = abi.encode(ISwapVM.Order{ address maker; MakerTraits traits; bytes data })`;
- `strategyHash = keccak256(strategy) = swapVM.hash(order)` — `ISwapVM.hash` documents itself as
  "EIP-712 hash for signature-based orders **or `keccak256(abi.encode(order))` for Aqua orders**";
- the order must be built with `useAquaInsteadOfSignature: true` in `MakerTraitsLib.Args`, which
  is what makes Aqua rather than a maker signature the authority;
- the maker still approves **Aqua**, exactly as on the XYCSwap path.

What remains unsolved is the *program*: `order.data` carries SwapVM bytecode assembled by
`ProgramBuilder`/the instruction contracts (`XYCSwap`, `XYCConcentrate`, `Salt`, `FeeFlatIn`) in
**Solidity**. `@1inch/swap-vm` is still not on npm (the repo's `package.json` has no `main` or
`exports`), so program bytes have to come from a committed Foundry/Hardhat script output or a
TypeScript port of the builder. That is the real cost of this path.

## Steps, if it is taken

```bash
# 1. Clone the unmodified source.
git clone --depth 1 https://github.com/1inch/swap-vm
cd swap-vm && yarn install

# 2. Add a sepolia network. hardhat.config.ts ships with `localhost` only; add, inside `networks`:
#
#      sepolia: {
#        type: "http",
#        url: configVariable("SEPOLIA_RPC_URL"),
#        accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
#        chainId: 11155111,
#      },
#
#    Hardhat 3 does not read .env; export the variables or use `npx hardhat keystore set …`.
export SEPOLIA_RPC_URL=https://…
export SEPOLIA_PRIVATE_KEY=0x…
export ETHERSCAN_API_KEY=…        # v2 key, one works for every chain

# 3. Fill in ignition/parameters/chain-11155111.json. It ships with zero placeholders for
#    `aqua` and `owner`; `weth` is already the Sepolia WETH we use.
#      aqua    0x1111113ccf1426a8e30e2bff5e005d929bf6a90a   (canonical, spec 16 §1.1)
#      weth    0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14   (pre-filled, same address we use)
#      owner   <our deployer>                               (rescue-funds role only)
#      name    "SwapVMRouter"                               (EIP-712 domain name, leave as shipped)
#      version "1.2.0"                                      (EIP-712 domain version, as shipped)

# 4. Deploy the Aqua-capable router (NOT plain SwapVMRouter).
npx hardhat ignition deploy ignition/modules/AquaSwapVMRouter.ts \
  --network sepolia \
  --parameters ignition/parameters/chain-11155111.json

# 5. Verify, and record the address.
npx hardhat verify --network sepolia <address> <constructor args…>
#   → NEXT_PUBLIC_SWAPVM_ROUTER_ADDRESS=<address>
```

There is no CREATE2 factory in the module, so the deployed address is **not** the canonical
`0x111111338c…ac0de` and must be treated as ours (D-015: it comes from the environment).

Compiler settings are the repo's own: solc 0.8.30, `viaIR`, optimizer 700 runs, `isolated: true`.
Do not change them, or verification will not match.

## What would change in `web/src/lib/aqua`

The library is deliberately split so this is a contained swap:

| File | Change |
| --- | --- |
| `strategy.ts` | `encodeStrategy` builds `abi.encode(Order{maker, traits, data})` instead of `abi.encode(XYCSwap.Strategy)`. The rock-id salt survives — SwapVM has a `Salt` instruction for exactly this, so the rock id goes into the program rather than into a struct field. `strategyHash` stays `keccak256(strategy)`, which is `swapVM.hash(order)`. |
| **new** `program.ts` | The missing piece: a TypeScript port of the constant-product `ProgramBuilder` output, or a loader for bytes committed by a Foundry script. Nothing else can be done until this exists. |
| `calls.ts` | `buildShipCalls` is unchanged except for the app address — it still approves Aqua and calls `Aqua.ship`. `buildSwapCall` targets `router.swap(order, amount, takerTraitsAndData)`; `takerTraitsAndData` has to be packed per `contracts/libs/TakerTraits.sol`. Whether an EOA can be the taker directly (the upstream tests route through a taker helper contract, and there is a `DirectModeTaker.sol` helper) must be settled before `XYCSwapTaker` can be dropped. |
| `quote.ts` | Deleted, or demoted to a display-only estimate. The router's `quote()` view becomes the only quote, which is what spec 04 wanted in the first place. |
| `read.ts` | Unchanged. `safeBalances` and `balanceOf` are protocol-level and know nothing about the app. |
| `events.ts` | Unchanged — they are Aqua's events, not the app's. |
| `web/src/lib/chain/abi/swapvm.ts` | Replace the placeholder `quote` ABI with the real `ISwapVM` ABI from the compiled artifact, and drop `SWAPVM_QUOTE_ABI_IS_HYPOTHESIS`. |

The contracts side needs no new Bank Rock code: nothing of ours would be vendored, since the
router is deployed from its own repository and only its ABI and address reach us.

## License

SwapVM is `LicenseRef-Degensoft-SwapVM-1.1` — the same shape as the Aqua Source license (see
`contracts/aqua/UPSTREAM.md`): unmodified use and deployment are granted, modifications are
copyleft, and commercial triggers apply well above anything a testnet demo reaches.
