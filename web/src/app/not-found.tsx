import Link from "next/link";
import { Ghost, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 bg-white text-center font-sans">
      <div className="w-20 h-20 bg-neutral-50 rounded-3xl flex items-center justify-center mb-8 shadow-sm border border-neutral-100 rotate-12">
        <Ghost className="w-10 h-10 text-neutral-400 -rotate-12" />
      </div>
      
      <h2 className="text-4xl md:text-5xl font-black tracking-tighter mb-4">
        Void Space
      </h2>
      
      <p className="text-lg text-neutral-500 font-medium max-w-md mx-auto mb-10 leading-relaxed">
        The cryptographic asset or page you are looking for does not exist on this ledger.
      </p>

      <Link
        href="/"
        className="bg-black text-white px-8 py-4 rounded-full font-bold text-base hover:bg-neutral-800 transition-all shadow-lg active:scale-95 flex items-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" />
        Return to Genesis
      </Link>
    </div>
  );
}
