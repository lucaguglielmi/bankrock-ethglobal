# Verifying `BankRockRegistry` on Sepolia Etherscan

Verification is a separate step from deployment on purpose: `scripts/deploy.js` must not depend on
an Etherscan API key, and a failed verification must not leave you unsure whether the contract is
deployed. Deploy first, confirm `deployments/sepolia.json` exists, then verify.

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

## Option C — the Etherscan UI

Use the standard-JSON-input route rather than flattening; the contract imports OpenZeppelin and a
flattened file will drift from the compiled input. The exact input Hardhat used is in
`contracts/artifacts/build-info/*.json` under the `input` key:

```sh
cd contracts
node -e "
  const fs = require('node:fs'), path = require('node:path');
  const dir = 'artifacts/build-info';
  const file = fs.readdirSync(dir).filter(f => f.endsWith('.json'))[0];
  const input = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')).input;
  fs.writeFileSync('standard-input.json', JSON.stringify(input));
  console.log('wrote contracts/standard-input.json');
"
```

Upload `standard-input.json` at *Contract → Verify and Publish → Solidity (Standard-Json-Input)*,
select compiler `v0.8.24`, and paste the ABI-encoded constructor arguments.
`standard-input.json` is a scratch file — delete it afterwards, it is not meant to be committed.

## Confirming it worked

```sh
ADDRESS=$(node -p "require('./deployments/sepolia.json').address")
curl -s "https://sepolia.etherscan.io/address/$ADDRESS" -o /dev/null -w '%{http_code}\n'
cast code "$ADDRESS" --rpc-url "$SEPOLIA_RPC_URL" | head -c 20   # must not be 0x
```

The definition-of-done check in spec 15 Part 7 is the `cast code` line: it must return non-empty
bytecode at the address the app is configured with.
