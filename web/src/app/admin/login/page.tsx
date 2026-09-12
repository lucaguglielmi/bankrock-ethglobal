"use client";

import { useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });

      if (res.ok) {
        router.push("/admin");
      } else {
        setError("Invalid credentials");
      }
    } catch (err) {
      setError("Server error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-16 h-16 bg-neutral-900 border border-neutral-800 rounded-2xl flex items-center justify-center mb-6 shadow-2xl">
            <ShieldCheck className="w-8 h-8 text-neutral-400" />
          </div>
          <h1 className="text-3xl font-bold tracking-tighter mb-2">Sentinel</h1>
          <p className="text-neutral-500 font-mono text-sm uppercase tracking-wider">Authorized Personnel Only</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Passphrase"
            className="w-full bg-neutral-900 border border-neutral-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-neutral-500 transition-colors font-mono text-sm"
          />
          
          {error && <div className="text-red-400 text-sm font-medium text-center">{error}</div>}
          
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-neutral-200 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Authenticate"}
          </button>
        </form>
      </div>
    </div>
  );
}
