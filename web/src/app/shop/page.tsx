import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function Shop() {
  return (
    <main className="flex min-h-screen flex-col bg-white text-black p-6 md:p-24 relative overflow-hidden">
      <nav className="w-full flex justify-between items-center z-10 max-w-7xl mx-auto mb-20">
        <Link href="/" className="flex items-center gap-2 text-sm font-medium hover:opacity-70 transition-opacity">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <div className="flex gap-6 md:gap-8 items-center">
          <Link href="/mcp" className="text-sm font-medium hover:opacity-50 transition-opacity">
            AI Oracle
          </Link>
          <Link href="/" className="text-xl font-bold tracking-tighter">
            Bank Rock
          </Link>
        </div>
      </nav>

      <div className="flex-1 flex flex-col items-center z-10 w-full max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-black tracking-tighter mb-4 text-center">
          Secure your Rock.
        </h1>
        <p className="text-lg text-neutral-500 font-medium mb-16 text-center max-w-lg">
          Choose a delivery method. Each rock is embedded with an NTAG 424 DNA cryptographic chip.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          
          {/* Option 1: Gift */}
          <div className="border border-neutral-200 rounded-3xl p-8 hover:border-black/20 hover:shadow-xl transition-all cursor-pointer group bg-white/50 backdrop-blur-md relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-3 h-3 rounded-full bg-black"></div>
            </div>
            <h2 className="text-2xl font-bold mb-2">Gift Delivery</h2>
            <p className="text-neutral-500 mb-8">Send a pre-funded Bank Rock directly to someone else.</p>
            <div className="text-3xl font-black mb-8">$20 <span className="text-sm font-medium text-neutral-400">/ physical rock</span></div>
            <button className="w-full bg-black text-white py-4 rounded-full font-semibold hover:bg-black/80 transition-colors">
              Select
            </button>
          </div>

          {/* Option 2: Self */}
          <div className="border border-neutral-200 rounded-3xl p-8 hover:border-black/20 hover:shadow-xl transition-all cursor-pointer group bg-white/50 backdrop-blur-md relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-3 h-3 rounded-full bg-black"></div>
            </div>
            <h2 className="text-2xl font-bold mb-2">Self Delivery</h2>
            <p className="text-neutral-500 mb-8">Order a Bank Rock to your own address to initialize.</p>
            <div className="text-3xl font-black mb-8">$20 <span className="text-sm font-medium text-neutral-400">/ physical rock</span></div>
            <button className="w-full bg-white text-black border border-black/10 py-4 rounded-full font-semibold hover:bg-neutral-50 transition-colors">
              Select
            </button>
          </div>

        </div>
      </div>
    </main>
  );
}
