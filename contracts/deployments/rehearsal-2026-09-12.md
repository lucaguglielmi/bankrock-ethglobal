# Live Sepolia rehearsal — 2026-09-12

Produced by `web/scripts/rehearse-sepolia.ts` (spec 20 WP-2). Every hash below came from a
bundler or an RPC that accepted the transaction; every assertion was read back from chain.

- registry `0x2A3101Fc525C6DBEc39bef45034E23b13f28F757` (block 11689716)
- XYCSwap app `0x8a293F43Eb0DBaA834b40b2eC4E0751e3ce6316B` (block 11689724)
- XYCSwapTaker `0xCd7899E37D50B226E882e79572AB189080fD0016`
- Aqua `0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a`, USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, WETH `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`
- tag uid hash `0xe19caf55e454a3fb29fb5463a4de38bcf085fe729d8679e52d72a2a374c11735` (synthetic, generated for this run)
- owner A `0x3c2b4c42dF9C7a7e2C16a94b7D7944796518b5Cf`, taker B `0xA840907BE9c426807Fe6f8A70a273915a700a418`, recipient C `0xCD8a2d61C3a5049423c5ED2192c02Ad7803a6bA2`

## Steps

```
step                     tx / userOp hash                                                                                                                                                                                              gas sponsor                  elapsed
-----------------------  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------  ---------------------------  -------
1 awaken rock 1          0x9393fde4ee631f477634c51559711ec29035fefa7a81d071aa61394f474f008e                                                                                                                                            Pimlico paymaster            13.6s
2 ship strategy          0x61389e102c63470d4bed112694a0c641bb3e70a5c9665bf5d5bb438399ceff15                                                                                                                                            Pimlico paymaster            47.3s
3 visitor swap           0x2ab70a3c27a0aa1ea719f2e843ac4cd4c1eb53b43b449fab2cbe3a1fca751761                                                                                                                                            Pimlico paymaster            26.8s
4 gift to C              0x5e4c51a43f4f8ab8f6b9cc5091a1b3b2718ea825c70cb17a88c917fd8f1e5cad → 0x47e60bd1ad459ed732768da1d2c9750f9194328e3cc58383fd023b844b2c003d → 0x31d6723a36e5c41d5fee529940ad293560a1c35187fdc4c270e4e7dca1483879  Pimlico paymaster + relayer  33.1s
5 archive and re-awaken  0x48ee8361046f4b41c8d5db3a0a792b4739d5564fa2a613af247c434a7cb7cf5b → 0xcd7cc60ace44a06509a5d5d028b14df5b265f24138dbabbdb04792202ddc7164                                                                       Pimlico paymaster            27.2s
```

## Full output

