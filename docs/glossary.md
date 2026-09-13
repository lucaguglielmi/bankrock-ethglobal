# Glossary

Every word Bank Rock uses that a first-time visitor might not know, with one plain sentence each.
This is the same text the app shows when a term is tapped or hovered: the source of truth is
[`web/src/lib/ui/glossary.ts`](../web/src/lib/ui/glossary.ts), rendered by `<Term k="…">`
(`web/src/components/ui/term.tsx`), and this page mirrors it for readers of the repository.

Rules for an entry: one sentence; no jargon inside the definition; say what the thing is *for a
rock*; never a yield or a rate of return (D-004); never "deposit" for starting a strategy, because
nothing is deposited (D-030); say what a thing *cannot* do when that is the point.

## The object and the tap

| Term | Meaning |
| --- | --- |
| **Bank Rock** | A real stone with a small chip inside; tapping it with a phone opens its page, where its tokens can be seen, traded with or given away. |
| **NFC tag** | The tiny chip inside the rock that a phone can read from a few centimetres away; it holds a web link and nothing else. |
| **NTAG 424 DNA** | The model of chip in every rock; it writes a fresh signed code into its link on every tap, so a copied link cannot be reused. |
| **tap** | Holding a phone against the rock so the chip's link opens in the browser; it is how every rock is opened. |
| **read counter** | A number inside the chip that goes up by one on every tap; our server accepts a tap only if its number is higher than the last one it saw. |
| **signed code** (CMAC) | A check code the chip computes with a secret key that never leaves it; a wrong key or an altered link fails the check. |
| **Verified Physical** | The badge that means our server checked the chip's signed code and it was fresh; a copied link can never earn it. |
| **copied link** | A tap link opened a second time, in another browser or later; it fails the check because its counter was already used. |
| **attestation** | A short signed note from our server saying that a genuine tap happened for a named wallet; the contracts accept it in place of the tap itself. |

## Sign-in and accounts

| Term | Meaning |
| --- | --- |
| **Privy** | The sign-in service Bank Rock uses; it turns an email, passkey or social login into a wallet, with no seed phrase to write down. |
| **embedded wallet** | The wallet Privy creates for you behind your sign-in; you own it, and it is the key that controls your rock. |
| **passkey** | A sign-in that uses your phone's face or fingerprint unlock instead of a password. |
| **Rock Account** | The rock's own on-chain account, where all of its tokens live; only the owner's wallet can move them, and it keeps its address when the rock is given away. |
| **Safe** | The widely used smart-contract wallet the Rock Account is built on; it holds the tokens and follows one owner's instructions. |
| **smart account** | A wallet that is a small program on the chain rather than a single key, which is what lets someone else pay its network fees. |
| **personal account** | The smart account a visitor trades from; one per person, tied to no rock, and its fees are sponsored too. |
| **known in advance** (counterfactual) | The account's address can be computed before anything exists at it; the first transaction creates the account and does the work in one go. |
| **self-custodial** | You hold the keys: neither Bank Rock's servers nor the chip in the rock can move the rock's tokens. |

## Fees paid for you

| Term | Meaning |
| --- | --- |
| **gas** | The fee the Ethereum network charges to process a transaction, normally paid in ETH by the person sending it. |
| **sponsored transaction** | A transaction whose network fee is paid by Bank Rock's sponsor rather than by you, so you need no ETH at all. |
| **UserOperation** | The packaged instruction a smart account sends instead of a normal transaction; it is what allows the fee to be paid by someone else. |
| **paymaster** | The service that pays the network fee for a sponsored transaction; on Sepolia that is Pimlico's. |
| **bundler** | The service that takes a smart account's instruction and puts it on the chain. |
| **EntryPoint** | The shared contract every smart account's instruction passes through on its way onto the chain; the same one on every network. |
| **relayer** | A Bank Rock server key that pays the fee for a gift claim, because the new owner has no ETH yet; it cannot choose who receives the rock. |

## The registry and a rock's life

