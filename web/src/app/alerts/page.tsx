"use client";

import { useState } from "react";
import { Check, BellRing, Mail, Smartphone, Info } from "lucide-react";

export default function AlertsPage() {
  const [email, setEmail] = useState("");
  const [topics, setTopics] = useState({
    dangerousTrade: true,
    highSlippage: true,
    profitLoss: false,
  });
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
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
        setSubscribed(true);
        setTimeout(() => setSubscribed(false), 3000);
      }
    } catch (err) {
      console.error("Failed to subscribe:", err);
    }
  };

  const toggleTopic = (key: keyof typeof topics) => {
    setTopics((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
          
          <form onSubmit={handleSubscribe} className="space-y-8">
            <div className="space-y-4">
              <label className="block text-sm font-bold uppercase tracking-wider text-neutral-500">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-white border border-neutral-200 rounded-2xl px-5 py-4 text-lg font-medium focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
              />
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

            <button
              type="submit"
              className="w-full bg-black text-white py-4 rounded-full font-bold text-lg hover:bg-black/90 transition-all flex items-center justify-center gap-2"
            >
              {subscribed ? (
                <>
                  <Check className="w-5 h-5" /> Saved Preferences
                </>
              ) : (
                "Save Email Preferences"
              )}
            </button>
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
