import { RockInterface, type RockPageParams } from "@/components/rock-interface";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

export default async function RockPage({ params, searchParams }: PageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  // Only the tap parameters are forwarded; nothing else in the query string reaches the client
  // component.
  const rockParams: RockPageParams = {
    e: firstValue(query.e),
    c: firstValue(query.c),
    enc: firstValue(query.enc),
    ctr: firstValue(query.ctr),
    uid: firstValue(query.uid),
  };

  return (
    <main className="flex w-full flex-1 flex-col">
      <RockInterface rockId={id} searchParams={rockParams} />
    </main>
  );
}
