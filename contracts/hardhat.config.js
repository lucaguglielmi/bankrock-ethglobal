/**
 * Hardhat 3 configuration for the Bank Rock registry.
 *
 * Target network is Ethereum Sepolia (chain ID 11155111) per decision D-023. The previous
 * `baseSepolia` entry is removed: nothing in this project deploys to Base any more.
 *
 * No address, key or RPC URL is hardcoded here. `SEPOLIA_RPC_URL` and `DEPLOYER_PRIVATE_KEY`
 * come from the environment; with neither set, only the in-process `hardhat` network works,
 * which is all the test suite needs.
 */
/**
 * Registry settings — unchanged. Everything outside `contracts/aqua/**` compiles exactly as it
 * did before the Aqua integration landed.
 */
const registryCompiler = {
  version: "0.8.24",
  settings: {
    // OpenZeppelin 5.6 uses `mcopy`, which needs Cancun. Sepolia is post-Cancun.
    evmVersion: "cancun",
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
};

/**
 * The vendored 1inch Aqua sources (`contracts/aqua/**`) pin `pragma solidity 0.8.30` and are
 * copied unmodified, so they need their own compiler. Settings mirror the upstream
 * `foundry.toml` profile: optimizer on, 10,000,000 runs, `viaIR`. Cancun is required twice over —
 * `AquaApp` uses EIP-1153 transient storage through `@1inch/solidity-utils`, and so does our
 * taker helper.
 */
const aquaCompiler = {
  version: "0.8.30",
  settings: {
    evmVersion: "cancun",
    viaIR: true,
    optimizer: {
      enabled: true,
      runs: 10_000_000,
    },
  },
};

/** Every file that must build with `aquaCompiler`, keyed by its project-relative path. */
const aquaSources = [
  "contracts/aqua/src/Aqua.sol",
  "contracts/aqua/src/AquaApp.sol",
  "contracts/aqua/src/interfaces/IAqua.sol",
  "contracts/aqua/src/libs/Balance.sol",
  "contracts/aqua/examples/apps/XYCSwap.sol",
  "contracts/aqua/examples/apps/interfaces/IXYCSwapCallback.sol",
  "contracts/aqua/XYCSwapTaker.sol",
  "test/aqua/XYCSwapStrategy.t.sol",
  "test/aqua/SharedReserve.t.sol",
];

/**
 * Files that keep the original 0.8.24 profile. Hardhat picks the highest configured compiler a
 * file's pragma allows, so without these the registry — `^0.8.24` — would silently move to
 * 0.8.30 with `viaIR` and 10,000,000 runs the moment the Aqua compiler was added. Pinning it
 * here keeps its bytecode and its build settings exactly as they were.
 */
const registrySources = ["contracts/BankRockRegistry.sol", "test/BankRockRegistry.t.sol"];

export default {
  solidity: {
    compilers: [registryCompiler, aquaCompiler],
    overrides: {
      ...Object.fromEntries(registrySources.map((file) => [file, registryCompiler])),
      ...Object.fromEntries(aquaSources.map((file) => [file, aquaCompiler])),
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
    },
    sepolia: {
      type: "http",
      url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 11155111,
    },
  },
};
