/**
 * The live Sepolia rehearsal (spec 20 WP-2, DEMO-STATE §5 P-2…P-5).
 *
 * It drives the whole acceptance path against the deployed contracts with **local test keys
 * instead of Privy** — Privy cannot be scripted; the on-chain and Pimlico paths are identical.
 * Every step reuses the application's own library code: the same address derivation, the same
 * attestation signer, the same calldata builders, the same UserOperation submission and the same
 * claim ordering the route uses. Proving a parallel implementation would prove nothing.
 *
 * Run it:
 *
 *     cd web
 *     npm run rehearse:sepolia -- --dry-run      # reads only, broadcasts nothing
 *     npm run rehearse:sepolia                   # the real thing, on Ethereum Sepolia
 *
 * Environment (spec 16):
 *
 *     SEPOLIA_RPC_URL                  a provider endpoint; a public RPC works for this script,
 *                                      which never scans a wide log range
 *     PIMLICO_API_KEY                  bundler + verifying paymaster, with a sponsorship policy
 *                                      for chain 11155111 (spec 16 §1.4)
 *     ATTESTATION_SIGNER_PRIVATE_KEY   must be the registry's configured attester, or nothing it
 *                                      signs is accepted on chain
 *     RELAYER_PRIVATE_KEY              pays gas for the relayed `claimHandover`, exactly as the
 *                                      claim route does
 *     REHEARSAL_FUNDER_PRIVATE_KEY     an EOA holding Sepolia ETH, USDC and WETH. It funds the
 *                                      Rock Account and the taker's Safe, and wraps ETH into WETH
 *                                      itself when WETH is short
 *
 * Three more keys — owner A, taker B and recipient C — are generated fresh on every run and never
 * printed as keys. They are the three people in the story and they hold nothing afterwards.
 *
 * Addresses are never written as literals here (D-015). The registry, the Aqua app, the taker
 * periphery and the canonical Aqua come from `contracts/deployments/*.json`; USDC and WETH come
 * from the environment, falling back to the committed `web/.env.example`, whose values spec 16
 * §1.1 verified on chain. Whatever is resolved is exported into `process.env.NEXT_PUBLIC_*`
 * **before** the application libraries are imported, so the libraries and this script cannot
 * disagree about what they are talking to.
 *
 * Nothing here invents a value (spec 15 Part 3): every hash comes from a bundler or an RPC that
 * accepted it, every balance is read back, and the first failed assertion exits non-zero.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";

import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  formatEther,
  formatUnits,
  getAddress,
  http,
  isAddress,
  parseUnits,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount, generatePrivateKey, type PrivateKeyAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { toSafeSmartAccount } from "permissionless/accounts";
import { createSmartAccountClient } from "permissionless/clients";
import { createPimlicoClient } from "permissionless/clients/pimlico";

/* -------------------------------------------------------------------------- */
/* Output                                                                      */
/* -------------------------------------------------------------------------- */

const lines: string[] = [];

function say(text = ""): void {
  lines.push(text);
  console.log(text);
}

function heading(text: string): void {
  say("");
  say(text);
  say("-".repeat(text.length));
}

class RehearsalError extends Error {}

/** The only way this script reports a fact it checked. A failure ends the run (exit 1). */
function assert(condition: boolean, message: string): void {
  if (!condition) throw new RehearsalError(message);
  say(`  ok    ${message}`);
}

/**
 * Unwraps one of the application's `Capability` values, reporting its own reason on failure.
 *
 * Every library function in this codebase answers REAL / DEMO / UNAVAILABLE rather than throwing
 * (D-013), and the reason it gives is the most useful thing a failed rehearsal can print.
 */
function expectReal<T>(
  capability: { state: "REAL"; value: T } | { state: "DEMO"; value: T } | { state: "UNAVAILABLE"; reason: string },
  message: string,
): T {
  if (capability.state === "UNAVAILABLE") {
    throw new RehearsalError(`${message}: ${capability.reason}`);
  }
  if (capability.state === "DEMO") {
    throw new RehearsalError(`${message}: the app answered DEMO, and a rehearsal accepts only REAL`);
  }
  say(`  ok    ${message}`);
  return capability.value;
}

/** A statement of something the run could not do, or did differently than the app would. */
function finding(message: string): void {
  say(`  FINDING  ${message}`);
}

function note(message: string): void {
  say(`  ${message}`);
}

/* -------------------------------------------------------------------------- */
/* Step ledger                                                                 */
/* -------------------------------------------------------------------------- */

interface StepRecord {
  step: string;
  hash: string;
  sponsor: string;
  elapsedMs: number;
}

const steps: StepRecord[] = [];

function record(step: string, hash: string, sponsor: string, startedAt: number): void {
  steps.push({ step, hash, sponsor, elapsedMs: Date.now() - startedAt });
}

function table(): string[] {
  const header = ["step", "tx / userOp hash", "gas sponsor", "elapsed"];
  const rows = steps.map((entry) => [
    entry.step,
    entry.hash,
    entry.sponsor,
    `${(entry.elapsedMs / 1000).toFixed(1)}s`,
  ]);
  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...rows.map((row) => row[index].length)),
  );
  const line = (cells: string[]) =>
    cells.map((cell, index) => cell.padEnd(widths[index])).join("  ").trimEnd();
  return [line(header), widths.map((width) => "-".repeat(width)).join("  "), ...rows.map(line)];
}

/* -------------------------------------------------------------------------- */
/* Repository layout and configuration                                         */
/* -------------------------------------------------------------------------- */

