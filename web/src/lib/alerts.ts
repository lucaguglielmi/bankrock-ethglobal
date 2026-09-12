import { logger } from "./telemetry";

export interface AlertTopicsConfig {
  loss_warning: boolean;       // Extreme Impermanent Loss & Volatility Warning
  dangerous_trade: boolean;    // Large Whale Swap & Liquidity Drain (> 20% pool)
  profit_milestone: boolean;   // Fee Distribution & Profit Spike (> 10/50 USDC)
  keeper_rebalance: boolean;   // Autonomous Aqua Keeper Action Report
  custody_transfer: boolean;   // NFC Physical Tap & Ownership Change
  gas_depletion: boolean;      // Safe Gas & Paymaster Health
  genesis_drop: boolean;       // Physical Genesis Drop Coordinates
}

export const DEFAULT_ALERT_TOPICS: AlertTopicsConfig = {
  loss_warning: true,
  dangerous_trade: true,
  profit_milestone: true,
  keeper_rebalance: true,
  custody_transfer: true,
  gas_depletion: false,
  genesis_drop: true,
};

export interface UserAlertPreferences {
  rockId: string | number;
  email: string;
  pushEnabled: boolean;
  topics: AlertTopicsConfig;
  updatedAt: string;
}

// In-memory persistent alert preferences map (keyed by rockId)
const alertPreferencesMap = new Map<string, UserAlertPreferences>();

export function getAlertPreferences(rockId: string | number): UserAlertPreferences {
  const key = String(rockId);
  if (!alertPreferencesMap.has(key)) {
    return {
      rockId,
      email: "",
      pushEnabled: false,
      topics: { ...DEFAULT_ALERT_TOPICS },
      updatedAt: new Date().toISOString(),
    };
  }
  return alertPreferencesMap.get(key)!;
}

export function saveAlertPreferences(
  rockId: string | number,
  email: string,
  pushEnabled: boolean,
  topics: Partial<AlertTopicsConfig>
): UserAlertPreferences {
  const key = String(rockId);
  const existing = getAlertPreferences(rockId);

  const updated: UserAlertPreferences = {
    rockId,
    email: email.trim().toLowerCase(),
    pushEnabled,
    topics: {
      ...existing.topics,
      ...topics,
    },
    updatedAt: new Date().toISOString(),
  };

  alertPreferencesMap.set(key, updated);

  logger.info("Saved alert preferences for rock", {
    action: "ALERT_PREFERENCES_SAVED",
    rockId,
    email: updated.email ? updated.email.slice(0, 3) + "***" : "none",
    pushEnabled,
    activeTopicsCount: Object.values(updated.topics).filter(Boolean).length,
  });

  return updated;
}
