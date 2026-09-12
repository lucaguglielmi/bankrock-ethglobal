"use client";

import { useState, useEffect } from "react";
import { Check, BellRing, Mail, Smartphone, Info, Edit2 } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";

function maskEmail(email: string) {
  if (!email || !email.includes("@")) return email;
  const [name, domain] = email.split("@");
  if (name.length <= 3) {
    return `${name}***@${domain}`;
  }
  return `${name.substring(0, 3)}***@${domain}`;
}

export default function AlertsPage() {
  const { user, ready } = usePrivy();
  
  const [email, setEmail] = useState("");
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [topics, setTopics] = useState({
    dangerousTrade: true,
    highSlippage: true,
    profitLoss: false,
  });
  
  const [gdprConsent, setGdprConsent] = useState(false);
  const [step, setStep] = useState<"edit" | "confirm" | "success">("edit");

  // Sync Privy email on load
  useEffect(() => {
    if (ready && user?.email?.address && !email) {
      setEmail(user.email.address);
    }
  }, [ready, user, email]);

  const handleSubscribeClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    if (!gdprConsent) return;
    
    // Move to double confirmation step
    setStep("confirm");
  };

  const handleConfirmSubscription = async () => {
    try {
      const activeTopics = Object.entries(topics)
        .filter(([_, isActive]) => isActive)
        .map(([key]) => key);

      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: activeTopics.join(",") }),
      });

      if (res.ok) {
        setStep("success");
        setTimeout(() => setStep("edit"), 5000); // reset after 5s
      }
    } catch (err) {
      console.error("Failed to subscribe:", err);
    }
  };

  const toggleTopic = (key: keyof typeof topics) => {
    setTopics((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const displayEmail = (!isEditingEmail && email) ? maskEmail(email) : email;

  return (
    <main className="flex min-h-screen flex-col bg-white text-black font-sans pt-24 px-6 pb-24">
      <div className="max-w-3xl mx-auto w-full space-y-16">
        
        {/* Header */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 bg-neutral-100 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest text-neutral-600">
            <BellRing className="w-3.5 h-3.5" />
            Alerts Dashboard
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter">
            Stay on top of your Rocks.
          </h1>
          <p className="text-xl text-neutral-500 font-medium max-w-xl">
            Configure agentic notifications to monitor your Rock's automated trading strategies and health in real-time.
          </p>
        </div>

        {/* Email Alerts Section */}
        <section className="bg-neutral-50 rounded-3xl p-6 md:p-10 border border-neutral-100">
          <div className="flex items-center gap-3 mb-6">
            <Mail className="w-6 h-6 text-black" />
            <h2 className="text-2xl font-bold tracking-tight">Email Alerts</h2>
          </div>
          
          <form onSubmit={handleSubscribeClick} className="space-y-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-bold uppercase tracking-wider text-neutral-500">
                  Email Address
                </label>
                {!isEditingEmail && (
                  <button 
                    type="button" 
                    onClick={() => setIsEditingEmail(true)}
                    className="text-sm font-bold flex items-center gap-1 hover:text-neutral-600 transition-colors"
                  >
                    <Edit2 className="w-3 h-3" /> Change
                  </button>
                )}
              </div>

              {isEditingEmail ? (
                <div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-white border border-neutral-200 rounded-2xl px-5 py-4 text-lg font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:border-transparent transition-all"
                  />
                  <p className="text-xs text-neutral-500 mt-2 flex items-start gap-1">
                    <Info className="w-4 h-4 shrink-0" />
                    Changing your email here only updates where alerts are sent. It does not affect your main Bank Rock account login.
                  </p>
                </div>
              ) : (
                <div className="w-full bg-white border border-neutral-200 rounded-2xl px-5 py-4 text-lg font-medium text-neutral-600 cursor-not-allowed">
                  {displayEmail || "Loading..."}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <label className="block text-sm font-bold uppercase tracking-wider text-neutral-500">
                Alert Topics
              </label>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => toggleTopic("dangerousTrade")}
                  className="w-full flex items-center justify-between p-4 bg-white border border-neutral-200 rounded-2xl hover:border-black transition-colors text-left group"
                >
                  <div>
                    <div className="font-bold text-lg">Dangerous Trade</div>
                    <div className="text-sm text-neutral-500">Get notified if the AI agent attempts a high-risk operation.</div>
                  </div>
                  <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 border ${topics.dangerousTrade ? "bg-black border-black text-white" : "border-neutral-300"}`}>
                    {topics.dangerousTrade && <Check className="w-4 h-4" />}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => toggleTopic("highSlippage")}
                  className="w-full flex items-center justify-between p-4 bg-white border border-neutral-200 rounded-2xl hover:border-black transition-colors text-left group"
                >
                  <div>
                    <div className="font-bold text-lg">High Slippage</div>
                    <div className="text-sm text-neutral-500">Alerts when rebalancing encounters &gt;1% slippage.</div>
                  </div>
                  <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 border ${topics.highSlippage ? "bg-black border-black text-white" : "border-neutral-300"}`}>
                    {topics.highSlippage && <Check className="w-4 h-4" />}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => toggleTopic("profitLoss")}
                  className="w-full flex items-center justify-between p-4 bg-white border border-neutral-200 rounded-2xl hover:border-black transition-colors text-left group"
                >
                  <div>
                    <div className="font-bold text-lg">Profit/Loss Summary</div>
                    <div className="text-sm text-neutral-500">Weekly email recap of your portfolio's performance.</div>
                  </div>
                  <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 border ${topics.profitLoss ? "bg-black border-black text-white" : "border-neutral-300"}`}>
                    {topics.profitLoss && <Check className="w-4 h-4" />}
                  </div>
                </button>
              </div>
            </div>

            {/* GDPR Consent */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className={`w-5 h-5 mt-0.5 rounded flex items-center justify-center shrink-0 border transition-colors ${gdprConsent ? "bg-black border-black text-white" : "border-neutral-300 group-hover:border-black"}`}>
                {gdprConsent && <Check className="w-3.5 h-3.5" />}
              </div>
              <input 
                type="checkbox" 
                className="hidden" 
                checked={gdprConsent} 
                onChange={(e) => setGdprConsent(e.target.checked)} 
                required 
              />
              <span className="text-sm text-neutral-500 leading-relaxed">
                I consent to Bank Rock storing my email address to send automated alerts. I understand this data is handled in accordance with GDPR and I can unsubscribe at any time.
              </span>
            </label>

            {/* Actions / Double Confirmation */}
            {step === "edit" && (
              <button
                type="submit"
                disabled={!email || !gdprConsent}
                className="w-full bg-black text-white py-4 rounded-full font-bold text-lg hover:bg-black/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            )}

            {step === "confirm" && (
              <div className="p-4 bg-white border-2 border-black rounded-2xl space-y-4">
                <p className="font-bold text-center">Are you absolutely sure you want to subscribe {displayEmail} to these alerts?</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep("edit")}
                    className="flex-1 bg-neutral-100 text-black py-3 rounded-full font-bold hover:bg-neutral-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSubscription}
                    className="flex-1 bg-black text-white py-3 rounded-full font-bold hover:bg-black/90 transition-all"
                  >
                    Yes, Subscribe
                  </button>
                </div>
              </div>
            )}

            {step === "success" && (
              <div className="w-full bg-green-500 text-white py-4 rounded-full font-bold text-lg flex items-center justify-center gap-2">
                <Check className="w-5 h-5" /> Preferences Saved
              </div>
            )}
          </form>
        </section>

        {/* Push Notifications Section */}
        <section className="bg-neutral-50 rounded-3xl p-6 md:p-10 border border-neutral-100">
          <div className="flex items-center gap-3 mb-6">
            <Smartphone className="w-6 h-6 text-black" />
            <h2 className="text-2xl font-bold tracking-tight">Push Notifications</h2>
          </div>
          
          <p className="text-neutral-600 mb-8 font-medium">
            Bank Rock supports native push notifications directly to your phone via Progressive Web App (PWA) technology. No app store required.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            {/* iOS Instructions */}
            <div className="bg-white p-6 rounded-2xl border border-neutral-200 space-y-4">
              <h3 className="font-bold text-lg flex items-center gap-2">
                Apple iOS
              </h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-neutral-600">
                <li>Open this site in <strong>Safari</strong>.</li>
                <li>Tap the <strong>Share</strong> icon at the bottom of the screen.</li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                <li>Open the new Bank Rock app from your home screen.</li>
                <li>Accept the prompt to allow notifications.</li>
              </ol>
            </div>

            {/* Android Instructions */}
            <div className="bg-white p-6 rounded-2xl border border-neutral-200 space-y-4">
              <h3 className="font-bold text-lg flex items-center gap-2">
                Android
              </h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-neutral-600">
                <li>Open this site in <strong>Chrome</strong>.</li>
                <li>Tap the three dots <strong>Menu</strong> icon in the top right.</li>
                <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                <li>Open the Bank Rock app from your home screen.</li>
                <li>Accept the prompt to allow notifications.</li>
              </ol>
            </div>
          </div>

          <div className="mt-6 flex items-start gap-3 text-sm text-neutral-500 bg-white p-4 rounded-xl border border-neutral-200">
            <Info className="w-5 h-5 shrink-0 text-blue-500" />
            <p>
              Push notifications are tied to your device. If you use multiple devices, you will need to add the app to your home screen on each one.
            </p>
          </div>
        </section>

      </div>
    </main>
  );
}