/** Walks up from the working directory until the deployment records are in view. */
function findRepoRoot(): string {
  let dir = resolve(process.cwd());
  for (let depth = 0; depth < 8; depth++) {
    if (existsSync(join(dir, "contracts", "deployments", "sepolia.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new RehearsalError(
    "contracts/deployments/sepolia.json was not found above the working directory — run this from the repository",
  );
}

const REPO_ROOT = findRepoRoot();

function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch (err) {
    throw new RehearsalError(
      `${path} could not be read as JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function requireAddressField(source: Record<string, unknown>, key: string, where: string): Address {
  const value = source[key];
  if (typeof value !== "string" || !isAddress(value, { strict: false })) {
    throw new RehearsalError(`${where} does not carry a valid "${key}" address`);
  }
  return getAddress(value);
}

function requireBlockField(source: Record<string, unknown>, key: string, where: string): bigint {
  const value = source[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new RehearsalError(`${where} does not carry a whole "${key}" block number`);
  }
  return BigInt(value);
}

/** `KEY=VALUE` lines from a dotenv-style file. Nothing is expanded and nothing is executed. */
function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/\s+#.*$/, "");
    if (key !== "" && value !== "") out[key] = value;
  }
  return out;
}

interface Deployment {
  chainId: number;
  registry: Address;
  registryDeployBlock: bigint;
  attester: Address;
  aqua: Address;
  app: Address;
  appDeployBlock: bigint;
  taker: Address;
  usdc: Address;
  weth: Address;
  /** Where USDC and WETH came from, so the run report can say. */
  tokenSource: string;
}

function loadDeployment(): Deployment {
  const registryPath = join(REPO_ROOT, "contracts", "deployments", "sepolia.json");
  const aquaPath = join(REPO_ROOT, "contracts", "deployments", "sepolia-aqua-app.json");
  const registryRecord = readJson(registryPath);
  const aquaRecord = readJson(aquaPath);

  const app = aquaRecord.app as Record<string, unknown> | undefined;
  const taker = aquaRecord.taker as Record<string, unknown> | undefined;
  if (!app || !taker) {
    throw new RehearsalError(`${aquaPath} is missing its "app" or "taker" section`);
  }

  const chainId = registryRecord.chainId;
  if (typeof chainId !== "number") {
    throw new RehearsalError(`${registryPath} does not carry a numeric chainId`);
  }

  // USDC and WETH are fixed, published Sepolia tokens rather than outputs of our deploys, so they
  // are not in the deployment records. They come from the environment; `web/.env.example` is the
  // committed fallback and its values are the ones spec 16 §1.1 verified on chain.
  const example = parseEnvFile(join(REPO_ROOT, "web", ".env.example"));
  const local = { ...parseEnvFile(join(REPO_ROOT, "web", ".env")), ...parseEnvFile(join(REPO_ROOT, "web", ".env.local")) };
  const tokenSources: string[] = [];
  const token = (name: string): Address => {
    const fromEnv = process.env[name]?.trim() || local[name]?.trim();
    const value = fromEnv || example[name]?.trim();
    if (!value || !isAddress(value, { strict: false })) {
      throw new RehearsalError(`${name} is not configured and web/.env.example has no usable value`);
    }
    tokenSources.push(`${name} from ${fromEnv ? "the environment" : "web/.env.example"}`);
    return getAddress(value);
  };

  return {
    chainId,
    registry: requireAddressField(registryRecord, "address", registryPath),
    registryDeployBlock: requireBlockField(registryRecord, "deployBlock", registryPath),
    attester: requireAddressField(registryRecord, "attester", registryPath),
    aqua: requireAddressField(aquaRecord, "aqua", aquaPath),
    app: requireAddressField(app, "address", `${aquaPath} (app)`),
    appDeployBlock: requireBlockField(app, "deployBlock", `${aquaPath} (app)`),
    taker: requireAddressField(taker, "address", `${aquaPath} (taker)`),
    usdc: token("NEXT_PUBLIC_USDC_ADDRESS"),
    weth: token("NEXT_PUBLIC_WETH_ADDRESS"),
    tokenSource: tokenSources.join("; "),
  };
}

/**
 * Publishes the deployment into the environment the application libraries read.
 *
 * They read `process.env` once, at module load, so this must happen before the first
 * `await import("@/lib/…")` in `main`.
 */
function exportEnvironment(deployment: Deployment): void {
  process.env.NEXT_PUBLIC_CHAIN_ID = String(deployment.chainId);
  process.env.NEXT_PUBLIC_REGISTRY_ADDRESS = deployment.registry;
  process.env.NEXT_PUBLIC_AQUA_ADDRESS = deployment.aqua;
  process.env.NEXT_PUBLIC_AQUA_APP_ADDRESS = deployment.app;
  process.env.NEXT_PUBLIC_AQUA_TAKER_ADDRESS = deployment.taker;
  process.env.NEXT_PUBLIC_USDC_ADDRESS = deployment.usdc;
  process.env.NEXT_PUBLIC_WETH_ADDRESS = deployment.weth;
  process.env.REGISTRY_DEPLOY_BLOCK = deployment.registryDeployBlock.toString();
  process.env.AQUA_APP_DEPLOY_BLOCK = deployment.appDeployBlock.toString();
  // Demo mode must never be on for a rehearsal: every value below has to be real (D-013).
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
}

/* -------------------------------------------------------------------------- */
/* Keys                                                                        */
/* -------------------------------------------------------------------------- */

const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;

function readKey(name: string): Hex | null {
  const value = process.env[name]?.trim();
  if (!value) return null;
  if (!PRIVATE_KEY_PATTERN.test(value)) {
    throw new RehearsalError(`${name} is not a 32-byte hex private key`);
  }
  return value as Hex;
}

/**
 * A key the run needs. In a live run it must be configured; in a dry run a throwaway is generated
 * so that everything downstream — the attestation signature, the derived addresses — is real, and
 * the output says which keys were invented.
 */
function keyOrThrowaway(name: string, dryRun: boolean, purpose: string): {
  account: PrivateKeyAccount;
  privateKey: Hex;
  throwaway: boolean;
} {
  const configured = readKey(name);
  if (configured) {
    return { account: privateKeyToAccount(configured), privateKey: configured, throwaway: false };
  }
  if (!dryRun) {
    throw new RehearsalError(`${name} is not configured, so ${purpose} cannot run`);
  }
  const generated = generatePrivateKey();
  // Exported so the application's own signer and relayer read exactly this key. It is a real key
  // that signs real bytes; it is simply not the one the deployed registry trusts, and every line
  // of output that depends on it says so.
  process.env[name] = generated;
  return { account: privateKeyToAccount(generated), privateKey: generated, throwaway: true };
}

/* -------------------------------------------------------------------------- */
/* Amounts                                                                     */
/* -------------------------------------------------------------------------- */

const USDC_DECIMALS = 6;
const WETH_DECIMALS = 18;

function amountFromEnv(name: string, fallback: string, decimals: number): bigint {
  const raw = process.env[name]?.trim() || fallback;
  try {
    return parseUnits(raw, decimals);
  } catch {
    throw new RehearsalError(`${name}="${raw}" is not a decimal amount`);
  }
}

function usdc(value: bigint): string {
  return `${formatUnits(value, USDC_DECIMALS)} USDC`;
}

function weth(value: bigint): string {
  return `${formatUnits(value, WETH_DECIMALS)} WETH`;
}

/* -------------------------------------------------------------------------- */
/* ABIs that are not the application's                                         */
/* -------------------------------------------------------------------------- */

/** `Safe.getOwners()` / `isOwner()` — read-only, used to prove the owner swap landed. */
const SAFE_OWNERS_ABI = [
  {
    type: "function",
    name: "getOwners",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    type: "function",
    name: "isOwner",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/**
 * `ERC20.transfer` — the one call the application's own `ERC20_ABI` deliberately does not carry.
 *
 * Nothing in the app ever moves a token by transfer: a rock's reserve is approved, never
 * deposited, and a swap moves tokens through Aqua. Only the rehearsal's funder does it, to put
 * starting balances in place, so the fragment lives here rather than in `lib/chain`.
 */
const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/** Canonical WETH9 `deposit()`, so the funder can wrap its own ETH when WETH is short. */
const WETH_DEPOSIT_ABI = [
  { type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] },
] as const;

/* -------------------------------------------------------------------------- */
/* The application's libraries                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Imported dynamically and only after `exportEnvironment`, because `lib/demo` snapshots
 * `process.env` at module load and `lib/chain` validates the addresses there and then.
 */
async function loadAppLibraries() {
  const [chain, registryAbi, erc20Abi, rockAccount, rockAccountServer, attestation, aqua, resolution, taker] =
    await Promise.all([
      import("@/lib/chain"),
      import("@/lib/chain/abi/registry"),
      import("@/lib/chain/abi/erc20"),
      import("@/lib/rock-account"),
      import("@/lib/rock-account.server"),
      import("@/lib/nfc/attestation"),
      import("@/lib/aqua"),
      import("@/lib/nfc/rock-resolution"),
      // `readAmountOutFromLogs` is the taker hook's own reading of a swap receipt. The module is a
      // client component, but the function is pure and exported, so the rehearsal reads the
      // executed size exactly as the UI does.
      import("@/hooks/useTakerActions"),
    ]);
  return {
    chain,
    REGISTRY_ABI: registryAbi.BANK_ROCK_REGISTRY_ABI,
    ERC20_ABI: erc20Abi.ERC20_ABI,
    rockAccount,
    rockAccountServer,
    attestation,
    aqua,
    resolution,
    readAmountOutFromLogs: taker.readAmountOutFromLogs,
  };
}

type App = Awaited<ReturnType<typeof loadAppLibraries>>;

/* -------------------------------------------------------------------------- */
/* Smart accounts                                                              */
/* -------------------------------------------------------------------------- */

interface Call {
  to: Address;
  data: Hex;
  value: bigint;
}

/** The three fields `matchesStrategy` filters an Aqua log by — none of them is indexed. */
interface StrategyEventArgs {
  maker?: Address;
  app?: Address;
  strategyHash?: Hex;
}

/**
 * The slice of the smart-account client this script uses.
 *
 * Declared rather than inferred, exactly as `useBankRock` does for the same reason: the generic
 * return type of `createSmartAccountClient` is wider than any call site here.
 */
interface SafeClient {
  account: {
    address: Address;
    signUserOperation: (operation: never) => Promise<Hex>;
  };
  sendUserOperation: (args: { calls: Call[] }) => Promise<Hex>;
  waitForUserOperationReceipt: (args: { hash: Hex }) => Promise<{
    success: boolean;
    receipt: {
      transactionHash: Hex;
      logs: { address: string; topics: string[]; data: string }[];
    };
  }>;
  prepareUserOperation: (args: { calls: Call[] }) => Promise<Record<string, unknown>>;
}

/**
 * The same permissionless stack `useBankRock`/`useTakerActions` build, with a local key where the
 * hooks put a Privy embedded wallet. Safe 1.4.1 on EntryPoint 0.7, bundler and verifying paymaster
 * both Pimlico.
 */
async function buildSafeClient(params: {
  app: App;
  publicClient: PublicClient;
  bundlerUrl: string;
  owner: PrivateKeyAccount;
  saltNonce: bigint;
  /** An already-deployed Safe whose owner set has moved on from the salt that created it. */
  address?: Address;
}): Promise<SafeClient> {
  const entryPoint = {
    address: params.app.chain.ENTRY_POINT_07_ADDRESS,
    version: "0.7",
  } as const;

  const account = await toSafeSmartAccount({
    client: params.publicClient,
    owners: [params.owner],
    version: "1.4.1",
    entryPoint,
    saltNonce: params.saltNonce,
    ...(params.address ? { address: params.address } : {}),
  });

  const paymaster = createPimlicoClient({
    transport: http(params.bundlerUrl),
    entryPoint,
  });

  const client = createSmartAccountClient({
    account,
    chain: sepolia,
    bundlerTransport: http(params.bundlerUrl),
    paymaster,
    userOperation: {
      estimateFeesPerGas: async () => (await paymaster.getUserOperationGasPrice()).fast,
    },
  });

  return client as unknown as SafeClient;
}

/**
 * Serialises a prepared UserOperation for storage and later JSON-RPC submission.
 *
 * Identical to `serialiseUserOp` in `web/src/hooks/useBankRock.ts`, which is module-private there.
 * The claim path submits what this produces through the app's own `submitSignedUserOp`.
 */
function serialiseUserOp(userOp: Record<string, unknown>, signature: Hex): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(userOp)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "bigint") out[key] = `0x${value.toString(16)}`;
    else if (typeof value === "string") out[key] = value;
    else if (typeof value === "number") out[key] = `0x${value.toString(16)}`;
  }
  out.signature = signature;
  return out;
}

/* -------------------------------------------------------------------------- */
/* The run                                                                     */
/* -------------------------------------------------------------------------- */

interface Run {
  dryRun: boolean;
  app: App;
  deployment: Deployment;
  publicClient: PublicClient;
  bundlerUrl: string | null;
  attester: PrivateKeyAccount;
  relayer: PrivateKeyAccount;
  funder: PrivateKeyAccount;
  ownerA: PrivateKeyAccount;
  takerB: PrivateKeyAccount;
  recipientC: PrivateKeyAccount;
  /** The synthetic tag: seven bytes, as an NTAG 424 DNA UID is. */
  uid: Buffer;
  uidHash: Hex;
  saltNonce: bigint;
  counter: number;
  amounts: {
    shipUsdc: bigint;
    shipWeth: bigint;
    swapUsdcIn: bigint;
  };
}

/** The next attestation counter for this tag. Every attestation spends one, and one only. */
function nextCounter(run: Run): number {
  run.counter += 1;
  return run.counter;
}

/** Signs an attestation with the app's own signer, and refuses anything but a signature. */
async function signAttestationOrFail(
  run: Run,
  params: { rockId: string; subject: Address; smartAccount: Address },
) {
  const result = await run.app.attestation.signAttestation({
    rockId: params.rockId,
    uid: run.uid,
    counter: nextCounter(run),
    subject: params.subject,
    smartAccount: params.smartAccount,
  });
  if (result.state !== "SIGNED") {
    throw new RehearsalError(`The attestation could not be signed: ${result.reason}`);
  }
  return result;
}

/** Waits for a plain transaction and refuses anything but `status: "success"`. */
async function waitForTx(run: Run, hash: Hex, what: string): Promise<void> {
  const receipt = await run.publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== "success") {
    throw new RehearsalError(`${what} reverted on chain (${hash})`);
  }
}

/** Sends one sponsored UserOperation and refuses an included-but-reverted one (review N-6). */
async function sendSponsored(
  run: Run,
  client: SafeClient,
  calls: Call[],
  what: string,
): Promise<{ txHash: Hex; logs: { address: string; topics: string[]; data: string }[] }> {
  const userOpHash = await client.sendUserOperation({ calls });
  say(`  userOp  ${userOpHash}`);
  const receipt = await client.waitForUserOperationReceipt({ hash: userOpHash });
  if (!receipt.success) {
    throw new RehearsalError(`${what} was included but reverted (${receipt.receipt.transactionHash})`);
  }
  say(`  tx      ${receipt.receipt.transactionHash}`);
  return { txHash: receipt.receipt.transactionHash, logs: receipt.receipt.logs ?? [] };
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

async function codeSize(client: PublicClient, address: Address): Promise<number> {
  const code = await client.getCode({ address });
  return code && code !== "0x" ? (code.length - 2) / 2 : 0;
}

async function tokenBalance(
  run: Run,
  token: Address,
  holder: Address,
): Promise<bigint> {
  return (await run.publicClient.readContract({
    address: token,
    abi: run.app.ERC20_ABI,
    functionName: "balanceOf",
    args: [holder],
  })) as bigint;
}

/**
 * The lowest rock id nobody has awakened.
 *
 * The app asks its D1 index (`nextFreeRockId`, `GET /api/rocks/next-id`), which a script has no
 * binding for, so this asks the registry directly. Either way the registry settles a race:
 * a second `awakenRock` for the same id reverts `RockAlreadyAwakened`.
 */
async function findDormantRockId(run: Run, startAt = 1): Promise<string> {
  for (let id = startAt; id < startAt + 200; id++) {
    const rock = await run.app.rockAccount.readRock(String(id));
    if (rock.state === "UNAVAILABLE") {
      throw new RehearsalError(`The registry could not be read for rock ${id}: ${rock.reason}`);
    }
    if (rock.value.state === "dormant") return String(id);
  }
  throw new RehearsalError("No dormant rock id found in the first 200 ids");
}

async function readRockOrFail(run: Run, rockId: string) {
  const rock = await run.app.rockAccount.readRock(rockId);
  if (rock.state === "UNAVAILABLE") {
    throw new RehearsalError(`Rock ${rockId} could not be read: ${rock.reason}`);
  }
  return rock.value;
}

/* -------------------------------------------------------------------------- */
/* Preflight                                                                   */
/* -------------------------------------------------------------------------- */

async function preflight(run: Run): Promise<void> {
  heading("Preflight — what is deployed, and who signs");

  const chainId = await run.publicClient.getChainId();
  assert(
    chainId === run.deployment.chainId,
    `the RPC serves chain ${chainId}, which is the chain the deployment records name`,
  );

  const named: [string, Address][] = [
    ["registry", run.deployment.registry],
    ["XYCSwap app", run.deployment.app],
    ["XYCSwapTaker", run.deployment.taker],
    ["Aqua", run.deployment.aqua],
    ["USDC", run.deployment.usdc],
    ["WETH", run.deployment.weth],
  ];
  for (const [label, address] of named) {
    const size = await codeSize(run.publicClient, address);
    assert(size > 0, `${label} ${address} has ${size} bytes of code`);
  }

  const version = (await run.publicClient.readContract({
    address: run.deployment.registry,
    abi: run.app.REGISTRY_ABI,
    functionName: "version",
  })) as string;
  note(`registry version ${version}`);

  const paused = (await run.publicClient.readContract({
    address: run.deployment.registry,
    abi: run.app.REGISTRY_ABI,
    functionName: "paused",
  })) as boolean;
  assert(paused === false, "the registry is not paused");

  const onChainAttester = getAddress(
    (await run.publicClient.readContract({
      address: run.deployment.registry,
      abi: run.app.REGISTRY_ABI,
      functionName: "attester",
    })) as Address,
  );
  assert(
    onChainAttester === run.deployment.attester,
    `the registry's attester is ${onChainAttester}, the address the deployment record names`,
  );

  const signerMatches = getAddress(run.attester.address) === onChainAttester;
  if (run.dryRun && !signerMatches) {
    finding(
      `the attestation signer in this environment is ${run.attester.address}, not the registry's attester ${onChainAttester} — signatures are real but the registry would reject them`,
    );
  } else {
    assert(signerMatches, `the attestation signer is the registry's attester (${onChainAttester})`);
  }

  const funderEth = await run.publicClient.getBalance({ address: run.funder.address });
  const funderUsdc = await tokenBalance(run, run.deployment.usdc, run.funder.address);
  const funderWeth = await tokenBalance(run, run.deployment.weth, run.funder.address);
  const relayerEth = await run.publicClient.getBalance({ address: run.relayer.address });
  note(
    `funder ${run.funder.address}: ${formatEther(funderEth)} ETH, ${usdc(funderUsdc)}, ${weth(funderWeth)}`,
  );
  note(`relayer ${run.relayer.address}: ${formatEther(relayerEth)} ETH`);

  if (!run.dryRun) {
    const wethShortfall = run.amounts.shipWeth > funderWeth ? run.amounts.shipWeth - funderWeth : BigInt(0);
    assert(
      funderUsdc >= run.amounts.shipUsdc + run.amounts.swapUsdcIn,
      `the funder holds the ${usdc(run.amounts.shipUsdc + run.amounts.swapUsdcIn)} this run moves`,
    );
    assert(
      funderEth > wethShortfall,
      "the funder holds ETH for gas, and for wrapping into WETH if WETH is short",
    );
    assert(relayerEth > BigInt(0), "the relayer holds ETH to pay for the claim");
  }

  note(`tag uid hash ${run.uidHash}`);
  note(`owner A      ${run.ownerA.address}`);
  note(`taker B      ${run.takerB.address}`);
  note(`recipient C  ${run.recipientC.address}`);

  const lastCounter = (await run.publicClient.readContract({
    address: run.deployment.registry,
    abi: run.app.REGISTRY_ABI,
    functionName: "lastCounter",
    args: [run.uidHash],
  })) as number;
  run.counter = Number(lastCounter);
  note(`the registry has seen counter ${run.counter} for this tag; the run starts at ${run.counter + 1}`);
}

/* -------------------------------------------------------------------------- */
/* Step 1 — awaken                                                             */
/* -------------------------------------------------------------------------- */

interface AwakenResult {
  rockId: string;
  smartAccount: Address;
  client: SafeClient | null;
}

async function stepAwaken(run: Run): Promise<AwakenResult> {
  heading("Step 1 — a tap awakens a rock (sponsored UserOp from the Rock Account)");
  const startedAt = Date.now();

  const rockId = await findDormantRockId(run);
  note(`rock id ${rockId} is dormant in the registry`);

  const derived = await run.app.rockAccount.computeRockAccountAddress({
    ownerAddress: run.ownerA.address,
    saltNonce: run.saltNonce,
  });
  if (derived.state === "UNAVAILABLE") {
    throw new RehearsalError(`The Rock Account could not be derived: ${derived.reason}`);
  }
  const smartAccount = derived.value;
  note(`Rock Account for (this tag, owner A) is ${smartAccount}`);

  const attestation = await signAttestationOrFail(run, {
    rockId,
    subject: run.ownerA.address,
    smartAccount,
  });
  note(`attestation counter ${attestation.message.counter}, deadline ${attestation.message.deadline}`);

  const check = run.app.rockAccount.checkAwakenAttestation(attestation, {
    signedInAddress: run.ownerA.address,
    smartAccount,
    rockId,
  });
  expectReal(check, "the app's own attestation check accepts this tap");

  const data = run.app.rockAccount.encodeAwaken(BigInt(rockId), smartAccount, attestation);
  note(`awakenRock calldata ${data.length / 2 - 1} bytes`);

  if (run.dryRun || !run.bundlerUrl) {
    note("dry run: the UserOperation is built but not submitted");
    record(`1 awaken rock ${rockId}`, "(dry run)", "Pimlico paymaster", startedAt);
    return { rockId, smartAccount, client: null };
  }

  const client = await buildSafeClient({
    app: run.app,
    publicClient: run.publicClient,
    bundlerUrl: run.bundlerUrl,
    owner: run.ownerA,
    saltNonce: run.saltNonce,
  });
  assert(
    getAddress(client.account.address) === smartAccount,
    "the account the bundler will send from is the account the attestation names",
  );

  const sent = await sendSponsored(
    run,
    client,
    [{ to: run.deployment.registry, data, value: BigInt(0) }],
    "awakenRock",
  );

  const rock = await readRockOrFail(run, rockId);
  assert(getAddress(rock.owner) === getAddress(run.ownerA.address), `rock ${rockId} is owned by A`);
  assert(getAddress(rock.smartAccount) === smartAccount, "the registry records the derived Rock Account");
  assert(rock.state === "awake", "the rock is awake");
  assert(rock.uidHash.toLowerCase() === run.uidHash.toLowerCase(), "the tag is bound to this rock");

  record(`1 awaken rock ${rockId}`, sent.txHash, "Pimlico paymaster", startedAt);
  return { rockId, smartAccount, client };
}

/* -------------------------------------------------------------------------- */
/* Step 2 — fund and ship                                                      */
/* -------------------------------------------------------------------------- */

async function transferToken(
  run: Run,
  token: Address,
  to: Address,
  amount: bigint,
  label: string,
): Promise<void> {
  const wallet = createWalletClient({
    account: run.funder,
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL || undefined),
  });
  const hash = await wallet.writeContract({
    address: token,
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [to, amount],
  });
  say(`  tx      ${hash}  (${label})`);
  await waitForTx(run, hash, label);
}

/** Wraps the funder's own ETH when its WETH balance cannot cover what the rock needs. */
async function wrapEthIfShort(run: Run, needed: bigint): Promise<void> {
  const held = await tokenBalance(run, run.deployment.weth, run.funder.address);
  if (held >= needed) {
    note(`the funder already holds ${weth(held)}`);
    return;
  }
  const shortfall = needed - held;
  note(`the funder is short ${weth(shortfall)} — wrapping that much ETH`);
  const wallet = createWalletClient({
    account: run.funder,
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL || undefined),
  });
  const hash = await wallet.writeContract({
    address: run.deployment.weth,
    abi: WETH_DEPOSIT_ABI,
    functionName: "deposit",
    value: shortfall,
  });
  say(`  tx      ${hash}  (WETH.deposit)`);
  await waitForTx(run, hash, "WETH.deposit");
}

interface ShipResult {
  strategyHash: Hex;
  strategy: ReturnType<App["aqua"]["buildStrategy"]>;
  feeBps: bigint;
}

async function stepShip(run: Run, awoken: AwakenResult): Promise<ShipResult> {
  heading("Step 2 — the rock is funded and ships a liquidity stream");
  const startedAt = Date.now();

  const stream = run.app.aqua.DEFAULT_STREAMS[0];
  const strategy = run.app.aqua.buildStrategy({
    maker: awoken.smartAccount,
    token0: run.deployment.usdc,
    token1: run.deployment.weth,
    feeBps: stream.feeBps,
    rockId: awoken.rockId,
    streamIndex: stream.streamIndex,
  });
  note(`stream ${stream.streamIndex} (${stream.label}, ${stream.feeBps} bps) → ${strategy.strategyHash}`);

  const plan = run.app.aqua.buildShipCalls({
    maker: awoken.smartAccount,
    rockId: awoken.rockId,
    streamIndex: stream.streamIndex,
    feeBps: stream.feeBps,
    usdcAmount: run.amounts.shipUsdc,
    wethAmount: run.amounts.shipWeth,
  });
  if (plan.state === "UNAVAILABLE") {
    throw new RehearsalError(`The ship batch could not be built: ${plan.reason}`);
  }
  assert(
    plan.value.strategyHash === strategy.strategyHash,
    "the strategy the batch ships is the one this script computed",
  );
  note(`ship batch: ${plan.value.calls.length} calls (approve USDC → Aqua, approve WETH → Aqua, ship)`);

  if (run.dryRun || !awoken.client) {
    note(
      `dry run: the rock would be funded with ${usdc(run.amounts.shipUsdc)} and ${weth(run.amounts.shipWeth)} and ship them as one sponsored batch`,
    );
    record("2 ship strategy", "(dry run)", "Pimlico paymaster", startedAt);
    return { strategyHash: strategy.strategyHash, strategy, feeBps: BigInt(stream.feeBps) };
  }

  await wrapEthIfShort(run, run.amounts.shipWeth);
  await transferToken(run, run.deployment.usdc, awoken.smartAccount, run.amounts.shipUsdc, "fund USDC");
  await transferToken(run, run.deployment.weth, awoken.smartAccount, run.amounts.shipWeth, "fund WETH");

  const reserves = await run.app.rockAccount.readReserves(awoken.smartAccount);
  if (reserves.state === "UNAVAILABLE") {
    throw new RehearsalError(`The Rock Account balances could not be read: ${reserves.reason}`);
  }
  assert(reserves.value.usdc >= run.amounts.shipUsdc, `the Rock Account holds ${usdc(reserves.value.usdc)}`);
  assert(reserves.value.weth >= run.amounts.shipWeth, `the Rock Account holds ${weth(reserves.value.weth)}`);

  // The approvals the app rebuilds against the allowances that actually exist — the same rule
  // `useBankRock.shipStrategy` follows, because USDC reverts on a non-zero to non-zero approve.
  const aquaAddresses = run.app.aqua.getAquaAddresses();
  if (aquaAddresses.state === "UNAVAILABLE") {
    throw new RehearsalError(aquaAddresses.reason);
  }
  const approvals: Call[] = [];
  for (const want of [
    { token: run.deployment.usdc, amount: run.amounts.shipUsdc },
    { token: run.deployment.weth, amount: run.amounts.shipWeth },
  ]) {
    const current = await run.app.rockAccount.readAllowance(
      want.token,
      awoken.smartAccount,
      aquaAddresses.value.aqua,
    );
    if (current.state === "UNAVAILABLE") throw new RehearsalError(current.reason);
    if (current.value >= want.amount) continue;
    approvals.push(
      ...run.app.rockAccount.approvalCalls({
        token: want.token,
        spender: aquaAddresses.value.aqua,
        currentAllowance: current.value,
        amount: want.amount,
      }),
    );
  }

  const shipCall = plan.value.calls[plan.value.calls.length - 1];
  const sent = await sendSponsored(
    run,
    awoken.client,
    [...approvals, shipCall],
    "the Aqua ship batch",
  );

  const shipped = sent.logs.some((log) => {
    if (log.address.toLowerCase() !== run.deployment.aqua.toLowerCase()) return false;
    try {
      const decoded = decodeEventLog({
        abi: run.app.aqua.AQUA_EVENTS_ABI,
        data: log.data as Hex,
        topics: log.topics as [Hex, ...Hex[]],
      }) as unknown as { eventName: string; args: Record<string, unknown> };
      return (
        decoded.eventName === "Shipped" &&
        run.app.aqua.matchesStrategy(decoded.args as StrategyEventArgs, {
          maker: awoken.smartAccount,
          app: run.deployment.app,
          strategyHash: strategy.strategyHash,
        })
      );
    } catch {
      return false;
    }
  });
  assert(shipped, "Aqua emitted `Shipped` for this rock's strategy");

  const reading = await run.app.aqua.readStrategy({
    maker: awoken.smartAccount,
    strategyHash: strategy.strategyHash,
  });
  if (reading.state === "UNAVAILABLE") {
    throw new RehearsalError(`safeBalances says the strategy is not live: ${reading.reason}`);
  }
  assert(
    reading.value.virtual.usdc === run.amounts.shipUsdc && reading.value.virtual.weth === run.amounts.shipWeth,
    `safeBalances reports the shipped reserve: ${usdc(reading.value.virtual.usdc)} / ${weth(reading.value.virtual.weth)}`,
  );

  record("2 ship strategy", sent.txHash, "Pimlico paymaster", startedAt);
  return { strategyHash: strategy.strategyHash, strategy, feeBps: BigInt(stream.feeBps) };
}

/* -------------------------------------------------------------------------- */
/* Step 3 — the visitor's swap                                                 */
/* -------------------------------------------------------------------------- */

async function stepSwap(run: Run, awoken: AwakenResult, ship: ShipResult): Promise<void> {
  heading("Step 3 — a visitor swaps against the rock (sponsored batch from their own Safe)");
  const startedAt = Date.now();

  const takerAccount = await run.app.rockAccount.computeRockAccountAddress({
    ownerAddress: run.takerB.address,
    saltNonce: run.app.rockAccount.PERSONAL_ACCOUNT_SALT,
  });
  if (takerAccount.state === "UNAVAILABLE") {
    throw new RehearsalError(`B's personal Safe could not be derived: ${takerAccount.reason}`);
  }
  note(`B's personal Safe is ${takerAccount.value}`);

  // The curve the quote is taken from: live virtual balances when the strategy is shipped, the
  // amounts the run intends to ship when this is a dry run. Both are stated, neither is invented.
  let balanceIn = run.amounts.shipUsdc;
  let balanceOut = run.amounts.shipWeth;
  if (!run.dryRun) {
    const reading = await run.app.aqua.readStrategy({
      maker: awoken.smartAccount,
      strategyHash: ship.strategyHash,
    });
    if (reading.state === "UNAVAILABLE") throw new RehearsalError(reading.reason);
    balanceIn = reading.value.virtual.usdc;
    balanceOut = reading.value.virtual.weth;
  } else {
    note("dry run: the quote is taken against the reserve this run would ship");
  }

  const quote = run.app.aqua.quoteExactIn(
    { balanceIn, balanceOut, feeBps: ship.feeBps },
    run.amounts.swapUsdcIn,
  );
  const floor = run.app.aqua.minAmountOut(quote.amountOut, 100);
  note(
    `selling ${usdc(run.amounts.swapUsdcIn)} quotes ${weth(quote.amountOut)}; floor ${weth(floor)}; fee slice ${usdc(quote.feeAmount)}`,
  );
  assert(
    quote.feeAmount === (run.amounts.swapUsdcIn * ship.feeBps) / run.app.aqua.BPS_BASE,
    "the fee slice is amountIn · feeBps / 10000, the unpriced part of the input",
  );

  const plan = run.app.aqua.buildSwapCall({
    strategy: ship.strategy,
    tokenIn: run.deployment.usdc,
    amountIn: run.amounts.swapUsdcIn,
    minAmountOut: floor,
    to: takerAccount.value,
  });
  if (plan.state === "UNAVAILABLE") {
    throw new RehearsalError(`The swap call could not be built: ${plan.reason}`);
  }
  assert(
    getAddress(plan.value.taker) === run.deployment.taker,
    "the swap goes through the XYCSwapTaker periphery the deployment names",
  );

  if (run.dryRun || !run.bundlerUrl) {
    note("dry run: approve + swapExactIn built, not submitted");
    record("3 visitor swap", "(dry run)", "Pimlico paymaster", startedAt);
    return;
  }

  await transferToken(
    run,
    run.deployment.usdc,
    takerAccount.value,
    run.amounts.swapUsdcIn,
    "fund B's Safe with USDC",
  );

  const client = await buildSafeClient({
    app: run.app,
    publicClient: run.publicClient,
    bundlerUrl: run.bundlerUrl,
    owner: run.takerB,
    saltNonce: run.app.rockAccount.PERSONAL_ACCOUNT_SALT,
  });
  assert(
    getAddress(client.account.address) === takerAccount.value,
    "the Safe the bundler sends from is the one that was funded",
  );

  const beforeRockUsdc = await tokenBalance(run, run.deployment.usdc, awoken.smartAccount);
  const beforeRockWeth = await tokenBalance(run, run.deployment.weth, awoken.smartAccount);
  const beforeTakerWeth = await tokenBalance(run, run.deployment.weth, takerAccount.value);

  const allowance = await run.app.rockAccount.readAllowance(
    run.deployment.usdc,
    takerAccount.value,
    plan.value.taker,
  );
  if (allowance.state === "UNAVAILABLE") throw new RehearsalError(allowance.reason);
  const approvals = run.app.rockAccount.approvalCalls({
    token: run.deployment.usdc,
    spender: plan.value.taker,
    currentAllowance: allowance.value,
    amount: run.amounts.swapUsdcIn,
  });

  const sent = await sendSponsored(run, client, [...approvals, plan.value.call], "the swap");

  const amountOut = run.app.readAmountOutFromLogs(sent.logs, {
    aqua: run.deployment.aqua,
    strategyHash: ship.strategyHash,
    tokenOut: run.deployment.weth,
  });
  if (amountOut === null) {
    throw new RehearsalError(
      `the swap landed in ${sent.txHash} but the amount it paid out could not be read from the receipt`,
    );
  }
  note(`executed: ${usdc(run.amounts.swapUsdcIn)} in, ${weth(amountOut)} out`);
  assert(amountOut >= floor, "the output cleared the floor the taker signed for");

  const afterRockUsdc = await tokenBalance(run, run.deployment.usdc, awoken.smartAccount);
  const afterRockWeth = await tokenBalance(run, run.deployment.weth, awoken.smartAccount);
  const afterTakerWeth = await tokenBalance(run, run.deployment.weth, takerAccount.value);

  assert(
    afterRockUsdc - beforeRockUsdc === run.amounts.swapUsdcIn,
    `the whole gross input landed in the rock's own wallet (+${usdc(afterRockUsdc - beforeRockUsdc)}), fee included`,
  );
  assert(
    beforeRockWeth - afterRockWeth === amountOut,
    `the rock paid out ${weth(beforeRockWeth - afterRockWeth)} from its own wallet`,
  );
  assert(
    afterTakerWeth - beforeTakerWeth === amountOut,
    "the visitor's Safe received exactly what Aqua reported",
  );

  const pushed = sent.logs.some((log) => {
    if (log.address.toLowerCase() !== run.deployment.aqua.toLowerCase()) return false;
    try {
      const decoded = decodeEventLog({
        abi: run.app.aqua.AQUA_EVENTS_ABI,
        data: log.data as Hex,
        topics: log.topics as [Hex, ...Hex[]],
      }) as unknown as { eventName: string; args: Record<string, unknown> };
      return (
        decoded.eventName === "Pushed" &&
        String(decoded.args.token).toLowerCase() === run.deployment.usdc.toLowerCase() &&
        decoded.args.amount === run.amounts.swapUsdcIn &&
        run.app.aqua.matchesStrategy(decoded.args as StrategyEventArgs, {
          maker: awoken.smartAccount,
          app: run.deployment.app,
          strategyHash: ship.strategyHash,
        })
      );
    } catch {
      return false;
    }
  });
  assert(
    pushed,
    `Aqua's \`Pushed\` names the gross ${usdc(run.amounts.swapUsdcIn)}; the ${usdc(quote.feeAmount)} fee stays inside the rock's reserve`,
  );

  record("3 visitor swap", sent.txHash, "Pimlico paymaster", startedAt);
}

/* -------------------------------------------------------------------------- */
/* Step 4 — the gift                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The gift, in the app's own order.
 *
 * `POST /api/rocks/[id]/claim` cannot be called from a script: storing the pre-signed owner swap
 * needs a Privy bearer token, and both the stored operation and the relayer's daily spend cap live
 * in D1, which a Node process has no binding for. So this calls **the same library functions the
 * route calls, in the same order**: `verifyAttestation`, then `submitSignedUserOp` for the Safe
 * owner swap, and only then `submitClaimHandover`. The ordering is the point (review N-1, D-032):
 * the registry refuses a claim whose named account does not already answer to the claimant.
 *
 * What the script cannot exercise is the route's own guards — the rate limits, the cap reservation
 * in D1, and the refusal of open gifts. They are unit-tested; the relayer's cap is DEMO-STATE P-10
 * and stays unproven here.
 */
async function stepGift(run: Run, awoken: AwakenResult): Promise<void> {
  heading("Step 4 — A gives the rock to C (owner swap first, then the claim)");
  const startedAt = Date.now();

  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const messageHash = run.app.rockAccount.messageHashFor("Rehearsal gift");
  const initiateData = run.app.rockAccount.encodeInitiateHandover(
    BigInt(awoken.rockId),
    run.recipientC.address,
    expiresAt,
    messageHash,
  );
  note(`initiateHandover to ${run.recipientC.address}, expires ${expiresAt}`);

  const swapOwnerCall = run.app.rockAccountServer.buildSwapOwnerUserOpCall({
    safeAddress: awoken.smartAccount,
    currentOwner: run.ownerA.address,
    newOwner: run.recipientC.address,
  });
  note(`pre-signed Safe.swapOwner calldata ${swapOwnerCall.data.length / 2 - 1} bytes`);

  if (run.dryRun || !awoken.client) {
    const attestation = await signAttestationOrFail(run, {
      rockId: awoken.rockId,
      subject: run.recipientC.address,
      smartAccount: awoken.smartAccount,
    });
    note(`C's claim attestation counter ${attestation.message.counter}`);
    note(
      "dry run: the handover, the pre-signed owner swap and the relayed claim are built but not submitted",
    );
    record("4 gift to C", "(dry run)", "Pimlico paymaster + relayer", startedAt);
    return;
  }

  const initiated = await sendSponsored(
    run,
    awoken.client,
    [{ to: run.deployment.registry, data: initiateData, value: BigInt(0) }],
    "initiateHandover",
  );
  const pending = await readRockOrFail(run, awoken.rockId);
  assert(pending.state === "handover_pending", "the registry reports a gift waiting");
  assert(
    pending.handover !== null &&
      getAddress(pending.handover.recipient ?? zeroAddress) === getAddress(run.recipientC.address),
    "the gift names C, so an owner swap can be pre-signed for it (open gifts cannot be — D-032)",
  );

  // Prepared *after* the handover landed, so the nonce it carries is the account's next one —
  // exactly when `useBankRock.initiateHandover` prepares it.
  const prepared = await awoken.client.prepareUserOperation({ calls: [swapOwnerCall] });
  const signature = await awoken.client.account.signUserOperation(prepared as never);
  const storedUserOp = serialiseUserOp(prepared, signature);
  assert(
    getAddress(storedUserOp.sender as Address) === awoken.smartAccount,
    "the stored operation's sender is this rock's Rock Account",
  );

  const attestation = await signAttestationOrFail(run, {
    rockId: awoken.rockId,
    subject: run.recipientC.address,
    smartAccount: awoken.smartAccount,
  });

  // The verifier resolves the account server-side; for a rock mid-handover that is the account the
  // registry already holds, never a freshly derived one.
  const resolved = await run.app.resolution.resolveSmartAccount({
    subject: run.recipientC.address,
    uidHash: run.uidHash,
    record: pending,
  });
  assert(
    resolved.ok && getAddress(resolved.smartAccount) === awoken.smartAccount && resolved.mode === "claim",
    "the app resolves the claim's Rock Account to the one the registry holds",
  );

  expectReal(
    await run.app.rockAccountServer.verifyAttestation(attestation, awoken.rockId),
    "the server accepts C's attestation (the route's first check)",
  );

  const swapResult = await run.app.rockAccountServer.submitSignedUserOp(
    storedUserOp as unknown as Parameters<
      typeof run.app.rockAccountServer.submitSignedUserOp
    >[0],
  );
  if (swapResult.state === "UNAVAILABLE") {
    throw new RehearsalError(`The Rock Account owner swap did not land: ${swapResult.reason}`);
  }
  say(`  tx      ${swapResult.value.txHash}  (Safe.swapOwner, pre-signed by A)`);

  const ownsBeforeClaim = (await run.publicClient.readContract({
    address: awoken.smartAccount,
    abi: SAFE_OWNERS_ABI,
    functionName: "isOwner",
    args: [run.recipientC.address],
  })) as boolean;
  assert(ownsBeforeClaim, "the Safe answers to C *before* the registry claim is broadcast (D-032)");

  const claim = await run.app.rockAccountServer.submitClaimHandover(awoken.rockId, attestation);
  if (claim.state === "UNAVAILABLE") {
    throw new RehearsalError(`The relayed claim was not broadcast: ${claim.reason}`);
  }
  say(`  tx      ${claim.value.txHash}  (claimHandover, relayed)`);
  await waitForTx(run, claim.value.txHash, "claimHandover");

  const claimed = await readRockOrFail(run, awoken.rockId);
  assert(getAddress(claimed.owner) === getAddress(run.recipientC.address), "the registry owner is C");
  assert(claimed.state === "awake", "the rock is awake again, with no gift outstanding");
  assert(
    getAddress(claimed.smartAccount) === awoken.smartAccount,
    "the Rock Account address did not move, so the rock's money stayed exactly where it was",
  );

  const owners = (await run.publicClient.readContract({
    address: awoken.smartAccount,
    abi: SAFE_OWNERS_ABI,
    functionName: "getOwners",
  })) as readonly Address[];
  assert(
    owners.length === 1 && getAddress(owners[0]) === getAddress(run.recipientC.address),
    "the Safe's only owner is C",
  );

  record("4 gift to C", `${initiated.txHash} → ${swapResult.value.txHash} → ${claim.value.txHash}`, "Pimlico paymaster + relayer", startedAt);
}

/* -------------------------------------------------------------------------- */
/* Step 5 — archive and start over                                             */
/* -------------------------------------------------------------------------- */

/**
 * Flow K after a gift, and the one place the app cannot follow its own path.
 *
 * `useBankRock` sends every owner action from the Rock Account, and it refuses to act unless the
 * Safe it derives from (signed-in wallet, tag) is the account the registry holds. After a gift
 * that is false by construction: the account belongs to the *giver's* derivation and the new owner
 * derives a different address (D-029 — the mapping is (tag, owner) → account). The registry itself
 * accepts the owner's own wallet as `msg.sender`, so that is what this step uses, and it says so.
 */
async function stepArchiveAndRestart(run: Run, awoken: AwakenResult): Promise<void> {
  heading("Step 5 — C retires the rock, and the same tag awakens the next one");
  const startedAt = Date.now();

  const derivedForC = await run.app.rockAccount.computeRockAccountAddress({
    ownerAddress: run.recipientC.address,
    saltNonce: run.saltNonce,
  });
  if (derivedForC.state === "UNAVAILABLE") {
    throw new RehearsalError(`C's Rock Account could not be derived: ${derivedForC.reason}`);
  }
  if (derivedForC.value !== awoken.smartAccount) {
    finding(
      `after a gift the app's own owner actions are unreachable for the new owner: the rock's account is ${awoken.smartAccount} (derived for A) while the app derives ${derivedForC.value} for C, and \`useBankRock\` refuses the mismatch. The registry accepts C's own wallet, which is what this step uses.`,
    );
  }

  const archiveData = run.app.rockAccount.encodeArchiveRock(BigInt(awoken.rockId));

  if (run.dryRun || !run.bundlerUrl) {
    note(`dry run: archiveRock calldata ${archiveData.length / 2 - 1} bytes, sent from C's own wallet`);
    const nextId = await findDormantRockId(run, Number(awoken.rockId) + 1);
    note(`the next dormant rock id is ${nextId}; it would awaken into ${derivedForC.value}`);
    record("5 archive and re-awaken", "(dry run)", "Pimlico paymaster + funder", startedAt);
    return;
  }

  // C has never held gas — the recipient of a gift never does. The rehearsal funder tops them up
  // for this one transaction, because the app has no path for it (see the FINDING above).
  const funderWallet = createWalletClient({
    account: run.funder,
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL || undefined),
  });
  const topUp = await funderWallet.sendTransaction({
    to: run.recipientC.address,
    value: parseUnits("0.002", 18),
  });
  say(`  tx      ${topUp}  (gas for C)`);
  await waitForTx(run, topUp, "the top-up for C");

  const cWallet = createWalletClient({
    account: run.recipientC,
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL || undefined),
  });
  const archiveHash = await cWallet.sendTransaction({
    to: run.deployment.registry,
    data: archiveData,
    value: BigInt(0),
  });
  say(`  tx      ${archiveHash}  (archiveRock, from C's own wallet)`);
  await waitForTx(run, archiveHash, "archiveRock");

  const archived = await readRockOrFail(run, awoken.rockId);
  assert(archived.state === "archived", `rock ${awoken.rockId} is archived`);

  const boundTo = await run.app.rockAccount.resolveRockForTag(run.uidHash);
  if (boundTo.state === "UNAVAILABLE") throw new RehearsalError(boundTo.reason);
  assert(boundTo.value.rockId === null, "archiving released the tag, so it can back a new rock");

  const reserves = await run.app.rockAccount.readReserves(awoken.smartAccount);
  if (reserves.state === "UNAVAILABLE") throw new RehearsalError(reserves.reason);
  note(
    `the retired rock's account still holds ${usdc(reserves.value.usdc)} and ${weth(reserves.value.weth)}, and C owns it`,
  );

  // The verifier's own resolution for the next tap: an archived record is not a claim, so the
  // account is derived from (subject, tag) again.
  const resolved = await run.app.resolution.resolveSmartAccount({
    subject: run.recipientC.address,
    uidHash: run.uidHash,
    record: archived,
  });
  assert(
    resolved.ok && resolved.mode === "awaken" && getAddress(resolved.smartAccount) === derivedForC.value,
    "the next tap resolves to the account (this tag, C) derives, deterministically",
  );

  const nextRockId = await findDormantRockId(run, Number(awoken.rockId) + 1);
  const attestation = await signAttestationOrFail(run, {
    rockId: nextRockId,
    subject: run.recipientC.address,
    smartAccount: derivedForC.value,
  });

  const client = await buildSafeClient({
    app: run.app,
    publicClient: run.publicClient,
    bundlerUrl: run.bundlerUrl,
    owner: run.recipientC,
    saltNonce: run.saltNonce,
  });
  assert(
    getAddress(client.account.address) === derivedForC.value,
    "the new Rock Account is the counterfactual address the attestation names",
  );

  const sent = await sendSponsored(
    run,
    client,
    [
      {
        to: run.deployment.registry,
        data: run.app.rockAccount.encodeAwaken(BigInt(nextRockId), derivedForC.value, attestation),
        value: BigInt(0),
      },
    ],
    `awakenRock ${nextRockId}`,
  );

  const reborn = await readRockOrFail(run, nextRockId);
  assert(getAddress(reborn.owner) === getAddress(run.recipientC.address), `rock ${nextRockId} is owned by C`);
  assert(
    getAddress(reborn.smartAccount) === derivedForC.value,
    "the same tag awakened a new rock id into the Rock Account its owner derives",
  );
  assert(
    reborn.uidHash.toLowerCase() === run.uidHash.toLowerCase(),
    "the new rock carries the same tag",
  );

  record("5 archive and re-awaken", `${archiveHash} → ${sent.txHash}`, "Pimlico paymaster + funder", startedAt);
}