```
Bank Rock — live Sepolia rehearsal
repository /home/user/bankrock-ethglobal
rpc        SEPOLIA_RPC_URL
bundler    Pimlico (PIMLICO_API_KEY)
tokens     NEXT_PUBLIC_USDC_ADDRESS from web/.env.example; NEXT_PUBLIC_WETH_ADDRESS from web/.env.example
ATTESTATION_SIGNER_PRIVATE_KEY configured → 0xF27ccB37FCDab74116D4Ad8E1F980879e6D979a4
RELAYER_PRIVATE_KEY            configured → 0x767D9348fDFF689289850410dB339407Bd0c5430
REHEARSAL_FUNDER_PRIVATE_KEY   configured → 0x767D9348fDFF689289850410dB339407Bd0c5430

Preflight — what is deployed, and who signs
-------------------------------------------
  ok    the RPC serves chain 11155111, which is the chain the deployment records name
  ok    registry 0x2A3101Fc525C6DBEc39bef45034E23b13f28F757 has 8783 bytes of code
  ok    XYCSwap app 0x8a293F43Eb0DBaA834b40b2eC4E0751e3ce6316B has 3778 bytes of code
  ok    XYCSwapTaker 0xCd7899E37D50B226E882e79572AB189080fD0016 has 3393 bytes of code
  ok    Aqua 0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a has 5619 bytes of code
  ok    USDC 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 has 1798 bytes of code
  ok    WETH 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14 has 3124 bytes of code
  registry version 1.0.0
  ok    the registry is not paused
  ok    the registry's attester is 0xF27ccB37FCDab74116D4Ad8E1F980879e6D979a4, the address the deployment record names
  ok    the attestation signer is the registry's attester (0xF27ccB37FCDab74116D4Ad8E1F980879e6D979a4)
  funder 0x767D9348fDFF689289850410dB339407Bd0c5430: 0.045 ETH, 20 USDC, 0 WETH
  relayer 0x767D9348fDFF689289850410dB339407Bd0c5430: 0.045 ETH
  ok    the funder holds the 2.25 USDC this run moves
  ok    the funder holds ETH for gas, and for wrapping into WETH if WETH is short
  ok    the relayer holds ETH to pay for the claim
  tag uid hash 0xe19caf55e454a3fb29fb5463a4de38bcf085fe729d8679e52d72a2a374c11735
  owner A      0x3c2b4c42dF9C7a7e2C16a94b7D7944796518b5Cf
  taker B      0xA840907BE9c426807Fe6f8A70a273915a700a418
  recipient C  0xCD8a2d61C3a5049423c5ED2192c02Ad7803a6bA2
  the registry has seen counter 0 for this tag; the run starts at 1

Step 1 — a tap awakens a rock (sponsored UserOp from the Rock Account)
----------------------------------------------------------------------
  rock id 1 is dormant in the registry
  Rock Account for (this tag, owner A) is 0xef4A8C2986681aa20C2A8eaA63377ce3DEC60438
  attestation counter 1, deadline 1789248755
  ok    the app's own attestation check accepts this tap
  awakenRock calldata 420 bytes
  ok    the account the bundler will send from is the account the attestation names
  userOp  0xe4b0acffc1e06ed6ddf581b90a6b0a0a215993b63897bdded85a1e3ffa89767d
  tx      0x9393fde4ee631f477634c51559711ec29035fefa7a81d071aa61394f474f008e
  ok    rock 1 is owned by A
  ok    the registry records the derived Rock Account
  ok    the rock is awake
  ok    the tag is bound to this rock

Step 2 — the rock is funded and ships a liquidity stream
--------------------------------------------------------
  stream 0 (Wide, 30 bps) → 0x28e00ff230c24f3c96fdc79bd27bdcaae7308fadb22a55a5e9a0649ea8610937
  ok    the strategy the batch ships is the one this script computed
  ship batch: 3 calls (approve USDC → Aqua, approve WETH → Aqua, ship)
  the funder is short 0.001 WETH — wrapping that much ETH
  tx      0x49af895ece59456458d6f88fdb4fb7966cccf5f7282c2599d9969dfc8e5d01e4  (WETH.deposit)
  tx      0x9f54fa700a29ab5bffb1b9fcabd19e7313b917980021efc2a03eb0a805afe6cc  (fund USDC)
  tx      0x62570b5620eb25c5e330a41748ef4abc1d8d2c527cb606fb0bddf30a696632a7  (fund WETH)
  ok    the Rock Account holds 2 USDC
  ok    the Rock Account holds 0.001 WETH
  userOp  0x02519aecc5f0e9d2202af08eacaab8e3bb6d57a8d09b2affe27ea90c3eac35fb
  tx      0x61389e102c63470d4bed112694a0c641bb3e70a5c9665bf5d5bb438399ceff15
  ok    Aqua emitted `Shipped` for this rock's strategy
  ok    safeBalances reports the shipped reserve: 2 USDC / 0.001 WETH

Step 3 — a visitor swaps against the rock (sponsored batch from their own Safe)
-------------------------------------------------------------------------------
  B's personal Safe is 0x7D3560B0d50472269aa249950f8A71e91F17A571
  selling 0.25 USDC quotes 0.000110814716016449 WETH; floor 0.000109706568856284 WETH; fee slice 0.00075 USDC
  ok    the fee slice is amountIn · feeBps / 10000, the unpriced part of the input
  ok    the swap goes through the XYCSwapTaker periphery the deployment names
  tx      0x4ad27b281b214964f4e0f44a999006413c94a3098e6379ed64c5b6cab7e65543  (fund B's Safe with USDC)
  ok    the Safe the bundler sends from is the one that was funded
  userOp  0xba847ce583bf904fe1d84a99d39003ccb38a7e447d23d936870a446f1c4b40de
  tx      0x2ab70a3c27a0aa1ea719f2e843ac4cd4c1eb53b43b449fab2cbe3a1fca751761
  executed: 0.25 USDC in, 0.000110814716016449 WETH out
  ok    the output cleared the floor the taker signed for
  ok    the whole gross input landed in the rock's own wallet (+0.25 USDC), fee included
  ok    the rock paid out 0.000110814716016449 WETH from its own wallet
  ok    the visitor's Safe received exactly what Aqua reported
  ok    Aqua's `Pushed` names the gross 0.25 USDC; the 0.00075 USDC fee stays inside the rock's reserve

Step 4 — A gives the rock to C (owner swap first, then the claim)
-----------------------------------------------------------------
  initiateHandover to 0xCD8a2d61C3a5049423c5ED2192c02Ad7803a6bA2, expires 1789251843
  pre-signed Safe.swapOwner calldata 100 bytes
  userOp  0x588d2fcbd94821ec3d9c3f98e091503f7efd33ac734d8fee692522b7a1ef8927
  tx      0x5e4c51a43f4f8ab8f6b9cc5091a1b3b2718ea825c70cb17a88c917fd8f1e5cad
  ok    the registry reports a gift waiting
  ok    the gift names C, so an owner swap can be pre-signed for it (open gifts cannot be — D-032)
  ok    the stored operation's sender is this rock's Rock Account
  ok    the app resolves the claim's Rock Account to the one the registry holds
  ok    the server accepts C's attestation (the route's first check)
  tx      0x47e60bd1ad459ed732768da1d2c9750f9194328e3cc58383fd023b844b2c003d  (Safe.swapOwner, pre-signed by A)
  ok    the Safe answers to C *before* the registry claim is broadcast (D-032)
  tx      0x31d6723a36e5c41d5fee529940ad293560a1c35187fdc4c270e4e7dca1483879  (claimHandover, relayed)
  ok    the registry owner is C
  ok    the rock is awake again, with no gift outstanding
  ok    the Rock Account address did not move, so the rock's money stayed exactly where it was
  ok    the Safe's only owner is C

Step 5 — C retires the rock from its own account, and the same tag awakens the next one
---------------------------------------------------------------------------------------
  ok    C's own derivation for this tag (0x0D02188e337131CF45c49d963C57180bfCDFD56a) is not this rock's account (0xef4A8C2986681aa20C2A8eaA63377ce3DEC60438) — which is why the app reads the account instead of deriving it (D-037)
  ok    the registry still records C as the owner going into the retirement
  ok    the app takes the Rock Account from the registry record
  ok    it is the account the rock has had since it was awakened, unchanged by the gift
  ok    the account itself is asked whether it answers to C
  ok    it does — the pre-signed owner swap of step 4 is what made it so
  ok    so the app authorises C's owner actions
  ok    and it sends them from the rock's own account, which is what the registry's owner gate admits
  ok    the bundler will send from the rock's account, not from anything C derives
  userOp  0xff105c32d838953a205b646d7c8bc3e0b32a27b1efe404777530578e7e1d6c26
  tx      0x48ee8361046f4b41c8d5db3a0a792b4739d5564fa2a613af247c434a7cb7cf5b
  C never held a wei of gas: the retirement was sponsored, exactly as it is in the app
  ok    rock 1 is archived
  ok    archiving released the tag, so it can back a new rock
  the retired rock's account still holds 2.25 USDC and 0.000889185283983551 WETH, and C owns it
  ok    a retired rock offers no further owner action, and the app says why: "This rock is retired, so it has no owner actions left"
  ok    the next tap resolves to the account (this tag, C) derives, deterministically
  ok    the new Rock Account is the counterfactual address the attestation names
  userOp  0x1f3885ae366f0066e8289fbedfbef35a335f7dc5bc7c06110c1b93811c33e4f7
  tx      0xcd7cc60ace44a06509a5d5d028b14df5b265f24138dbabbdb04792202ddc7164
  ok    rock 2 is owned by C
  ok    the same tag awakened a new rock id into the Rock Account its owner derives
  ok    which is a different account from the retired rock's: a gifted rock's reserve does not follow the tag into the next rock
  ok    the new rock carries the same tag

Summary
-------
step                     tx / userOp hash                                                                                                                                                                                              gas sponsor                  elapsed
-----------------------  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------  ---------------------------  -------
1 awaken rock 1          0x9393fde4ee631f477634c51559711ec29035fefa7a81d071aa61394f474f008e                                                                                                                                            Pimlico paymaster            13.6s
2 ship strategy          0x61389e102c63470d4bed112694a0c641bb3e70a5c9665bf5d5bb438399ceff15                                                                                                                                            Pimlico paymaster            47.3s
3 visitor swap           0x2ab70a3c27a0aa1ea719f2e843ac4cd4c1eb53b43b449fab2cbe3a1fca751761                                                                                                                                            Pimlico paymaster            26.8s
4 gift to C              0x5e4c51a43f4f8ab8f6b9cc5091a1b3b2718ea825c70cb17a88c917fd8f1e5cad → 0x47e60bd1ad459ed732768da1d2c9750f9194328e3cc58383fd023b844b2c003d → 0x31d6723a36e5c41d5fee529940ad293560a1c35187fdc4c270e4e7dca1483879  Pimlico paymaster + relayer  33.1s
5 archive and re-awaken  0x48ee8361046f4b41c8d5db3a0a792b4739d5564fa2a613af247c434a7cb7cf5b → 0xcd7cc60ace44a06509a5d5d028b14df5b265f24138dbabbdb04792202ddc7164                                                                       Pimlico paymaster            27.2s
```
