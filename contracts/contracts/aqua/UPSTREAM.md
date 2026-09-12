# Vendored 1inch Aqua sources

Everything under `src/`, `examples/` and `vendor/` in this directory is **third-party code,
copied verbatim**. Do not edit it. If it needs to change, re-vendor from upstream and update this
file.

## Aqua

| | |
| --- | --- |
| Upstream | <https://github.com/1inch/aqua> |
| Commit | `9c5c42e5840e8741fba3597c48456c9510212b66` (2026-08-21, `fix(DOPS-2602): update GitHub Actions to Node 24 compatible versions`) |
| Retrieved | 2026-09-12, `git clone --depth 1` |
| License | `LicenseRef-Degensoft-Aqua-Source-1.1` — full text in [`LICENSE-Aqua-Source-1.1.txt`](./LICENSE-Aqua-Source-1.1.txt) |
| Attribution | Aqua — © Degensoft Ltd 2025 |

| Vendored file | Upstream path | Byte-identical | Deployed by us |
| --- | --- | --- | --- |
| `src/Aqua.sol` | `src/Aqua.sol` | yes | **no — tests only** |
| `src/AquaApp.sol` | `src/AquaApp.sol` | yes | no (base contract) |
| `src/interfaces/IAqua.sol` | `src/interfaces/IAqua.sol` | yes | no |
| `src/libs/Balance.sol` | `src/libs/Balance.sol` | yes | no |
| `examples/apps/XYCSwap.sol` | `examples/apps/XYCSwap.sol` | yes | **yes** |
| `examples/apps/interfaces/IXYCSwapCallback.sol` | `examples/apps/interfaces/IXYCSwapCallback.sol` | yes | no |

`Aqua.sol` is vendored **for tests only**. On Ethereum Sepolia we use the canonical deployment at
`0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` (spec 16 §1.1, 5,619 bytes, bytecode identical to
mainnet). No deployment script in this repository deploys `Aqua`, and none ever should.

`examples/apps/XYCSwap.sol` **is** deployed by us — `scripts/deploy-aqua-app.js` — because 1inch
publishes no XYCSwap deployment on any network. Its constructor takes the Aqua address, so the
deployed instance is bound to the canonical Aqua. This is the spec 04 fallback path (D-023
amendment): a reference AquaApp with zero custom strategy logic.

## 1inch solidity-utils

`vendor/1inch-solidity-utils/` holds the eight files Aqua's imports reach for, copied from npm
`@1inch/solidity-utils@6.9.7` (MIT, © 2019 1inch — [`LICENSE.md`](./vendor/1inch-solidity-utils/LICENSE.md)),
at their published paths:

```
contracts/libraries/Transient.sol          contracts/interfaces/IDaiLikePermit.sol
contracts/libraries/TransientLock.sol      contracts/interfaces/IPermit2.sol
contracts/libraries/SafeERC20.sol          contracts/interfaces/IERC7597Permit.sol
contracts/libraries/RevertReasonForwarder.sol
contracts/interfaces/IWETH.sol
```

They are vendored rather than installed because the npm package declares an `exports` map that
does not expose `contracts/**`, so Hardhat 3 refuses to resolve
`@1inch/solidity-utils/contracts/libraries/TransientLock.sol` from `node_modules` (`HHE902`). The
project's `remappings.txt` maps the import prefix onto this directory, which keeps every vendored
Aqua file byte-identical — no import line is rewritten anywhere.

## What is *not* vendored

`src/AquaRouter.sol` (Aqua + Simulator/Multicall/Rescuable, already deployed on Sepolia at
`0x4999…6d31`), the upstream Foundry tests, and the SwapVM repository. Our tests are written in
the Hardhat 3 Solidity style used by `test/BankRockRegistry.t.sol`.

## Our own code in this directory

`XYCSwapTaker.sol` is Bank Rock's, not 1inch's. It is the taker-side periphery XYCSwap's callback
design requires (see the contract's own header and [`NOTES.md`](./NOTES.md) §5). It carries the
Aqua Source license because it composes with the Licensed Work (Aqua-Source-1.1 §1.7, §3.1) and
that license's copyleft clause reaches such compositions.

## License obligations we are relying on

- §2.1 grants use, copying and distribution of **unmodified** source. That is what `src/` and
  `examples/` are.
- §2.2 "Pure Caller Use" covers the web app: it forms calldata and reads state through published
  ABIs. It stops being Pure Caller Use if we charge fees or cross a Commercial Trigger
  (§5.2: >US$100,000 charged fees in a rolling year, or >US$10,000,000 liquidity under control).
  A testnet hackathon demo is far below both, and Bank Rock charges nothing — the swap fee in a
  strategy accrues to the rock owner's own reserve, not to us.
- §2.4 requires preserving notices and attributing "Aqua — © Degensoft Ltd 2025" wherever this
  work is published. Every vendored file keeps its original SPDX and copyright headers.