/* -------------------------------------------------------------------------- */
/* Report                                                                      */
/* -------------------------------------------------------------------------- */

function writeReport(run: Run): string {
  const day = new Date().toISOString().slice(0, 10);
  const path = join(REPO_ROOT, "contracts", "deployments", `rehearsal-${day}.md`);
  const body = [
    `# Live Sepolia rehearsal — ${day}`,
    "",
    "Produced by `web/scripts/rehearse-sepolia.ts` (spec 20 WP-2). Every hash below came from a",
    "bundler or an RPC that accepted the transaction; every assertion was read back from chain.",
    "",
    `- registry \`${run.deployment.registry}\` (block ${run.deployment.registryDeployBlock})`,
    `- XYCSwap app \`${run.deployment.app}\` (block ${run.deployment.appDeployBlock})`,
    `- XYCSwapTaker \`${run.deployment.taker}\``,
    `- Aqua \`${run.deployment.aqua}\`, USDC \`${run.deployment.usdc}\`, WETH \`${run.deployment.weth}\``,
    `- tag uid hash \`${run.uidHash}\` (synthetic, generated for this run)`,
    `- owner A \`${run.ownerA.address}\`, taker B \`${run.takerB.address}\`, recipient C \`${run.recipientC.address}\``,
    "",
    "## Steps",
    "",
    "```",
    ...table(),
    "```",
    "",
    "## Full output",
    "",
    "```",
    ...lines,
    "```",
    "",
  ].join("\n");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, "utf8");
  return path;
}

