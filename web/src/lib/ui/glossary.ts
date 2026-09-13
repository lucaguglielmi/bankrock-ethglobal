/**
 * The glossary: every unfamiliar word the explainer pages and the dashboard tabs use, with one
 * plain sentence each.
 *
 * Rules for an entry, so the tooltips read as one voice:
 *
 *   - one sentence, no jargon inside the definition (a reader who taps a word should not have to
 *     tap another one to understand the answer);
 *   - say what the thing *is* for a rock, not what it is in general, unless the general meaning
 *     is the whole point;
 *   - never a yield, rate of return or annualised figure (D-004); the only rate is the fee;
 *   - never "deposit" for shipping a strategy — nothing is deposited (spec 04, D-030);
 *   - state what a thing cannot do when that is the point (the chip holds no key, the registry
 *     holds no tokens, the relayer cannot choose a recipient).
 *
 * Rendered by `<Term k="…">` (`components/ui/term.tsx`), which wraps `HelpTerm` — a tooltip on
 * a pointer, a tappable popover on touch. Plain TypeScript here so the text can also be read by a
 * test or a script; no React.
 */

export interface GlossaryEntry {
  /** The word as it appears inline when the caller does not supply its own text. */
  term: string;
  /** One plain sentence. */
  definition: string;
}

