import Link from "next/link";
import { HoverTitle } from "@/components/hover-title";
import { AnimatedText } from "@/components/animated-text";
import { RockCanvasDynamic } from "@/components/rock-canvas-dynamic";
import { ArrowRight } from "lucide-react";
import { NewsletterSignup } from "@/components/newsletter-signup";
import { AboutRocks } from "@/components/about-rocks";
import { StoryCarousel } from "@/components/story-carousel";
import { HowItWorksDynamic } from "@/components/how-it-works-dynamic";
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-white text-black font-sans selection:bg-black selection:text-white">
      


      {/* Hero Section */}
      <section className="relative w-full h-[100vh] flex flex-col items-center justify-center pt-20 overflow-hidden">
        
        {/* 3D Canvas Background */}
        <div className="absolute inset-0 z-0 opacity-80 mix-blend-multiply pointer-events-auto">
          <RockCanvasDynamic />
        </div>

        <div className="z-10 flex flex-col items-center justify-center text-center w-full max-w-5xl mx-auto px-6 pointer-events-none">
          <div className="pointer-events-none cursor-default">
            <AnimatedText 
              text="Tangible DeFi." 
              className="text-7xl md:text-[9rem] leading-none font-black tracking-tighter mb-8"
            />
          </div>
          
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

      <StoryCarousel />

      {/* How It Works Section */}
      <HowItWorksDynamic />

      {/* Newsletter Signup */}
      <NewsletterSignup />

      {/* Footer */}
      <footer className="w-full bg-black text-white py-24 px-6 md:px-12 z-10 relative">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-12">
          <div>
            <div className="text-4xl font-black tracking-tighter">Bank Rock</div>
            <div className="text-neutral-500 mt-2 text-sm max-w-[200px]">Bank Rock is not a bank. Please don't sue me.</div>
          </div>
          <div className="flex flex-wrap gap-8 text-neutral-400 font-medium">
            <Link href="/mcp" className="hover:text-white transition-colors">AI Oracle</Link>
            <Link href="/shop" className="hover:text-white transition-colors">Shop</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="https://github.com/lucaguglielmi/bankrock-ethglobal" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</Link>
          </div>
        </div>
      </footer>

    </main>
  );
}
