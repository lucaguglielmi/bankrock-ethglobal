import {
  Web3Function,
  Web3FunctionContext,
} from "@gelatonetwork/web3-functions-sdk";
import { createPublicClient, http, parseAbi, encodeFunctionData, formatEther } from "viem";

const BANKROCK_REGISTRY_ABI = parseAbi([
  "function rocks(uint256 rockId) view returns (address smartAccount, address currentOwner, uint256 awakenedAt, bool isAwake)",
]);

const AQUA_ROUTER_ABI = parseAbi([
  "function rebalance(address safe, bytes32 strategyHash) external"
]);

// Helper to fire email alerts if rebalance fails
async function fireAlert(message: string, context: Web3FunctionContext) {
  try {
    const alertUrl = await context.secrets.get("ALERT_API_URL"); // e.g. https://bankrock.xyz/api/alerts/gelato
    if (alertUrl) {
      await fetch(alertUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, source: "gelato_keeper" })
      });
    }
  } catch (e) {
    console.error("Failed to send alert", e);
  }
}

Web3Function.onRun(async (context: Web3FunctionContext) => {
  const { multiChainProvider } = context;
  const provider = multiChainProvider.default();
  
  const publicClient = createPublicClient({
    transport: http(provider.connection.url),
  });

  const registryAddress = "0x89F735F4C74F878D3aAc6e60b134d115e5E29631" as `0x${string}`;
  const aquaRouterAddress = "0x1111111254EEB25477B68fb85Ed929f73A960582" as `0x${string}`;
  const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;

  const rockId = (await context.secrets.get("ROCK_ID")) || "1";

  try {
    // 1. Check if Rock is activated
    const rockData = await publicClient.readContract({
      address: registryAddress,
      abi: BANKROCK_REGISTRY_ABI,
      functionName: "rocks",
      args: [BigInt(rockId)],
    });

    const isAwake = rockData[3];
    const safeAddress = rockData[0];

    if (!isAwake || safeAddress === "0x0000000000000000000000000000000000000000") {
      return { canExec: false, message: `Rock #${rockId} is not activated.` };
    }

    // 2. Fetch real on-chain balances
    const wethBalanceWei = await publicClient.getBalance({ address: safeAddress });
    const poolWeth = Number(formatEther(wethBalanceWei));

    const usdcBalanceWei = await publicClient.readContract({
      address: usdcAddress,
      abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
      functionName: "balanceOf",
      args: [safeAddress],
    });
    const poolUsdc = Number(usdcBalanceWei) / 1e6;

    // 3. Fetch Real-time Spot Price from 1inch (or Pyth)
    // To prevent API key leak in the web3 function log, we use our own proxy we just built!
    const quoteUrl = await context.secrets.get("QUOTE_API_URL") || "https://bankrock.xyz/api/quote";
    let currentEthPrice = 2850.0;
    try {
      // 1 WETH to USDC quote
      const qRes = await fetch(`${quoteUrl}?src=0x4200000000000000000000000000000000000006&dst=${usdcAddress}&amount=1000000000000000000`);
      if (qRes.ok) {
        const qData = await qRes.json();
        currentEthPrice = Number(qData.toAmount) / 1e6;
      }
    } catch (e) {
      console.warn("Failed to fetch live price, falling back to cached...", e);
    }

    const wethValueUsdc = poolWeth * currentEthPrice;
    const totalValueUsdc = poolUsdc + wethValueUsdc;
    
    // If portfolio is empty, nothing to rebalance
    if (totalValueUsdc < 1) {
      return { canExec: false, message: "Portfolio is empty." };
    }

    const currentRatioUsdcPercent = (poolUsdc / totalValueUsdc) * 100;
    const targetRatio = 50.0;
    
    const deviation = Math.abs(currentRatioUsdcPercent - targetRatio);
    const THRESHOLD = 3.0; // 3% deviation tolerance

    if (deviation >= THRESHOLD) {
      console.log(`[Gelato] Rock #${rockId} drift detected: ${deviation.toFixed(2)}%. Executing rebalance.`);
      
      const callData = encodeFunctionData({
        abi: AQUA_ROUTER_ABI,
        functionName: "rebalance",
        args: [
          safeAddress, 
          "0x0000000000000000000000000000000000000000000000000000000000000000" // Standard 50/50 Strategy Hash
        ]
      });

      // Gas price protection check could go here

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
    await fireAlert(`Gelato Rebalance Failed for Rock #${rockId}: ${err.message}`, context);
    return { canExec: false, message: `Execution failed: ${err.message}` };
  }
});