| Term | Meaning |
| --- | --- |
| **registry** | The Bank Rock contract that records who owns which rock and what stage each rock is at; it never holds tokens and cannot spend any. |
| **dormant** | A rock nobody has awakened yet; it has no owner and no account. |
| **awaken** | The first tap that gives a rock an owner and opens its account; a rock can be awakened once. |
| **retire** | Closing a rock for good: its history stays readable, its chip is freed to start a new rock, and it can never be reopened. |
| **lost flag** | A note the owner can set saying the chip is lost; it warns visitors and changes nothing else, because holding the rock was never what controlled the money. |
| **handover** | A gift that is waiting: the owner has named who gets the rock, and it changes hands the moment that person taps it. |
| **claim** | The moment the named recipient taps the gifted rock and it becomes theirs, along with its account and everything in it. |
| **provenance** | The rock's public history on the chain: when it was awakened, given, claimed or retired, each backed by a real tap. |
| **signed message** (EIP-712) | A standard way to sign structured data so a contract can check exactly what was signed and by whom. |

## Aqua and trading

| Term | Meaning |
| --- | --- |
| **Aqua** | A 1inch protocol that lets a wallet offer its tokens for trading while the tokens stay in the wallet; it keeps count and moves nothing on its own. |
| **maker** | The side that offers tokens for trading and sets the price; for a rock, that is its Rock Account. |
| **taker** | The side that takes the offer and trades against it; a visitor trading with a rock is the taker. |
| **strategy** | One standing offer to trade the rock's two tokens at a set fee; it cannot be changed once started, only stopped. |
| **stream** | Bank Rock's word for one live strategy; a rock can run several at once over the same tokens. |
| **start** (ship) | Starting a strategy: it tells Aqua how much the strategy may trade, and moves no tokens anywhere. |
| **stop** (dock) | Stopping a strategy: the offer closes, no tokens move because none ever left, and that strategy can never be restarted. |
| **reserve** | The tokens the Rock Account actually holds right now, shared by every strategy the rock runs. |
| **virtual balance** | The amount a strategy is allowed to trade, as recorded by Aqua; a limit written down, not a separate pile of tokens. |
| **available to trade** (executable) | What a strategy can really trade right now: the smallest of its allowance, the rock's actual tokens, and what Aqua may spend. |
| **allowance** | Permission for one contract to spend up to a set amount of a token from a wallet; the tokens stay put until it is used. |
| **fee tier** | The fee a strategy charges on every trade against it; Bank Rock offers 0.05%, 0.30% and 1.00%. |
| **fee** | The small slice of every trade that stays in the rock's own account; there is nothing to collect, because it never leaves. |
| **pricing curve** (constant product) | The rule behind every strategy's price: the price moves as the two token amounts change, so a bigger trade gets a worse price. |
| **XYCSwap** | The 1inch reference pricing contract every rock strategy runs on; it decides prices, holds nothing, and we deployed it unchanged. |
| **XYCSwapTaker** | Bank Rock's small contract that a visitor trades through, because the pricing contract needs a contract on the other side; it holds nothing and has no owner. |
| **price impact** | How much worse the price gets because of the size of your own trade. |
| **the least you will accept** (minimum received) | If the price moves past this before the trade lands, the trade is cancelled and nothing moves. |
| **divergence loss** | Holding both tokens for trading can leave you worse off after a big price move than simply holding the one that went up. |
| **smart-contract risk** | The risk that a bug or an attack in the contracts a rock relies on could put what it holds at risk. |
| **salt** | A number mixed into a strategy so that it carries the rock's id; it is how a rock's strategies can be found from the id alone, with no database. |
| **strategy hash** | The fingerprint of a strategy's settings; Aqua files every balance under it, and one changed setting gives a different fingerprint. |
| **top up** | Sending tokens to the Rock Account's address from any wallet; there is no form to fill in, just a transfer. |
| **cash in** | Stopping the rock's strategies so nothing is offered for trade; the tokens were never anywhere but the Rock Account, so nothing comes back. |

## Tokens and the network

| Term | Meaning |
| --- | --- |
| **Sepolia** | Ethereum's public test network: real contracts and real transactions, with tokens that have no money value. |
| **USDC** | A token pegged to the US dollar; on Sepolia it is Circle's test version, free from a faucet and worth nothing. |
| **WETH** | Ether wrapped as a standard token so contracts can handle it like any other; on Sepolia it is worth nothing. |
| **Etherscan** | A public website that shows every transaction and every contract on the chain, so anything a rock does can be checked without Bank Rock. |
| **faucet** | A website that hands out free test tokens on Sepolia. |

## AI agents

| Term | Meaning |
| --- | --- |
| **MCP** | Model Context Protocol, a standard way for an AI assistant to plug into a tool; Bank Rock's endpoint only reads, it can never move anything. |
| **agent** | An AI assistant such as Claude Desktop that a person connects to the Bank Rock endpoint to ask about a rock. |
