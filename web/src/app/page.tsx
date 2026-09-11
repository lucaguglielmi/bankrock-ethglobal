import Link from "next/link";
import { AnimatedText } from "@/components/animated-text";
import { RockCanvas } from "@/components/rock-canvas";
import { ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between bg-white text-black p-6 md:p-24 overflow-hidden relative">
      
      {/* Navbar Placeholder */}
      <nav className="w-full flex justify-between items-center z-10 max-w-7xl mx-auto">
        <div className="text-xl font-bold tracking-tighter">Bank Rock</div>
        <div className="flex gap-4 items-center">
          <Link href="/shop" className="text-sm font-medium hover:opacity-70 transition-opacity">
            Shop
          </Link>
          <Link href="/developers" className="text-sm font-medium hover:opacity-70 transition-opacity">
            Developers
          </Link>
          <button className="bg-black text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-black/80 transition-colors">
            Connect
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center text-center z-10 w-full max-w-4xl mx-auto mt-20">
        <AnimatedText 
          text="Tangible DeFi." 
          className="text-6xl md:text-8xl font-black tracking-tighter mb-6"
        />
        
        <p className="text-lg md:text-xl text-neutral-500 font-medium max-w-2xl mx-auto mb-10 opacity-0 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500 fill-mode-forwards">
          A physical interface to your self-custodial liquidity. Tap your Bank Rock to access agentic strategies, zero-fee P2P swaps, and automated yield generation.
        </p>

      <div className="flex items-center gap-4 opacity-0 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-700 fill-mode-forwards">
        <Link href="/shop" className="group flex items-center gap-2 bg-black text-white px-8 py-4 rounded-full font-semibold hover:bg-black/80 transition-all z-20 pointer-events-auto">
          Get your Rock
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </Link>
        <button className="px-8 py-4 rounded-full font-semibold text-black border border-black/10 hover:bg-black/5 transition-colors z-20 pointer-events-auto">
          View Demo
        </button>
      </div>
    </div>

    {/* 3D Canvas rendering the Bank Rock */}
    <RockCanvas />

  </main>
);
}
