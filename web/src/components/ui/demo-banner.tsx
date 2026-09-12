/**
 * One-line, in-flow notice shown only in demo mode (spec 15 D-013; spec 17
 * Part 5). Never fixed — it lives in the normal document flow at the top of
 * `<body>`, ahead of the header, so it cannot cover content or other fixed
 * chrome.
 */
function DemoBanner() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return null;

  return (
    <div className="w-full bg-warning-bg px-[var(--gutter)] py-2 text-center text-sm text-ink">
      Demo mode — figures marked SIMULATED are not real.
    </div>
  );
}

export { DemoBanner };
