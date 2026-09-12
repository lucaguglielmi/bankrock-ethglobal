# Verifying the contracts on Sepolia Etherscan

Verification is a separate step from deployment on purpose: the deploy scripts must not depend on
an Etherscan API key, and a failed verification must not leave you unsure whether the contract is
deployed. Deploy first, confirm `deployments/*.json` exist, then verify.

## The one command (Fact, 2026-09-12)

```sh
cd contracts
ETHERSCAN_API_KEY=... npm run verify:sepolia
```

`scripts/verify-sepolia.mjs` verifies all three contracts — `BankRockRegistry`, `XYCSwap` and
`XYCSwapTaker` — from `deployments/sepolia.json` and `deployments/sepolia-aqua-app.json`. It sends
Etherscan the exact standard-JSON compiler input Hardhat used (`artifacts/build-info/<id>.json`,
the id named in each artifact), so no compiler setting is restated anywhere and what is verified
is what was deployed. It checks that the on-chain code length equals the artifact's, skips a
contract Etherscan already shows verified, and polls until Etherscan answers. The registry's
`initialOwner` argument is read from the deploy transaction's sender.

On 2026-09-12 it verified all three at the first attempt:

| Contract | Address |
| --- | --- |
| `BankRockRegistry` | [`0x2A3101Fc525C6DBEc39bef45034E23b13f28F757`](https://sepolia.etherscan.io/address/0x2A3101Fc525C6DBEc39bef45034E23b13f28F757#code) |
| `XYCSwap` | [`0x8a293F43Eb0DBaA834b40b2eC4E0751e3ce6316B`](https://sepolia.etherscan.io/address/0x8a293F43Eb0DBaA834b40b2eC4E0751e3ce6316B#code) |
| `XYCSwapTaker` | [`0xCd7899E37D50B226E882e79572AB189080fD0016`](https://sepolia.etherscan.io/address/0xCd7899E37D50B226E882e79572AB189080fD0016#code) |

The rest of this file is the manual playbook, kept for the case where the script cannot be used.

## What you need

| Value | Where it comes from |
| --- | --- |
| `ETHERSCAN_API_KEY` | etherscan.io → account → API keys. One key works across Etherscan v2 chains. |
| Registry address | `address` in `contracts/deployments/sepolia.json` |
| Constructor arguments | `initialOwner` = the deployer address, `initialAttester` = `attester` in the same file |

The compiler settings must match what produced the deployed bytecode. They are in
`hardhat.config.js` and must not be edited between deploying and verifying:

- solc `0.8.24`
- optimizer enabled, `runs: 200`
- `evmVersion: "cancun"` (OpenZeppelin 5.6 emits `mcopy`)

## Option A — Hardhat (preferred)

The verify plugin is not installed by default, because it is only needed once per deployment.

```sh
cd contracts
npm install --no-save @nomicfoundation/hardhat-verify
```

Add the plugin and the Etherscan block to `hardhat.config.js` **temporarily** (do not commit an
API key; read it from the environment):

```js
import hardhatVerify from "@nomicfoundation/hardhat-verify";

export default {
  plugins: [hardhatVerify],
  verify: {
    etherscan: { apiKey: process.env.ETHERSCAN_API_KEY },
  },
  // ...the rest of the existing config, unchanged
};
```

Then, reading both constructor arguments out of the deployment record so nothing is retyped:

```sh
cd contracts
ADDRESS=$(node -p "require('./deployments/sepolia.json').address")
ATTESTER=$(node -p "require('./deployments/sepolia.json').attester")
OWNER=$(node -p "require('viem/accounts').privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY).address")

ETHERSCAN_API_KEY=... npx hardhat verify --network sepolia "$ADDRESS" "$OWNER" "$ATTESTER"
```

`OWNER` is the deployer address — `scripts/deploy.js` passes it as `initialOwner`. If ownership has
since been transferred with `Ownable.transferOwnership`, verification still needs the **original**
constructor argument, not the current owner.

## Option B — Foundry, if it is already installed

```sh
cd contracts
ADDRESS=$(node -p "require('./deployments/sepolia.json').address")
ATTESTER=$(node -p "require('./deployments/sepolia.json').attester")
OWNER=$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")

forge verify-contract "$ADDRESS" \
  contracts/BankRockRegistry.sol:BankRockRegistry \
  --chain-id 11155111 \
  --compiler-version v0.8.24 \
  --num-of-optimizations 200 \
  --constructor-args "$(cast abi-encode 'constructor(address,address)' "$OWNER" "$ATTESTER")" \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  --watch
```

## Option C — the Etherscan UI (standard JSON input)

Use the standard-JSON-input route rather than flattening: every one of these contracts imports
something (OpenZeppelin for the registry, the vendored Aqua sources for the app and the taker) and
a flattened file drifts from the compiled input.

**Select the build-info by contract, never by position.** The project compiles with two compilers
— 0.8.24 for the registry, 0.8.30 + viaIR for the Aqua pair — so `artifacts/build-info/` holds
several files and directory order is undefined. Taking the first one hands Etherscan the wrong
compiler's input and produces a confusing failure at the worst moment.

```sh
cd contracts
# One of:
#   contracts/BankRockRegistry.sol
#   contracts/aqua/examples/apps/XYCSwap.sol
#   contracts/aqua/XYCSwapTaker.sol
TARGET=contracts/BankRockRegistry.sol

TARGET="$TARGET" node -e "
  const fs = require('node:fs'), path = require('node:path');
  const dir = 'artifacts/build-info';
  const target = process.env.TARGET;
  const match = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => ({ f, bi: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }))
    .find(({ bi }) => bi.input && bi.input.sources && bi.input.sources[target] !== undefined);
  if (!match) {
    console.error('no build-info contains ' + target + ' — run \'npm run compile\' first.');
    process.exit(1);
  }
  const { input, solcLongVersion } = match.bi;
  fs.writeFileSync('standard-input.json', JSON.stringify(input));
  console.log('wrote contracts/standard-input.json from ' + match.f);
  console.log('compiler: v' + solcLongVersion);
  console.log('sources : ' + Object.keys(input.sources).length + ' files (vendored dependencies included)');
"
```

Upload `standard-input.json` at *Contract → Verify and Publish → Solidity (Standard-Json-Input)*,
select the compiler version the command printed, and paste the ABI-encoded constructor arguments
from the table below. The vendored Aqua sources are part of the same standard-JSON input and are
verified together with the contract that imports them — there is nothing separate to do for them.

`standard-input.json` is a scratch file. Delete it afterwards; it is not meant to be committed.

---

## The Aqua pair — `XYCSwap` and `XYCSwapTaker`

Both come from `scripts/deploy-aqua-app.js` and are recorded in
`contracts/deployments/sepolia-aqua-app.json`. Their compiler settings differ from the registry's
and are pinned in `hardhat.config.js`:

- solc `0.8.30`
- optimizer enabled, `runs: 10000000`
- `viaIR: true`
- `evmVersion: "cancun"`

| Contract | Source path | Constructor |
| --- | --- | --- |
| `XYCSwap` | `contracts/aqua/examples/apps/XYCSwap.sol` | `constructor(IAqua aqua)` |
| `XYCSwapTaker` | `contracts/aqua/XYCSwapTaker.sol` | `constructor(IAqua aqua, XYCSwap app)` |

`XYCSwapTaker` takes **two** arguments. The app address is the `XYCSwap` deployed in the same run:
since the hardening pass the periphery is bound to one app for life, so the pair must be verified
with the app address that `deployments/sepolia-aqua-app.json` records, not with any other.

```sh
cd contracts
AQUA=$(node -p "require('./deployments/sepolia-aqua-app.json').aqua")
APP=$(node -p "require('./deployments/sepolia-aqua-app.json').app.address")
TAKER=$(node -p "require('./deployments/sepolia-aqua-app.json').taker.address")

# Constructor arguments, ABI-encoded (Foundry):
cast abi-encode 'constructor(address)' "$AQUA"                 # XYCSwap
cast abi-encode 'constructor(address,address)' "$AQUA" "$APP"  # XYCSwapTaker
```

With the Hardhat plugin, the same two deployments:

```sh
ETHERSCAN_API_KEY=... npx hardhat verify --network sepolia \
  --contract contracts/aqua/examples/apps/XYCSwap.sol:XYCSwap "$APP" "$AQUA"

ETHERSCAN_API_KEY=... npx hardhat verify --network sepolia \
  --contract contracts/aqua/XYCSwapTaker.sol:XYCSwapTaker "$TAKER" "$AQUA" "$APP"
```

`--contract` matters here: two compilers produce two build-infos, and without it the plugin has to
guess which artifact a given address corresponds to.

## Confirming it worked

```sh
cd contracts
ADDRESS=$(node -p "require('./deployments/sepolia.json').address")
curl -s "https://sepolia.etherscan.io/address/$ADDRESS" -o /dev/null -w '%{http_code}\n'
cast code "$ADDRESS" --rpc-url "$SEPOLIA_RPC_URL" | head -c 20   # must not be 0x
```

The definition-of-done check in spec 15 Part 7 is the `cast code` line: it must return non-empty
bytecode at the address the app is configured with.

After verification, the manual check spec 19 Part 2 asks for: open the registry on Etherscan, read
`describeRock(1)` and `version()`, and confirm every Write-tab field is self-explanatory. The
walkthrough is in `contracts/README.md`.
