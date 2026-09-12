# Bank Rock keeper — a simulation

**This Gelato Web3 Function does not rebalance anything. It never will in its current form, and
it is not wired to a funded Gelato task.** It is kept in the repository because the rebalancing
story is part of the product narrative and because the shape of the eventual function is useful
to have written down — not because it works.

Spec 15 Part 8 lists "keeper rebalancing" as one of the capabilities that stays `DEMO` after the
exit from demo mode. This file is that entry.

## What it actually does

On each run it:

1. reads `getRock(rockId)` from `BankRockRegistry` to find the rock's Rock Account and confirm
   the rock is awake;
2. reads that account's USDC balance and its native ETH balance;
3. returns `canExec: false` with a message stating both figures and stating that it is a
   simulation.

Every number in that message came from an RPC call. Nothing is invented. But no number is acted
on, and step 3 is the only branch: **there is no code path that returns `canExec: true`.**

## What was removed, and why

The previous revision encoded a call to `rebalance(address,bytes32)` on
`0x1111111254EEB25477B68fb85Ed929f73A960582` and returned it as executable calldata. Three things
were wrong with that, recorded as fact X-7 in spec 15:

- that address is the 1inch Aggregation Router **v5 on Ethereum mainnet**, labelled in the code
  as "1inch v6 on Base Sepolia";
- the router has no `rebalance` function, on that chain or any other, so the call could only
  revert;
- the strategy hash passed as its second argument was `bytes32(0)`, commented as the "Standard
  50/50 Strategy Hash", which is not a thing that exists.

It also read Base **mainnet** USDC against a Sepolia registry, and treated the Rock Account's
native ETH balance as if it were WETH. A funded Gelato task pointed at this function would have
burned gas on reverting transactions and reported a portfolio composition that was partly
fictional.

The fabricated call is deleted rather than repaired, because the correct call is not yet known —
see below. The mainnet token address is gone, and ETH is now reported as ETH.

The hardcoded alert endpoint is also gone (decision D-022). It pointed at a domain that is not
the canonical origin and that nobody on this project controls. The alert URL now comes from the
`ALERT_API_URL` secret, and if that secret is unset the function logs and moves on rather than
calling an origin out of thin air.

## What it would take to make this real

In dependency order. Items 1 and 2 are Phase 3 of spec 15 and are not this function's work —
they are prerequisites it is blocked on.

1. **An Aqua integration that exists.** A Rock Account must have actually shipped a strategy:
   `Aqua.ship(app, strategy, [USDC, WETH], [a, b])` against the real Aqua deployment at
   `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` on Ethereum Sepolia, with a `SwapVMRouter`
   deployed by us as the app. Until a `strategyHash` exists for a rock, there is nothing to
   rebalance and no `dock`/`ship` pair to call.

2. **A way to read virtual balances.** The rebalance decision compares the strategy's virtual
   reserves — `Aqua.safeBalances(rockAccount, app, strategyHash, USDC, WETH)` — against the
   account's actual token balances. This function currently reads only the second of those,
   which is why it cannot compute a meaningful deviation. Spec 04 is explicit that the two must
   not be summed or conflated.

3. **A price source that works on Sepolia.** The deviation threshold is expressed in percent of
   portfolio value, so the ETH leg needs a price. The 1inch Swap API serves mainnets only
   (spec 16 §1.4), so the previous `QUOTE_API_URL` approach cannot work here. The candidate is
   `SwapVMRouter.quote()` — a view against the shipped strategy, which by construction agrees
   with what `swap()` would execute. A Chainlink ETH/USD feed on Sepolia is the fallback.

4. **An authorization path for a keeper.** This is the hard part, and it is a security decision,
   not an integration detail. Gelato executes as an arbitrary EOA. For it to move a Rock
   Account's funds, the Rock Account must grant it something. The architecture's answer
   (spec 03, spec 05, decision D-010) is an ERC-7579 scoped session key module on the Safe,
   bounded so that the keeper can re-ship a strategy on Aqua and nothing else — no transfers, no
   approvals to new spenders, no calls outside Aqua. **That module is cut from MVP scope**
   (spec 15 Part 6). Until it exists, the only honest keeper is one that proposes and does not
   execute.

   A keeper that could move funds without a bounded session key would be a worse security
   posture than the arbitrary-call `executeTrade` that decision D-020 just removed from the
   registry. It is not a shortcut worth taking.

5. **Then, and only then:** the executable branch returns `canExec: true` with calldata for a
   UserOperation that the session key can sign, targeting Aqua — not a swap router.

## Configuration

All values are Gelato task secrets. None has a default and none is compiled in.

| Secret | Required | Meaning |
| --- | --- | --- |
| `REGISTRY_ADDRESS` | yes | `BankRockRegistry` on Ethereum Sepolia — the output of `contracts/scripts/deploy.js`. |
| `USDC_ADDRESS` | yes | Circle testnet USDC on Sepolia (spec 16 §1.1). |
| `ROCK_ID` | no | Rock to inspect. Defaults to `1`. |
| `ALERT_API_URL` | no | Full URL of the alert endpoint, e.g. `https://bank-rock.com/api/alerts/gelato`. Unset means alerts are skipped. |

With `REGISTRY_ADDRESS` or `USDC_ADDRESS` unset, the function returns `canExec: false` and says
it is unconfigured. It does not guess.

## Running it

```sh
cd web3-functions/bankrock-keeper
npm ci
npx w3f test index.ts --logs
```

There is no CI job for this directory: it has no tests and nothing depends on it building. If it
ever stops being a simulation, that changes.
