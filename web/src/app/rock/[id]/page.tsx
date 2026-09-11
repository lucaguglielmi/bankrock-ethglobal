import { RockInterface } from "@/components/rock-interface";
import { LoginButton } from "@/components/login-button";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function RockPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  const urlParams = {
    e: typeof resolvedSearchParams.e === "string" ? resolvedSearchParams.e : undefined,
    c: typeof resolvedSearchParams.c === "string" ? resolvedSearchParams.c : undefined,
    ctr: typeof resolvedSearchParams.ctr === "string" ? resolvedSearchParams.ctr : undefined,
    uid: typeof resolvedSearchParams.uid === "string" ? resolvedSearchParams.uid : undefined,
  };

  return (
    <main className="flex min-h-screen flex-col bg-white text-black font-sans selection:bg-black selection:text-white">
      {/* Minimal Navbar for rock pages */}
      <nav className="w-full flex justify-between items-center z-50 p-6 border-b border-black/5">
        <Link href="/" className="text-xl font-bold tracking-tighter">Bank Rock</Link>
        <LoginButton />
      </nav>

      <div className="flex-1 flex flex-col pt-10">
        <RockInterface rockId={resolvedParams.id} urlParams={urlParams} />
      </div>
    </main>
  );
}
