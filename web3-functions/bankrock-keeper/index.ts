import {
  Web3Function,
  Web3FunctionContext,
} from "@gelatonetwork/web3-functions-sdk";
import { createPublicClient, http, parseAbi, encodeFunctionData } from "viem";

/**
 * Bank Rock Autonomous Liquidity Keeper
 * Powered by Gelato Web3 Functions
 * 
 * This decentralized keeper monitors the 1inch Aqua Constant Product pool
 * for a Bank Rock Safe Account on Base Sepolia. If the price of WETH drifts
 * causing the 50/50 portfolio ratio to deviate by more than 3%, the Gelato
 * network automatically signs and executes a rebalance UserOp.
 */

const BANKROCK_REGISTRY_ABI = parseAbi([
  "function getRockSafe(uint256 rockId) view returns (address)",
  "function isActivated(uint256 rockId) view returns (bool)"
]);

const AQUA_ROUTER_ABI = parseAbi([
  "function rebalance(address safe, bytes32 strategyHash) external"
]);

Web3Function.onRun(async (context: Web3FunctionContext) => {
  const { multiChainProvider } = context;

  // The Gelato context provides an RPC provider for the target network (Base Sepolia)
  const provider = multiChainProvider.default();

  // Create a viem client for easier read operations
  const publicClient = createPublicClient({
    transport: http(provider.connection.url),
  });

  const registryAddress = "0xBankRockRegistryAddressHere" as `0x${string}`;
  const aquaRouterAddress = "0x1inchAquaRouterAddressHere" as `0x${string}`;

  // Read arguments passed by the Gelato Task configuration
  const rockId = (await context.secrets.get("ROCK_ID")) || "1";

  try {
    // 1. Check if Rock is activated
    /*
    const isActivated = await publicClient.readContract({
      address: registryAddress,
      abi: BANKROCK_REGISTRY_ABI,
      functionName: "isActivated",
      args: [BigInt(rockId)],
    });

    if (!isActivated) {
      return { canExec: false, message: `Rock #${rockId} is not activated yet.` };
    }
    */

    // 2. Fetch current prices & Aqua pool state
    // (Mocking the math for the hackathon MVP, as 1inch Aqua testnet contracts are heavily stubbed)
    const currentEthPrice = 2850.0; 
    const poolUsdc = 1250.0;
    const poolWeth = 0.45;
    
    const wethValueUsdc = poolWeth * currentEthPrice;
    const totalValueUsdc = poolUsdc + wethValueUsdc;
    const currentRatioUsdcPercent = (poolUsdc / totalValueUsdc) * 100;
    const targetRatio = 50.0;
    
    const deviation = Math.abs(currentRatioUsdcPercent - targetRatio);
    const THRESHOLD = 3.0; // 3% deviation tolerance

    if (deviation >= THRESHOLD) {
      console.log(`[Gelato] Rock #${rockId} drift detected: ${deviation.toFixed(2)}%. Executing rebalance.`);
      
      // 3. Encode the transaction for Gelato to execute
      /*
      const safeAddress = await publicClient.readContract({
         address: registryAddress,
         abi: BANKROCK_REGISTRY_ABI,
         functionName: "getRockSafe",
         args: [BigInt(rockId)],
      });
      */
      const mockSafeAddress = "0x89F735F4C74F878D3aAc6e60b134d115e5E29631";

      const callData = encodeFunctionData({
        abi: AQUA_ROUTER_ABI,
        functionName: "rebalance",
        args: [
          mockSafeAddress, 
          "0x0000000000000000000000000000000000000000000000000000000000000000" // Mock strategy hash
        ]
      });

      return {
        canExec: true,
        callData: [
          {
            to: aquaRouterAddress,
            data: callData,
          },
        ],
      };
    } else {
      return {
        canExec: false,
        message: `Rock #${rockId} portfolio is healthy (Deviation: ${deviation.toFixed(2)}% < ${THRESHOLD}%)`,
      };
    }

  } catch (err: any) {
    console.error("Gelato Web3 Function Error:", err);
    return { canExec: false, message: `Execution failed: ${err.message}` };
  }
});
