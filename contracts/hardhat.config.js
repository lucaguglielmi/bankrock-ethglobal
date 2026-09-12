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
export default {
  solidity: {
    version: "0.8.24",
    settings: {
      // OpenZeppelin 5.6 uses `mcopy`, which needs Cancun. Sepolia is post-Cancun.
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
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
