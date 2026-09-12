import { NextResponse } from "next/server";
import { sendAlertEmail, AlertEmailPayload } from "@/lib/email-service";
import { logger } from "@/lib/telemetry";

const TOPIC_PRESETS: Record<string, Omit<AlertEmailPayload, "to" | "rockId">> = {
  profit_milestone: {
    topic: "profit_milestone",
    topicTitle: "Profit Harvest Milestone Reached",
    severity: "profit",
    summary: "Your stone's 1inch Aqua liquidity position has accumulated over +14.85 USDC in maker fees from peer trading activity.",
    details: [
      { label: "Reserve USDC", value: "1,250.00 USDC" },
      { label: "Maker Fees Captured", value: "+14.85 USDC" },
      { label: "Maker APR", value: "18.4% (Spread Yield)" },
      { label: "Status", value: "Ready to Harvest into Safe" },
    ],
    txHash: "0x789abc456def1234567890abcdef1234567890abcdef1234567890abcdef1234",
  },
  loss_warning: {
    topic: "loss_warning",
    topicTitle: "Impermanent Loss & Volatility Warning",
    severity: "danger",
    summary: "High volatility detected on Base Sepolia: the ETH/USDC pool inventory has deviated by 16.4% from your target 50/50 ratio.",
    details: [
      { label: "Current Ratio", value: "66.4% USDC / 33.6% WETH" },
      { label: "Target Ratio", value: "50.0% / 50.0%" },
      { label: "Deviation", value: "16.4% (Threshold: 15.0%)" },
      { label: "Recommended Action", value: "Autonomous Rebalance Suggested" },
    ],
    txHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  },
  dangerous_trade: {
    topic: "dangerous_trade",
    topicTitle: "Large Whale Trade Alert",
    severity: "warning",
    summary: "A large swap absorbed 24.2% of your rock's active liquidity in a single block. Your maker spread captured high fee premium.",
    details: [
      { label: "Swap Volume", value: "302.50 USDC -> WETH" },
      { label: "Pool Impact", value: "24.2% of Reserve" },
      { label: "Fee Captured", value: "+1.51 USDC (0.50% fee)" },
      { label: "Pool Health", value: "Liquid & Active" },
    ],
    txHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  },
  keeper_rebalance: {
    topic: "keeper_rebalance",
    topicTitle: "Autonomous Keeper Action Report",
    severity: "info",
    summary: "Bank Rock's autonomous AI keeper executed an inventory rebalance on 1inch Aqua, re-centering maker orders and harvesting pending fees.",
    details: [
      { label: "Action Taken", value: "SWAP_WETH_FOR_USDC" },
      { label: "Pre-Deviation", value: "5.8%" },
      { label: "Post-Deviation", value: "0.0% (Balanced 50/50)" },
      { label: "Gas Cost", value: "Sponsored by Pimlico ($0.00)" },
    ],
    txHash: "0x4567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123",
  },
  custody_transfer: {
    topic: "custody_transfer",
    topicTitle: "Physical NFC Tap & Custody Notice",
    severity: "security",
    summary: "A fresh physical NFC tap was registered for your Tuscan stone. The dynamic NTAG 424 DNA signature counter incremented to #43.",
    details: [
      { label: "NFC Chip UID", value: "04A1B2C3D4E5F6" },
      { label: "Read Counter", value: "SDMReadCtr: #43" },
      { label: "Attestation", value: "AES-128 CMAC Validated" },
      { label: "Replay Status", value: "Fresh Tap Verified" },
    ],
  },
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as {
      to?: string;
      rockId?: string | number;
      topic?: string;
    };

    const to = typeof body.to === "string" ? body.to.trim() : "";
    const rockId = body.rockId || 1;
    const topic = body.topic || "profit_milestone";

    if (!to || !to.includes("@")) {
      return NextResponse.json(
        { error: "A valid email address is required to send a test alert." },
        { status: 400 }
      );
    }

    const preset = TOPIC_PRESETS[topic] || TOPIC_PRESETS.profit_milestone;

    const payload: AlertEmailPayload = {
      to,
      rockId,
      ...preset,
    };

    const result = await sendAlertEmail(payload);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: unknown) {
    logger.error("Error in POST /api/alerts/test", error);
    return NextResponse.json(
      { error: "Failed to dispatch test alert email" },
      { status: 500 }
    );
  }
}
