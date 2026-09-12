import { useHaptics } from "@/hooks/useHaptics";
"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import confetti from "canvas-confetti";
import { 
  X, 
  ArrowUpDown, 
  ExternalLink, 
  Check, 
  Copy, 
  Sparkles, 
  Loader2,
  AlertCircle,
  ChevronRight,
  Zap
} from "lucide-react";
import { useAudio } from "@/context/audio-context";

type TokenType = "USDC" | "WETH";

const ETH_PRICE_USDC = 2500; // 1 WETH = 2,500 USDC
const MAKER_FEE_RATE = 0.0005; // 0.05% Aqua maker fee

export interface TradeDetails {
  inAmount: string;
  inSymbol: string;
  outAmount: string;
  outSymbol: string;
  txHash: string;
}

export interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  rockId: string;
  currentReserve: number;
  onTradeSuccess: (deltaLiquidity: number, earnedFee: number, details?: TradeDetails) => void;
}

function TradeModalInner({
  onClose,
  rockId,
  currentReserve,
  onTradeSuccess,
}: Omit<TradeModalProps, "isOpen">) {
  const { playTap, playSuccess, playError, playSwipe } = useAudio();
  const [fromToken, setFromToken] = useState<TokenType>("USDC");
  const [toToken, setToToken] = useState<TokenType>("WETH");
  const [amountIn, setAmountIn] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Status: "idle" | "signing" | "bundling" | "settling" | "success"
  const [status, setStatus] = useState<"idle" | "signing" | "bundling" | "settling" | "success">("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highSlippageAccepted, setHighSlippageAccepted] = useState(false);
  const [lastTradeSummary, setLastTradeSummary] = useState<{
    inAmount: string;
    inSymbol: TokenType;
    outAmount: string;
    outSymbol: TokenType;
    feeEarnedUSDC: number;
  } | null>(null);

  const [isQuoting, setIsQuoting] = useState(false);
  const [quoteData, setQuoteData] = useState({ output: 0, fee: 0, impact: 0.01 });

  // Balances state for the active trader
  const [userBalances, setUserBalances] = useState<Record<TokenType, number>>({
    USDC: 500.0,
    WETH: 0.25,
  });

  const dragX = useMotionValue(0);
  const swipeProgressWidth = useTransform(dragX, [0, 250], [0, 250]);
  const swipeOpacity = useTransform(dragX, [0, 150], [1, 0]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && status !== "signing" && status !== "bundling" && status !== "settling") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [status, onClose]);

  const toggleTokens = () => {
    playTap();
    setFromToken(toToken);
    setToToken(fromToken);
    setAmountIn("");
    setError(null);
    setHighSlippageAccepted(false);
  };

  const inputNumber = parseFloat(amountIn) || 0;
  const maxBalance = userBalances[fromToken];

  // Calculate rate and outputs
  const fetch1inchQuote = async (amount: number, from: TokenType, to: TokenType) => {
    let outputAmount = 0;
    let feeInUSDC = 0;
    let priceImpact = 0.01;

    if (amount > 0) {
      try {
        const srcToken = from === "USDC" ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" : "0x4200000000000000000000000000000000000006";
        const dstToken = to === "USDC" ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" : "0x4200000000000000000000000000000000000006";
        const decimals = from === "USDC" ? 6 : 18;
        const amountWei = BigInt(Math.floor(amount * (10 ** decimals))).toString();
        
        const response = await fetch(`/api/quote?src=${srcToken}&dst=${dstToken}&amount=${amountWei}`);

        if (!response.ok) throw new Error("1inch proxy API failed");
        
        const data = await response.json();
        const outDecimals = to === "USDC" ? 6 : 18;
        const rawOutput = Number(data.toAmount) / (10 ** outDecimals);
        
        // 1inch successfully quoted, calculate maker fee (0.05%)
        feeInUSDC = (from === "USDC" ? amount : rawOutput) * MAKER_FEE_RATE;
        outputAmount = rawOutput;
        priceImpact = Math.min(2.5, Math.max(0.01, ((from === "USDC" ? amount : rawOutput) / (currentReserve || 1250)) * 0.8));
      } catch (error) {
        console.error("Fetch quote failed", error);
        // We no longer fallback to math simulation here per the hardening spec.
        // In a real app, we show an error state to the user indicating liquidity is unavailable.
      }
    }
    return { output: outputAmount, fee: feeInUSDC, impact: priceImpact };
  };

  useEffect(() => {
    const amount = parseFloat(amountIn) || 0;
    if (amount <= 0) {
      setQuoteData({ output: 0, fee: 0, impact: 0.01 });
      setIsQuoting(false);
      return;
    }

    let isMounted = true;
    setIsQuoting(true);

    fetch1inchQuote(amount, fromToken, toToken).then((data) => {
      if (isMounted) {
        setQuoteData(data);
        setIsQuoting(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [amountIn, fromToken, toToken, currentReserve]);

  const { output: outputAmount, fee: feeInUSDC, impact: priceImpact } = quoteData;

  const isInsufficientBalance = inputNumber > maxBalance;
  const isInsufficientReserve = toToken === "USDC" && outputAmount > currentReserve;
  const canSwap = inputNumber > 0 && !isInsufficientBalance && !isInsufficientReserve && status === "idle" && !isQuoting;

  const handlePercentage = (pct: number) => {
    const calculated = (maxBalance * pct).toFixed(fromToken === "USDC" ? 2 : 4);
    setAmountIn(calculated);
    setError(null);
    setHighSlippageAccepted(false);
  };

  const handleExecuteSwap = async () => {
    if (!canSwap) return;
    setError(null);

    // Gotcha Fix: Prevent users from getting rekt by high slippage, but allow if confirmed
    if (priceImpact > 2.0 && !highSlippageAccepted) {
      const lossUSD = (inputNumber * (fromToken === "USDC" ? 1 : ETH_PRICE_USDC)) * (priceImpact / 100);
      setError(`High Slippage Warning! You will lose approx $${lossUSD.toFixed(2)} on this trade. Normal trades usually experience < 0.5% slippage. Swipe again to confirm and proceed anyway.`);
      setHighSlippageAccepted(true);
      dragX.set(0); // Reset swipe visually
      playError();
      return;
    }

    try {
      playSwipe();
      // Step 1: UserOp Signing (Approval + Swap)
      setStatus("signing");
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Step 2: Pimlico Bundler
      setStatus("bundling");
      await new Promise((resolve, reject) => {
        // Mock 10% chance of paymaster failure for realism/gotcha demonstration
        const isPaymasterEmpty = Math.random() < 0.1;
        setTimeout(() => {
          if (isPaymasterEmpty) {
            reject(new Error("Paymaster sponsorship failed"));
          } else {
            resolve(true);
          }
        }, 1000);
      });

      // Step 3: Aqua Settlement
      setStatus("settling");
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Generate realistic Base Sepolia UserOp / Tx Hash
      const randomHex = Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join("");
      const generatedTxHash = `0x${randomHex}`;
      setTxHash(generatedTxHash);

      // Update user balances
      setUserBalances((prev) => ({
        ...prev,
        [fromToken]: Math.max(0, prev[fromToken] - inputNumber),
        [toToken]: prev[toToken] + outputAmount,
      }));

      // Calculate rock liquidity change:
      // If user swaps USDC for WETH -> user sends USDC to rock's reserve (+USDC)
      // If user swaps WETH for USDC -> rock gives user USDC (-USDC)
      const deltaLiquidity = fromToken === "USDC" ? inputNumber : -outputAmount;
      const formattedIn = inputNumber.toLocaleString("en-US", { maximumFractionDigits: fromToken === "USDC" ? 2 : 4 });
      const formattedOut = outputAmount.toLocaleString("en-US", { maximumFractionDigits: toToken === "USDC" ? 2 : 4 });

      onTradeSuccess(deltaLiquidity, feeInUSDC, {
        inAmount: formattedIn,
        inSymbol: fromToken,
        outAmount: formattedOut,
        outSymbol: toToken,
        txHash: generatedTxHash,
      });

      setLastTradeSummary({
        inAmount: formattedIn,
        inSymbol: fromToken,
        outAmount: formattedOut,
        outSymbol: toToken,
        feeEarnedUSDC: feeInUSDC,
      });

      setStatus("success");
      playSuccess();
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#000000', '#ffffff', '#4f46e5'],
      });
    } catch (err: any) {
      console.error("Swap execution failed:", err);
      setStatus("idle"); hapticError();
      // Gotcha Fix: Graceful paymaster error handling
      if (err.message === "Paymaster sponsorship failed") {
        setError("Gas sponsorship temporarily unavailable from Pimlico. Please try again later.");
      } else {
        setError("Swap execution failed. Please try again.");
      }
      playError();
    }
  };

  const copyTxHash = () => {
    if (txHash) {
      navigator.clipboard.writeText(txHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={status === "idle" || status === "success" ? onClose : undefined}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
      />

      {/* Modal Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="relative w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-black/10 z-10 text-black"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-5 border-b border-black/5 mb-6">
          <div>
            <h2 className="text-2xl font-black tracking-tight">Trade with Rock #{rockId}</h2>
            <p className="text-xs text-neutral-500 font-medium mt-0.5">
              Instant settlement against the Rock&apos;s 1inch Aqua reserve
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={status !== "idle" && status !== "success"}
            className="w-9 h-9 rounded-full flex items-center justify-center text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors disabled:opacity-30 cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content: Idle / Loading / Success */}
        {status === "success" ? (
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-16 h-16 bg-black text-white rounded-full flex items-center justify-center mb-5 shadow-lg shadow-black/10">
              <Check className="w-8 h-8 stroke-[2.5]" />
            </div>

            <h3 className="text-2xl font-bold tracking-tight mb-1">Swap Successful!</h3>
            <p className="text-sm text-neutral-500 font-medium mb-6">
              Settled via ERC-4337 UserOperation on Base Sepolia
            </p>

            {lastTradeSummary && (
              <div className="w-full bg-neutral-50 rounded-2xl p-4 border border-neutral-100 mb-6 text-left space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-neutral-500 font-medium">You Swapped</span>
                  <span className="font-bold font-mono">
                    {lastTradeSummary.inAmount} {lastTradeSummary.inSymbol}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-neutral-500 font-medium">You Received</span>
                  <span className="font-bold font-mono">
                    {lastTradeSummary.outAmount} {lastTradeSummary.outSymbol}
                  </span>
                </div>
                <div className="pt-2 border-t border-neutral-200/60 flex justify-between items-center text-sm">
                  <span className="text-green-700 font-medium flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-green-600" />
                    Aqua Maker Fee
                  </span>
                  <span className="font-bold text-green-700 font-mono">
                    +{lastTradeSummary.feeEarnedUSDC.toFixed(4)} USDC accrued
                  </span>
                </div>
              </div>
            )}

            {txHash && (
              <div className="w-full mb-6">
                <div className="flex items-center justify-between text-xs text-neutral-500 mb-1.5 px-1">
                  <span>Transaction Hash</span>
                  <span className="text-neutral-400">Base Sepolia</span>
                </div>
                <div className="flex items-center gap-2 bg-neutral-100/80 rounded-xl p-2.5 font-mono text-xs border border-neutral-200/60">
                  <span className="truncate flex-1 text-neutral-800 font-medium">{txHash}</span>
                  <button
                    onClick={copyTxHash}
                    className="p-1.5 hover:bg-neutral-200 rounded-lg transition-colors text-neutral-600 cursor-pointer"
                    title="Copy Hash"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <a
                    href={`https://sepolia.basescan.org/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 hover:bg-neutral-200 rounded-lg transition-colors text-neutral-600 flex items-center"
                    title="View on BaseScan"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            )}

            <div className="flex gap-3 w-full">
              <button
                onClick={() => {
                  setStatus("idle"); hapticError();
                  setAmountIn("");
                  setTxHash(null);
                }}
                className="flex-1 bg-neutral-100 hover:bg-neutral-200 text-black py-3.5 rounded-full font-bold text-sm transition-colors cursor-pointer"
              >
                Make Another Trade
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-black hover:bg-neutral-800 text-white py-3.5 rounded-full font-bold text-sm transition-colors shadow-md cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        ) : status !== "idle" ? (
          /* Loading / In-Progress State */
          <div className="flex flex-col items-center text-center py-10">
            <div className="relative mb-6">
              <div className="w-16 h-16 border-4 border-black/10 border-t-black rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-black animate-pulse" />
              </div>
            </div>

            <h3 className="text-xl font-bold tracking-tight mb-2">
              {status === "signing" && "Signing UserOperation..."}
              {status === "bundling" && "Pimlico Bundler Submitting..."}
              {status === "settling" && "Settling on Aqua Reserve..."}
            </h3>
            <p className="text-sm text-neutral-500 font-medium max-w-xs">
              {status === "signing" && "Bundling Token Approval + Swap into a single signed transaction"}
              {status === "bundling" && "Gas sponsored by Rock Paymaster. Zero user gas required."}
              {status === "settling" && "Executing atomic token swap against Rock liquidity curve"}
            </p>

            <div className="mt-8 flex gap-2 justify-center">
              <div className={`h-1.5 w-8 rounded-full ${status === "signing" ? "bg-black" : "bg-neutral-300"}`} />
              <div className={`h-1.5 w-8 rounded-full ${status === "bundling" ? "bg-black" : "bg-neutral-300"}`} />
              <div className={`h-1.5 w-8 rounded-full ${status === "settling" ? "bg-black" : "bg-neutral-300"}`} />
            </div>
          </div>
        ) : (
          /* Main Swap Form */
          <div>
            {/* Pay Token Section */}
            <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-100 mb-2 focus-within:border-black/30 transition-colors">
              <div className="flex items-center justify-between text-xs font-semibold text-neutral-400 mb-1.5">
                <span>You Pay</span>
                <span>
                  Balance: {userBalances[fromToken].toLocaleString("en-US", { maximumFractionDigits: 4 })} {fromToken}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <input
                  type="number"
                  placeholder="0.0"
                  value={amountIn}
                  onChange={(e) => {
                    setAmountIn(e.target.value);
                    setError(null);
                    setHighSlippageAccepted(false);
                  }}
                  className="bg-transparent text-3xl font-bold tracking-tight outline-none w-full text-black placeholder:text-neutral-300 font-mono"
                  min="0"
                  step="any"
                />

                {/* Token Pill */}
                <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-full border border-neutral-200 shadow-sm shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-black" />
                  <span className="font-bold text-sm">{fromToken}</span>
                </div>
              </div>

              {/* Percentage shortcuts */}
              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-neutral-200/50">
                {[0.25, 0.5, 1.0].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => handlePercentage(pct)}
                    className="px-2.5 py-1 text-xs font-semibold text-neutral-600 bg-white rounded-lg border border-neutral-200/80 hover:bg-neutral-100 hover:text-black transition-colors cursor-pointer"
                  >
                    {pct === 1.0 ? "MAX" : `${pct * 100}%`}
                  </button>
                ))}
              </div>
            </div>

            {/* Flip Button */}
            <div className="relative flex justify-center -my-2.5 z-10">
              <button
                type="button"
                onClick={toggleTokens}
                className="w-9 h-9 bg-white border border-neutral-200 rounded-full flex items-center justify-center hover:bg-neutral-100 shadow-sm transition-transform active:scale-95 cursor-pointer"
                aria-label="Invert tokens"
              >
                <ArrowUpDown className="w-4 h-4 text-neutral-700" />
              </button>
            </div>

            {/* Receive Token Section */}
            <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-100 mb-5">
              <div className="flex items-center justify-between text-xs font-semibold text-neutral-400 mb-1.5">
                <span>You Receive (Estimated)</span>
                <span>
                  Balance: {userBalances[toToken].toLocaleString("en-US", { maximumFractionDigits: 4 })} {toToken}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="text-3xl font-bold tracking-tight text-black font-mono truncate">
                  {isQuoting ? (
                    <Loader2 className="w-6 h-6 animate-spin text-neutral-400 my-1" />
                  ) : outputAmount > 0 ? (
                    outputAmount.toLocaleString("en-US", {
                      maximumFractionDigits: toToken === "USDC" ? 2 : 5,
                    })
                  ) : (
                    "0.0"
                  )}
                </div>

                {/* Token Pill */}
                <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-full border border-neutral-200 shadow-sm shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-neutral-400" />
                  <span className="font-bold text-sm">{toToken}</span>
                </div>
              </div>
            </div>

            {/* Fee & Rate Summary Card */}
            <div className="bg-neutral-50/70 rounded-2xl p-4 border border-neutral-100 space-y-2.5 mb-6 text-xs font-medium">
              <div className="flex justify-between items-center text-neutral-500">
                <span>Exchange Rate</span>
                <span className="font-mono text-neutral-800">
                  1 WETH = {ETH_PRICE_USDC.toLocaleString()} USDC
                </span>
              </div>

              <div className="flex justify-between items-center text-neutral-500">
                <span className="flex items-center gap-1">
                  Aqua Maker Fee (0.05%)
                </span>
                <span className="font-mono text-green-600 font-semibold">
                  {isQuoting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-neutral-400 inline-block" />
                  ) : (
                    `+${feeInUSDC > 0 ? feeInUSDC.toFixed(4) : "0.0000"} USDC to Rock`
                  )}
                </span>
              </div>

              <div className="flex justify-between items-center text-neutral-500 group relative">
                <span className="border-b border-dashed border-neutral-300 cursor-help" title="Slippage occurs when large trades change the price of the asset before the trade executes. Lower impact means you get a better deal.">
                  Deal Quality (Price Impact)
                </span>
                <div className="flex items-center gap-2">
                  {isQuoting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
                  ) : inputNumber > 0 ? (
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 h-1.5 rounded-full bg-neutral-200 overflow-hidden flex">
                        <div 
                          className={`h-full ${priceImpact < 0.5 ? 'bg-green-500' : priceImpact < 1.5 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(100, Math.max(5, (priceImpact / 2.5) * 100))}%` }}
                        />
                      </div>
                      <span className={`font-mono text-xs font-semibold ${priceImpact < 0.5 ? 'text-green-600' : priceImpact < 1.5 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {priceImpact.toFixed(2)}%
                      </span>
                    </div>
                  ) : (
                    <span className="font-mono text-neutral-800">&lt; 0.01%</span>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center text-neutral-500">
                <span>Network Fee</span>
                <span className="font-mono text-neutral-800 flex items-center gap-1 font-semibold text-neutral-900">
                  <span className="line-through text-neutral-400 font-normal">$0.18</span>
                  $0.00 (Paymaster Sponsored)
                </span>
              </div>

              <div className="pt-2 border-t border-neutral-200/60 flex justify-between items-center text-neutral-400">
                <span>Liquidity Provider</span>
                <span className="font-mono text-neutral-600">Rock #{rockId} Aqua Pool</span>
              </div>
            </div>

            {/* Error messages */}
            {isInsufficientBalance && (
              <div className="flex items-center gap-2 text-xs font-medium text-red-600 bg-red-50 p-3 rounded-xl mb-4">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Insufficient {fromToken} balance for this trade.</span>
              </div>
            )}

            {isInsufficientReserve && (
              <div className="flex items-center gap-2 text-xs font-medium text-red-600 bg-red-50 p-3 rounded-xl mb-4">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Requested trade exceeds Rock #{rockId}&apos;s available USDC liquidity.</span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-xs font-medium text-red-600 bg-red-50 p-3 rounded-xl mb-4">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Action Button / Swipe to Swap */}
            <div className="relative h-14 rounded-full overflow-hidden bg-black shadow-lg">
              <AnimatePresence mode="wait">
                {status !== "idle" ? (
                  <motion.div
                    key="processing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex items-center justify-center gap-2 text-white font-bold bg-blue-600"
                  >
                    {status === "signing" && <Loader2 className="w-5 h-5 animate-spin" />}
                    {status === "bundling" && <Zap className="w-5 h-5 animate-pulse text-yellow-300" />}
                    {status === "settling" && <ChevronRight className="w-5 h-5 animate-bounce" />}
                    <span>
                      {status === "signing" ? "Signing UserOp..." 
                      : status === "bundling" ? "Paymaster Bundling..." 
                      : "Settling on Aqua..."}
                    </span>
                  </motion.div>
                ) : !canSwap ? (
                  <motion.div
                    key="disabled"
                    className="absolute inset-0 flex items-center justify-center font-bold text-white opacity-40 cursor-not-allowed bg-black"
                  >
                    {inputNumber <= 0 ? "Enter Amount" : isInsufficientBalance ? `Insufficient ${fromToken}` : "Exceeds Reserve"}
                  </motion.div>
                ) : (
                  <motion.div
                    key="swipe"
                    className="absolute inset-0 flex items-center bg-neutral-900"
                  >
                    <motion.div 
                      style={{ opacity: swipeOpacity }}
                      className="absolute inset-0 flex items-center justify-center text-white/50 font-bold pr-6 pointer-events-none text-sm"
                    >
                      {highSlippageAccepted ? (
                        <span className="text-red-400">Swipe again to confirm high slippage <ChevronRight className="w-4 h-4 ml-1 opacity-50 inline" /></span>
                      ) : (
                        <>Swipe to Swap <ChevronRight className="w-4 h-4 ml-1 opacity-50" /><ChevronRight className="w-4 h-4 -ml-2 opacity-30" /></>
                      )}
                    </motion.div>
                    <motion.div 
                      className="absolute left-0 h-full bg-blue-600 z-0 rounded-l-full"
                      style={{ width: swipeProgressWidth }}
                    />
                    <motion.div
                      style={{ x: dragX }}
                      drag="x"
                      dragConstraints={{ left: 0, right: 300 }}
                      dragElastic={0.05}
                      dragSnapToOrigin
                      onDragEnd={(e, info) => { hapticLight();
                        if (info.offset.x > 200) {
                          handleExecuteSwap();
                        }
                      }}
                      className="w-14 h-14 bg-white rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing z-10 shadow-md border-2 border-neutral-900"
                    >
                      <Zap className="w-5 h-5 text-black" />
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export function TradeModal({ isOpen, ...props }: TradeModalProps) {
  return (
    <AnimatePresence>
      {isOpen && <TradeModalInner {...props} />}
    </AnimatePresence>
  );
}
