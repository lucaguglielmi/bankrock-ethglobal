import Link from "next/link";
import { AnimatedText } from "@/components/animated-text";
import { RockCanvas } from "@/components/rock-canvas";
import { ArrowRight } from "lucide-react";
import { LoginButton } from "@/components/login-button";
import { NewsletterSignup } from "@/components/newsletter-signup";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-white text-black font-sans selection:bg-black selection:text-white">
      
      {/* Navbar */}
      <nav className="w-full flex justify-between items-center z-50 p-6 md:px-12 fixed top-0 bg-white/50 backdrop-blur-md border-b border-black/5">
        <div className="text-xl font-bold tracking-tighter">Bank Rock</div>
        <div className="flex gap-8 items-center">
          <Link href="/shop" className="text-sm font-medium hover:opacity-50 transition-opacity">
            Shop
          </Link>
          <Link href="/mcp" className="text-sm font-medium hover:opacity-50 transition-opacity">
            AI Oracle
          </Link>
          <LoginButton />
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative w-full h-[100vh] flex flex-col items-center justify-center pt-20 overflow-hidden">
        
        {/* 3D Canvas Background */}
        <div className="absolute inset-0 z-0 opacity-80 mix-blend-multiply pointer-events-auto">
          <RockCanvas />
        </div>

        <div className="z-10 flex flex-col items-center justify-center text-center w-full max-w-5xl mx-auto px-6 pointer-events-none">
          <AnimatedText 
            text="Tangible DeFi." 
            className="text-7xl md:text-[9rem] leading-none font-black tracking-tighter mb-8"
          />
          
          <p className="text-xl md:text-2xl text-neutral-500 font-medium max-w-2xl mx-auto mb-12 opacity-0 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-500 fill-mode-forwards tracking-tight">
            A physical interface to your self-custodial liquidity. Tap your Bank Rock to access agentic strategies and automated yield generation.
          </p>

          <div className="flex items-center gap-6 opacity-0 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-700 fill-mode-forwards pointer-events-auto">
            <Link href="/shop" className="group flex items-center gap-3 bg-black text-white px-10 py-5 rounded-full font-semibold text-lg hover:bg-black/90 transition-all hover:scale-105 active:scale-95 shadow-xl shadow-black/10">
              Get your Rock
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* The Story Section */}
      <section className="w-full bg-neutral-50 py-32 md:py-48 px-6 md:px-12 relative z-10">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24 items-center">
          
          <div className="flex flex-col gap-6">
            <span className="text-sm font-bold uppercase tracking-widest text-neutral-400">The Origin</span>
            <h2 className="text-5xl md:text-7xl font-bold tracking-tighter leading-tight">
              Forged in Florence.
            </h2>
            <p className="text-xl text-neutral-600 leading-relaxed font-medium mt-4">
              During the 15th century, the Medici family revolutionized global finance in Florence, inventing double-entry bookkeeping and the letter of credit. They laid the foundation for modern banking.
            </p>
            <p className="text-xl text-neutral-600 leading-relaxed font-medium">
              Every Bank Rock is handpicked from the riverbeds near Florence, bridging the birthplace of classical finance with the frontier of agentic, self-custodial DeFi.
            </p>
          </div>

          <div className="relative aspect-square bg-white rounded-3xl p-12 shadow-2xl flex items-center justify-center border border-neutral-100 overflow-hidden group">
            {/* Minimalist abstract representation of a rock / Florence connection */}
            <div className="absolute inset-0 bg-gradient-to-br from-neutral-100 to-white z-0" />
            <div className="w-48 h-48 rounded-full border-[1px] border-black/10 flex items-center justify-center z-10 relative">
              <div className="w-32 h-32 rounded-full border-[1px] border-black/20 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-black shadow-2xl shadow-black/50 group-hover:scale-110 transition-transform duration-700 ease-out" />
              </div>
            </div>
            
            <div className="absolute bottom-6 left-6 text-xs font-bold tracking-widest text-neutral-400 uppercase z-10">
              Tuscany, IT — 43.7696° N, 11.2558° E
            </div>
          </div>

        </div>
      </section>

      {/* Newsletter Signup */}
      <NewsletterSignup />

      {/* Footer */}
      <footer className="w-full bg-black text-white py-24 px-6 md:px-12 z-10 relative">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-12">
          <div className="text-4xl font-black tracking-tighter">Bank Rock</div>
          <div className="flex gap-8 text-neutral-400 font-medium">
            <Link href="/mcp" className="hover:text-white transition-colors">AI Oracle</Link>
            <Link href="/shop" className="hover:text-white transition-colors">Shop</Link>
            <Link href="#" className="hover:text-white transition-colors">Twitter</Link>
            <Link href="https://github.com/lucaguglielmi/bankrock-ethglobal" className="hover:text-white transition-colors">GitHub</Link>
          </div>
        </div>
      </footer>

    </main>
  );
}
