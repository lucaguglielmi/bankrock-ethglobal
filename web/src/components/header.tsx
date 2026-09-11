"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LoginButton } from "@/components/login-button";
import { ArrowRight } from "lucide-react";

export function Header() {
  const pathname = usePathname();

  return (
    <nav className="w-full flex justify-between items-center z-50 p-6 md:px-12 fixed top-0 bg-white/50 backdrop-blur-md border-b border-black/5">
      <Link href="/" className="text-xl font-bold tracking-tighter hover:opacity-70 transition-opacity">
        Bank Rock
      </Link>
      <div className="flex gap-6 md:gap-8 items-center">
        <Link 
          href="/shop" 
          className={`text-sm transition-opacity ${pathname === '/shop' ? 'font-semibold text-black border-b border-black pb-0.5' : 'font-medium hover:opacity-50'}`}
        >
          Shop
        </Link>
        <Link 
          href="/mcp" 
          className={`text-sm transition-opacity ${pathname === '/mcp' ? 'font-semibold text-black border-b border-black pb-0.5' : 'font-medium hover:opacity-50'}`}
        >
          AI Oracle
        </Link>
        <Link
          href="/rock/1"
          className={`text-sm transition-colors flex items-center gap-1 ${pathname.startsWith('/rock') ? 'font-semibold text-black border-b border-black pb-0.5' : 'font-medium text-neutral-500 hover:text-black'}`}
        >
          Live Demo
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
        <LoginButton />
      </div>
    </nav>
  );
}
