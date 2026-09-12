# How Bank Rock uses Privy

*The short explanation for the ETHGlobal submission form. One paragraph per Privy product; paste as is, or only the paragraphs for the prize you are entering.*

Bank Rock is a handmade NFC rock that is the physical interface to a self-custodial account. Privy
is how a person becomes that account's owner without ever seeing a wallet.

**Embedded wallets.** Tapping a rock opens its page; signing in with email, Google or Apple gives
the visitor a Privy embedded wallet on the spot. That wallet is the *sole owner* of the rock's
smart account — a Safe on Ethereum Sepolia — so the person controls the rock's reserve and its
1inch Aqua market-making strategy, and Bank Rock's servers cannot move a thing. Every owner action
is authenticated with the Privy access token, verified server-side against Privy's JWKS.

**Earn.** The dollars that are not trading do not sit still. From the same sign-in, *Savings*
puts USDC into a Morpho vault through **Privy Earn**: add, take out, and see what the vault has
actually paid. Each deposit and withdrawal is signed by the user's own wallet with a Privy
**user authorization signature** and forwarded unchanged; the app secret cannot move money on its
own. Gas is sponsored, so a person who has never held ETH can save.

**What we deliberately do not show:** a rate. The only yield figure on screen is *earned so far*,
read from Privy's position — a fact, not a forecast.

**Universal deposit addresses.** Money comes in from anywhere: *Add from any wallet, exchange or
chain* asks Privy for a deposit address, and whatever arrives — from an exchange, from Arbitrum,
from Solana — is converted on arrival into USDC on Base in the person's wallet, ready to save. No
bridge screen, no network switch, no gas. The simulated bridge this replaced is deleted.

**Agent Wallet CLI.** A rock is a market maker, so a machine can trade with it. An AI agent reads
the skill at bank-rock.com/agent/SKILL.md, gets a wallet through Privy's Agent Wallet CLI, quotes
the rock through the public API, and sends the approval and the swap itself — two ordinary
transactions on Sepolia, signed in Privy's enclave under a human's one-time approval. The rock's
owner earns the fee.

**Gifting.** Handing the rock to someone hands them the account: the recipient signs in with
Privy, taps the rock, and a pre-signed owner swap moves the Safe to their new embedded wallet with
zero gas.

Privy contributes sign-in, the wallet, the signature that authorises every financial action, the
savings rail, the deposit rail and the agent's wallet; Aqua contributes the liquidity. Neither the NFC tag nor Bank Rock ever holds a
key or a balance.
