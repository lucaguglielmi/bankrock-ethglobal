# How Bank Rock uses Privy

*The short explanation for the ETHGlobal submission form. Under 250 words; paste as is.*

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

**Gifting.** Handing the rock to someone hands them the account: the recipient signs in with
Privy, taps the rock, and a pre-signed owner swap moves the Safe to their new embedded wallet with
zero gas.

Privy contributes sign-in, the wallet, the signature that authorises every financial action, and
the savings rail; Aqua contributes the liquidity. Neither the NFC tag nor Bank Rock ever holds a
key or a balance.