/* -------------------------------------------------------------------------- */
/* main                                                                        */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const dryRun =
    process.argv.includes("--dry-run") || process.env.REHEARSAL_DRY_RUN === "true";

  const deployment = loadDeployment();
  exportEnvironment(deployment);

  const app = await loadAppLibraries();

  const rpcUrl = process.env.SEPOLIA_RPC_URL?.trim();
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: rpcUrl ? http(rpcUrl, { timeout: 20_000, retryCount: 2 }) : http(),
  }) as PublicClient;

  const attester = keyOrThrowaway("ATTESTATION_SIGNER_PRIVATE_KEY", dryRun, "attestations");
  const relayer = keyOrThrowaway("RELAYER_PRIVATE_KEY", dryRun, "the relayed claim");
  const funder = keyOrThrowaway("REHEARSAL_FUNDER_PRIVATE_KEY", dryRun, "funding");

  const pimlicoKey = process.env.PIMLICO_API_KEY?.trim();
  if (!pimlicoKey && !dryRun) {
    throw new RehearsalError("PIMLICO_API_KEY is not configured, so no operation can be sponsored");
  }
  const bundlerUrl = pimlicoKey ? `https://api.pimlico.io/v2/sepolia/rpc?apikey=${pimlicoKey}` : null;

  const uidHex = process.env.REHEARSAL_TAG_UID?.trim();
  if (uidHex && !/^(0x)?[0-9a-fA-F]{14}$/.test(uidHex)) {
    throw new RehearsalError("REHEARSAL_TAG_UID must be seven bytes of hex (14 characters)");
  }
  const uid = uidHex ? Buffer.from(uidHex.replace(/^0x/, ""), "hex") : randomBytes(7);
  const uidHash = app.attestation.hashUid(uid);

  const run: Run = {
    dryRun,
    app,
    deployment,
    publicClient,
    bundlerUrl,
    attester: attester.account,
    relayer: relayer.account,
    funder: funder.account,
    ownerA: privateKeyToAccount(generatePrivateKey()),
    takerB: privateKeyToAccount(generatePrivateKey()),
    recipientC: privateKeyToAccount(generatePrivateKey()),
    uid,
    uidHash,
    saltNonce: app.rockAccount.rockAccountSaltFor(uidHash),
    counter: 0,
    amounts: {
      shipUsdc: amountFromEnv("REHEARSAL_SHIP_USDC", "2", USDC_DECIMALS),
      shipWeth: amountFromEnv("REHEARSAL_SHIP_WETH", "0.001", WETH_DECIMALS),
      swapUsdcIn: amountFromEnv("REHEARSAL_SWAP_USDC_IN", "0.25", USDC_DECIMALS),
    },
  };

  say(`Bank Rock — live Sepolia rehearsal${dryRun ? " (dry run: nothing is broadcast)" : ""}`);
  say(`repository ${REPO_ROOT}`);
  say(`rpc        ${rpcUrl ? "SEPOLIA_RPC_URL" : "viem's default Sepolia transport (SEPOLIA_RPC_URL unset)"}`);
  say(`bundler    ${bundlerUrl ? "Pimlico (PIMLICO_API_KEY)" : "none (PIMLICO_API_KEY unset)"}`);
  say(`tokens     ${deployment.tokenSource}`);
  for (const [name, key] of [
    ["ATTESTATION_SIGNER_PRIVATE_KEY", attester],
    ["RELAYER_PRIVATE_KEY", relayer],
    ["REHEARSAL_FUNDER_PRIVATE_KEY", funder],
  ] as const) {
    say(`${name.padEnd(30)} ${key.throwaway ? "throwaway, generated for this dry run" : "configured"} → ${key.account.address}`);
  }

  await preflight(run);
  const awoken = await stepAwaken(run);
  const ship = await stepShip(run, awoken);
  await stepSwap(run, awoken, ship);
  await stepGift(run, awoken);
  await stepArchiveAndRestart(run, awoken);

  heading("Summary");
  for (const row of table()) say(row);

  if (!dryRun) {
    const path = writeReport(run);
    say("");
    say(`report written to ${path}`);
  } else {
    say("");
    say("dry run complete: everything up to the first broadcast ran, and nothing was sent.");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  say("");
  say(`FAILED: ${message}`);
  if (steps.length > 0) {
    say("");
    for (const row of table()) say(row);
  }
  process.exitCode = 1;
});
