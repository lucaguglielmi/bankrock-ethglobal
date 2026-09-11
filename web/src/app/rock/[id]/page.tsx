import { RockInterface } from "@/components/rock-interface";

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


      <div className="flex-1 flex flex-col pt-10">
        <RockInterface rockId={resolvedParams.id} urlParams={urlParams} />
      </div>
    </main>
  );
}
