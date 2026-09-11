"use client";
import dynamic from "next/dynamic";

const Providers = dynamic(() => import("@/components/providers"), { ssr: false });

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