export const GLOSSARY = {
  /* ---------------------------------------------------------------------- */
  /* The object and the tap                                                  */
  /* ---------------------------------------------------------------------- */
  bankRock: {
    term: "Bank Rock",
    definition:
      "A real stone with a small chip inside; tapping it with a phone opens its page, where its tokens can be seen, traded with or given away.",
  },
  nfcTag: {
    term: "NFC tag",
    definition:
      "The tiny chip inside the rock that a phone can read from a few centimetres away; it holds a web link and nothing else.",
  },
  ntag424: {
    term: "NTAG 424 DNA",
    definition:
      "The model of chip in every rock; it writes a fresh signed code into its link on every tap, so a copied link cannot be reused.",
  },
  tap: {
    term: "tap",
    definition:
      "Holding a phone against the rock so the chip's link opens in the browser; it is how every rock is opened.",
  },
  readCounter: {
    term: "read counter",
    definition:
      "A number inside the chip that goes up by one on every tap; our server accepts a tap only if its number is higher than the last one it saw.",
  },
  cmac: {
    term: "signed code",
    definition:
      "A check code the chip computes with a secret key that never leaves it; a wrong key or an altered link fails the check.",
  },
  verifiedPhysical: {
    term: "Verified Physical",
    definition:
      "The badge that means our server checked the chip's signed code and it was fresh; a copied link can never earn it.",
  },
  copiedLink: {
    term: "copied link",
    definition:
      "A tap link opened a second time, in another browser or later; it fails the check because its counter was already used.",
  },
  attestation: {
    term: "attestation",
    definition:
      "A short signed note from our server saying that a genuine tap happened for a named wallet; the contracts accept it in place of the tap itself.",
  },

  /* ---------------------------------------------------------------------- */
  /* Sign-in and accounts                                                    */
  /* ---------------------------------------------------------------------- */
  privy: {
    term: "Privy",
    definition:
      "The sign-in service Bank Rock uses; it turns an email, passkey or social login into a wallet, with no seed phrase to write down.",
  },
  embeddedWallet: {
    term: "embedded wallet",
    definition:
      "The wallet Privy creates for you behind your sign-in; you own it, and it is the key that controls your rock.",
  },
  passkey: {
    term: "passkey",
    definition:
      "A sign-in that uses your phone's face or fingerprint unlock instead of a password.",
  },
  rockAccount: {
    term: "Rock Account",
    definition:
      "The rock's own on-chain account, where all of its tokens live; only the owner's wallet can move them, and it keeps its address when the rock is given away.",
  },
  safe: {
    term: "Safe",
    definition:
      "The widely used smart-contract wallet the Rock Account is built on; it holds the tokens and follows one owner's instructions.",
  },
  smartAccount: {
    term: "smart account",
    definition:
      "A wallet that is a small program on the chain rather than a single key, which is what lets someone else pay its network fees.",
  },
  personalAccount: {
    term: "personal account",
    definition:
      "The smart account a visitor trades from; one per person, tied to no rock, and its fees are sponsored too.",
  },
  counterfactual: {
    term: "known in advance",
    definition:
      "The account's address can be computed before anything exists at it; the first transaction creates the account and does the work in one go.",
  },
  selfCustody: {
    term: "self-custodial",
    definition:
      "You hold the keys: neither Bank Rock's servers nor the chip in the rock can move the rock's tokens.",
  },

  /* ---------------------------------------------------------------------- */
  /* Fees paid for you                                                       */
  /* ---------------------------------------------------------------------- */
  gas: {
    term: "gas",
    definition:
      "The fee the Ethereum network charges to process a transaction, normally paid in ETH by the person sending it.",
  },
  sponsoredTransaction: {
    term: "sponsored transaction",
    definition:
      "A transaction whose network fee is paid by Bank Rock's sponsor rather than by you, so you need no ETH at all.",
  },
  userOperation: {
    term: "UserOperation",
    definition:
      "The packaged instruction a smart account sends instead of a normal transaction; it is what allows the fee to be paid by someone else.",
  },
  paymaster: {
    term: "paymaster",
    definition:
      "The service that pays the network fee for a sponsored transaction; on Sepolia that is Pimlico's.",
  },
  bundler: {
    term: "bundler",
    definition:
      "The service that takes a smart account's instruction and puts it on the chain.",
  },
  entryPoint: {
    term: "EntryPoint",
    definition:
      "The shared contract every smart account's instruction passes through on its way onto the chain; the same one on every network.",
  },
  relayer: {
    term: "relayer",
    definition:
      "A Bank Rock server key that pays the fee for a gift claim, because the new owner has no ETH yet; it cannot choose who receives the rock.",
  },

  /* ---------------------------------------------------------------------- */
  /* The registry and a rock's life                                          */
  /* ---------------------------------------------------------------------- */
  registry: {
    term: "registry",
    definition:
      "The Bank Rock contract that records who owns which rock and what stage each rock is at; it never holds tokens and cannot spend any.",
  },
  dormant: {
    term: "dormant",
    definition: "A rock nobody has awakened yet; it has no owner and no account.",
  },
  awaken: {
    term: "awaken",
    definition:
      "The first tap that gives a rock an owner and opens its account; a rock can be awakened once.",
  },
  retire: {
    term: "retire",
    definition:
      "Closing a rock for good: its history stays readable, its chip is freed to start a new rock, and it can never be reopened.",
  },
  lostFlag: {
    term: "lost flag",
    definition:
      "A note the owner can set saying the chip is lost; it warns visitors and changes nothing else, because holding the rock was never what controlled the money.",
  },
  handover: {
    term: "handover",
    definition:
      "A gift that is waiting: the owner has named who gets the rock, and it changes hands the moment that person taps it.",
  },
  claim: {
    term: "claim",
    definition:
      "The moment the named recipient taps the gifted rock and it becomes theirs, along with its account and everything in it.",
  },
  provenance: {
    term: "provenance",
    definition:
      "The rock's public history on the chain: when it was awakened, given, claimed or retired, each backed by a real tap.",
  },
  eip712: {
    term: "signed message",
    definition:
      "A standard way to sign structured data so a contract can check exactly what was signed and by whom.",
  },

  /* ---------------------------------------------------------------------- */
  /* Aqua and trading                                                        */
  /* ---------------------------------------------------------------------- */
  aqua: {
    term: "Aqua",
    definition:
      "A 1inch protocol that lets a wallet offer its tokens for trading while the tokens stay in the wallet; it keeps count and moves nothing on its own.",
  },
  maker: {
    term: "maker",
    definition:
      "The side that offers tokens for trading and sets the price; for a rock, that is its Rock Account.",
  },
  taker: {
    term: "taker",
    definition:
      "The side that takes the offer and trades against it; a visitor trading with a rock is the taker.",
  },
  strategy: {
    term: "strategy",
    definition:
      "One standing offer to trade the rock's two tokens at a set fee; it cannot be changed once started, only stopped.",
  },
  stream: {
    term: "stream",
    definition:
      "Bank Rock's word for one live strategy; a rock can run several at once over the same tokens.",
  },
  ship: {
    term: "start",
    definition:
      "Starting a strategy: it tells Aqua how much the strategy may trade, and moves no tokens anywhere.",
  },
  dock: {
    term: "stop",
    definition:
      "Stopping a strategy: the offer closes, no tokens move because none ever left, and that strategy can never be restarted.",
  },
  reserve: {
    term: "reserve",
    definition:
      "The tokens the Rock Account actually holds right now, shared by every strategy the rock runs.",
  },
  virtualBalance: {
    term: "virtual balance",
    definition:
      "The amount a strategy is allowed to trade, as recorded by Aqua; a limit written down, not a separate pile of tokens.",
  },
  executable: {
    term: "available to trade",
    definition:
      "What a strategy can really trade right now: the smallest of its allowance, the rock's actual tokens, and what Aqua may spend.",
  },
  allowance: {
    term: "allowance",
    definition:
      "Permission for one contract to spend up to a set amount of a token from a wallet; the tokens stay put until it is used.",
  },
  feeTier: {
    term: "fee tier",
    definition:
      "The fee a strategy charges on every trade against it; Bank Rock offers 0.05%, 0.30% and 1.00%.",
  },
  fee: {
    term: "fee",
    definition:
      "The small slice of every trade that stays in the rock's own account; there is nothing to collect, because it never leaves.",
  },
  constantProduct: {
    term: "pricing curve",
    definition:
      "The rule behind every strategy's price: the price moves as the two token amounts change, so a bigger trade gets a worse price.",
  },
  xycSwap: {
    term: "XYCSwap",
    definition:
      "The 1inch reference pricing contract every rock strategy runs on; it decides prices, holds nothing, and we deployed it unchanged.",
  },
  xycSwapTaker: {
    term: "XYCSwapTaker",
    definition:
      "Bank Rock's small contract that a visitor trades through, because the pricing contract needs a contract on the other side; it holds nothing and has no owner.",
  },
  priceImpact: {
    term: "price impact",
    definition: "How much worse the price gets because of the size of your own trade.",
  },
  minimumReceived: {
    term: "the least you will accept",
    definition:
      "If the price moves past this before the trade lands, the trade is cancelled and nothing moves.",
  },
  divergenceLoss: {
    term: "divergence loss",
    definition:
      "Holding both tokens for trading can leave you worse off after a big price move than simply holding the one that went up.",
  },
  smartContractRisk: {
    term: "smart-contract risk",
    definition:
      "The risk that a bug or an attack in the contracts a rock relies on could put what it holds at risk.",
  },
  salt: {
    term: "salt",
    definition:
      "A number mixed into a strategy so that it carries the rock's id; it is how a rock's strategies can be found from the id alone, with no database.",
  },
  strategyHash: {
    term: "strategy hash",
    definition:
      "The fingerprint of a strategy's settings; Aqua files every balance under it, and one changed setting gives a different fingerprint.",
  },
  topUp: {
    term: "top up",
    definition:
      "Sending tokens to the Rock Account's address from any wallet; there is no form to fill in, just a transfer.",
  },
  cashIn: {
    term: "cash in",
    definition:
      "Stopping the rock's strategies so nothing is offered for trade; the tokens were never anywhere but the Rock Account, so nothing comes back.",
  },

  /* ---------------------------------------------------------------------- */
  /* Tokens and the network                                                  */
  /* ---------------------------------------------------------------------- */
  sepolia: {
    term: "Sepolia",
    definition:
      "Ethereum's public test network: real contracts and real transactions, with tokens that have no money value.",
  },
  usdc: {
    term: "USDC",
    definition:
      "A token pegged to the US dollar; on Sepolia it is Circle's test version, free from a faucet and worth nothing.",
  },
  weth: {
    term: "WETH",
    definition:
      "Ether wrapped as a standard token so contracts can handle it like any other; on Sepolia it is worth nothing.",
  },
  etherscan: {
    term: "Etherscan",
    definition:
      "A public website that shows every transaction and every contract on the chain, so anything a rock does can be checked without Bank Rock.",
  },
  faucet: {
    term: "faucet",
    definition: "A website that hands out free test tokens on Sepolia.",
  },

  /* ---------------------------------------------------------------------- */
  /* AI agents                                                               */
  /* ---------------------------------------------------------------------- */
  mcp: {
    term: "MCP",
    definition:
      "Model Context Protocol, a standard way for an AI assistant to plug into a tool; Bank Rock's endpoint only reads, it can never move anything.",
  },
  agent: {
    term: "agent",
    definition:
      "An AI assistant such as ChatGPT or Claude, on a laptop or a phone, that a person connects to the Bank Rock endpoint to ask about a rock.",
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;

/** Every key, in the order they are declared — for a glossary page or a test. */
export const GLOSSARY_KEYS = Object.keys(GLOSSARY) as GlossaryKey[];
