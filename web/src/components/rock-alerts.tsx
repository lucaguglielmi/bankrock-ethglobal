"use client";

import { useState, useEffect } from "react";
import {
  Bell,
  Mail,
  Smartphone,
  Check,
  Send,
  Loader2,
  ShieldAlert,
  TrendingUp,
  AlertTriangle,
  Bot,
  KeyRound,
  Fuel,
  Package,
  Share2,
  PlusSquare,
  ChevronDown,
  Info,
} from "lucide-react";
import { AlertTopicsConfig, DEFAULT_ALERT_TOPICS } from "@/lib/alerts";
import { useAudio } from "@/context/audio-context";

interface RockAlertsProps {
  rockId: string | number;
}

interface TopicMeta {
  id: keyof AlertTopicsConfig;
  title: string;
  description: string;
  category: "danger" | "warning" | "profit" | "automation" | "security" | "system" | "hardware";
  categoryLabel: string;
  icon: typeof Bell;
}

const TOPICS_META: TopicMeta[] = [
  {
    id: "loss_warning",
    title: "Impermanent Loss & Volatility Warning",
    description: "Alerts if pool inventory diverges significantly (> 15% skew) due to rapid price volatility.",
    category: "danger",
    categoryLabel: "High Risk",
    icon: AlertTriangle,
  },
  {
    id: "dangerous_trade",
    title: "Large Whale Swap & Liquidity Drain",
    description: "Triggers when an incoming trade absorbs more than 20% of your rock's active reserve in a single transaction.",
    category: "warning",
    categoryLabel: "Trade Hazard",
    icon: ShieldAlert,
  },
  {
    id: "profit_milestone",
    title: "Fee Distribution & Profit Spike",
    description: "Notifies you when accumulated 1inch Aqua maker fees cross fee harvesting thresholds (+10 / 50 / 100 USDC).",
    category: "profit",
    categoryLabel: "Profit Harvest",
    icon: TrendingUp,
  },
  {
    id: "keeper_rebalance",
    title: "Autonomous Keeper Action Report",
    description: "Real-time dispatch whenever the AI keeper re-centers your maker inventory and captures 5 bps fees.",
    category: "automation",
    categoryLabel: "AI Automation",
    icon: Bot,
  },
  {
    id: "custody_transfer",
    title: "NFC Possession & Custody Transfer",
    description: "Instant cryptographic alert if the physical stone is tapped by an unverified device or control is transferred.",
    category: "security",
    categoryLabel: "Hardware Security",
    icon: KeyRound,
  },
  {
    id: "gas_depletion",
    title: "Safe Account Health & Gas Alerts",
    description: "Monitors Pimlico Paymaster gas sponsorship allowances and underlying Safe reserve thresholds.",
    category: "system",
    categoryLabel: "Account Health",
    icon: Fuel,
  },
  {
    id: "genesis_drop",
    title: "Genesis Batch Drop & Convention Coordinates",
    description: "VIP notifications with exact dates, locations, and booth booth numbers for upcoming global Ethereum drops.",
    category: "hardware",
    categoryLabel: "VIP Hardware",
    icon: Package,
  },
];

export function RockAlerts({ rockId }: RockAlertsProps) {
  const { playTap, playSuccess, playError } = useAudio();

  const [email, setEmail] = useState("");
  const [topics, setTopics] = useState<AlertTopicsConfig>({ ...DEFAULT_ALERT_TOPICS });
  const [pushEnabled, setPushEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Test email state
  const [selectedTestTopic, setSelectedTestTopic] = useState<string>("profit_milestone");
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Platform detection
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");
  const [isStandalonePwa, setIsStandalonePwa] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);

  useEffect(() => {
    // Detect device platform
    if (typeof window !== "undefined") {
      const ua = navigator.userAgent || "";
      const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const isAndroid = /Android/.test(ua);

      if (isIOS) setPlatform("ios");
      else if (isAndroid) setPlatform("android");
      else setPlatform("desktop");

      // Check if installed as PWA (standalone)
      const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsStandalonePwa(isStandalone);

      // Check Notification API
      setPushSupported("Notification" in window);
      if ("Notification" in window && Notification.permission === "granted") {
        setPushEnabled(true);
      }

      // Load saved preferences from API / localStorage
      fetch(`/api/alerts?rockId=${rockId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.preferences) {
            if (data.preferences.email) setEmail(data.preferences.email);
            if (data.preferences.topics) setTopics(data.preferences.topics);
          }
        })
        .catch(() => {
          // Fallback to local storage
          try {
            const saved = localStorage.getItem(`bankrock_alerts_${rockId}`);
            if (saved) {
              const parsed = JSON.parse(saved);
              if (parsed.email) setEmail(parsed.email);
              if (parsed.topics) setTopics(parsed.topics);
            }
          } catch {
            // ignore
          }
        });
    }
  }, [rockId]);

  const handleToggleTopic = (topicKey: keyof AlertTopicsConfig) => {
    playTap();
    setTopics((prev) => ({
      ...prev,
      [topicKey]: !prev[topicKey],
    }));
    setSaveSuccess(false);
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rockId,
          email,
          pushEnabled,
          topics,
        }),
      });

      if (res.ok) {
        playSuccess();
        setSaveSuccess(true);
        try {
          localStorage.setItem(
            `bankrock_alerts_${rockId}`,
            JSON.stringify({ email, topics, pushEnabled })
          );
        } catch {
          // ignore
        }
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        playError();
      }
    } catch {
      playError();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!email || !email.includes("@")) {
      playError();
      setTestResult({
        success: false,
        message: "Please enter a valid email address first.",
      });
      return;
    }

    setIsSendingTest(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/alerts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          rockId,
          topic: selectedTestTopic,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        playSuccess();
        setTestResult({
          success: true,
          message: data.result.message || "Test alert email sent successfully.",
        });
      } else {
        playError();
        setTestResult({
          success: false,
          message: data.error || "Failed to send test alert.",
        });
      }
    } catch {
      playError();
      setTestResult({
        success: false,
        message: "Network error sending test alert.",
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleRequestPush = async () => {
    playTap();
    if (!pushSupported) {
      alert("Web Push notifications are not supported in this browser.");
      return;
    }

    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        setPushEnabled(true);
        playSuccess();
        new Notification(`Bank Rock #${rockId} Sentinel Active`, {
          body: "Push alerts successfully enabled for this stone.",
          icon: "/icon-192.png",
        });
      } else {
        setPushEnabled(false);
      }
    } catch {
      // Permission request error
    }
  };

  return (
    <div className="w-full bg-white border border-neutral-200 rounded-3xl p-6 md:p-8 shadow-sm mb-8 animate-in fade-in duration-300">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-neutral-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-black text-white flex items-center justify-center shadow-md">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xl font-black tracking-tight text-neutral-950 flex items-center gap-2">
              Sentinel Alert Hub
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold">
                Automated
              </span>
            </h3>
            <p className="text-xs text-neutral-500 font-medium">
              Configure real-time email telemetry and push alerts for Rock #{rockId}.
            </p>
          </div>
        </div>

        {/* Platform Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-100 text-[11px] font-mono text-neutral-600 self-start sm:self-auto">
          <Smartphone className="w-3.5 h-3.5" />
          <span>
            {platform === "ios" ? "Apple iOS Detected" : platform === "android" ? "Android Detected" : "Desktop Browser"}
          </span>
        </div>
      </div>

      {/* Form: Email & Save */}
      <form onSubmit={handleSavePreferences} className="mt-6 space-y-6">
        {/* Email Input & Send Test */}
        <div className="p-5 rounded-2xl bg-neutral-50 border border-neutral-100 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-black" />
              Automated Email Destination
            </label>
            <span className="text-[11px] text-neutral-400 font-medium">
              Powered by Resend.com
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="satoshi@bankrock.xyz"
                className="w-full bg-white border border-neutral-200 text-neutral-900 placeholder:text-neutral-400 text-sm font-medium rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={isSaving}
              className="bg-black text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-neutral-800 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saveSuccess ? (
                <>
                  <Check className="w-4 h-4 text-green-400" />
                  <span>Saved!</span>
                </>
              ) : (
                <span>Save Alerts</span>
              )}
            </button>
          </div>

          {/* Test Email Bar */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-neutral-200/60">
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500 font-medium">Test template:</span>
              <div className="relative">
                <select
                  value={selectedTestTopic}
                  onChange={(e) => setSelectedTestTopic(e.target.value)}
                  className="appearance-none bg-white border border-neutral-200 rounded-lg px-3 py-1.5 pr-7 text-xs font-medium text-neutral-800 focus:outline-none focus:border-black cursor-pointer"
                >
                  <option value="profit_milestone">💰 Profit Milestone (+14.85 USDC)</option>
                  <option value="loss_warning">🚨 High Volatility Warning (16.4%)</option>
                  <option value="dangerous_trade">⚠️ Whale Swap Alert (24.2%)</option>
                  <option value="keeper_rebalance">🤖 Keeper Action Report</option>
                  <option value="custody_transfer">🛡️ NFC Tap Verification (#43)</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <button
              type="button"
              onClick={handleSendTestEmail}
              disabled={isSendingTest}
              className="px-4 py-1.5 bg-white border border-neutral-300 hover:border-black rounded-lg text-xs font-semibold text-neutral-800 hover:text-black transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSendingTest ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>Send Test Email</span>
            </button>
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-xl text-xs font-medium animate-in fade-in duration-200 flex items-start gap-2 ${
                testResult.success
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Configurable Thickbox Topics Grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Configurable Alert Topics ({Object.values(topics).filter(Boolean).length} Active)
            </h4>
            <span className="text-[11px] text-neutral-400">Toggle to subscribe</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {TOPICS_META.map((t) => {
              const Icon = t.icon;
              const isChecked = Boolean(topics[t.id]);

              return (
                <div
                  key={t.id}
                  onClick={() => handleToggleTopic(t.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer select-none flex items-start gap-3 relative ${
                    isChecked
                      ? "bg-white border-black shadow-sm"
                      : "bg-neutral-50/70 border-neutral-200 opacity-60 hover:opacity-90"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                      isChecked
                        ? "bg-black border-black text-white"
                        : "bg-white border-neutral-300"
                    }`}
                  >
                    {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5">
                        <Icon className="w-3.5 h-3.5 text-neutral-900" />
                        <span className="text-xs font-bold text-neutral-900">{t.title}</span>
                      </div>
                      <span
                        className={`text-[9px] font-mono uppercase font-bold px-1.5 py-0.5 rounded ${
                          t.category === "danger"
                            ? "bg-red-100 text-red-700"
                            : t.category === "warning"
                            ? "bg-orange-100 text-orange-700"
                            : t.category === "profit"
                            ? "bg-green-100 text-green-700"
                            : t.category === "automation"
                            ? "bg-purple-100 text-purple-700"
                            : t.category === "security"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-neutral-200 text-neutral-700"
                        }`}
                      >
                        {t.categoryLabel}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-500 leading-relaxed">
                      {t.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Web Push & Mobile OS Guide */}
        <div className="p-5 rounded-2xl border border-neutral-200 bg-white space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-black" />
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
                  Instant Web Push Notifications
                </h4>
                <p className="text-[11px] text-neutral-500">
                  Receive low-latency native banner alerts on your phone or desktop.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRequestPush}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${
                pushEnabled
                  ? "bg-green-100 text-green-800 border border-green-200"
                  : "bg-black text-white hover:bg-neutral-800"
              }`}
            >
              {pushEnabled ? "✓ Push Enabled" : "Enable Push"}
            </button>
          </div>

          {/* Platform Specific Instructions */}
          {platform === "ios" && (
            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200/80 text-xs text-neutral-700 space-y-2">
              <div className="font-bold text-neutral-900 flex items-center gap-1.5">
                <span>🍎 Apple iOS Requirement</span>
                <span className="text-[10px] font-mono bg-neutral-200 px-1.5 py-0.5 rounded text-neutral-600">
                  {isStandalonePwa ? "PWA Mode Active" : "Action Required"}
                </span>
              </div>
              <p className="text-neutral-500 leading-relaxed text-[11px]">
                Apple iOS only permits Web Push notifications for web apps installed to your Home Screen:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-medium text-[11px]">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-white border border-neutral-200">
                  <Share2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>1. Tap Safari Share</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-white border border-neutral-200">
                  <PlusSquare className="w-3.5 h-3.5 text-black shrink-0" />
                  <span>2. Add to Home Screen</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-white border border-neutral-200">
                  <Bell className="w-3.5 h-3.5 text-green-600 shrink-0" />
                  <span>3. Enable Push in App</span>
                </div>
              </div>
            </div>
          )}

          {platform === "android" && (
            <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-xs text-neutral-600">
              <strong className="text-neutral-900">🤖 Android Push:</strong> Supported natively in Chrome and Firefox. Tap &quot;Enable Push&quot; above and select &quot;Allow&quot; when prompted by Android.
            </div>
          )}

          {platform === "desktop" && (
            <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-xs text-neutral-600">
              <strong className="text-neutral-900">💻 Desktop Notifications:</strong> Supported in Chrome, Brave, Edge, and Safari. Receive native system notifications when market anomalies occur.
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
