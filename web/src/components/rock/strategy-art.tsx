import { cn } from "@/lib/ui/cn";

/**
 * The strategy illustrations — one calm mark per preset, keyed by the preset's `label`.
 *
 * The three presets differ only in fee, so the pictures say what the fee *does* rather than
 * anything about the curve: Tight trades most often (several quick ripples), Wide trades
 * steadily (one broad wave), Patient trades rarely (still water, a single drop). A label the
 * catalogue does not know gets a neutral ripple, never a wrong picture.
 *
 * Ink strokes in `currentColor`, the brand blue as the single accent. No motion.
 */

/** The blue of `public/brand/logo.svg` — the one accent colour illustrations may use. */
export const BRAND_BLUE = "#2855E8";

export type StrategyArtKind = "tight" | "wide" | "patient" | "neutral";

/** Which picture a preset label gets. Case-insensitive; anything unknown is neutral. */
export function strategyArtKind(label: string | undefined): StrategyArtKind {
  switch ((label ?? "").trim().toLowerCase()) {
    case "tight":
      return "tight";
    case "wide":
      return "wide";
    case "patient":
      return "patient";
    default:
      return "neutral";
  }
}

export interface StrategyArtProps {
  /** The preset's `label` — "Wide", "Tight", "Patient". */
  label: string | undefined;
  /** Size and colour classes. @default "size-16 text-ink" */
  className?: string;
  /**
   * When the picture sits beside the strategy's name it is decoration and hidden from assistive
   * tech. Set false to have it announced on its own.
   * @default true
   */
  decorative?: boolean;
}

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const ART_LABELS: Record<StrategyArtKind, string> = {
  tight: "Several quick ripples",
  wide: "One broad wave",
  patient: "Still water and a single drop",
  neutral: "A ripple",
};

export function StrategyArt({ label, className, decorative = true }: StrategyArtProps) {
  const kind = strategyArtKind(label);
  const accessibility = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": ART_LABELS[kind] } as const);

  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("shrink-0", className ?? "size-16 text-ink")}
      {...accessibility}
    >
      {kind === "tight" ? <TightMark /> : null}
      {kind === "wide" ? <WideMark /> : null}
      {kind === "patient" ? <PatientMark /> : null}
      {kind === "neutral" ? <NeutralMark /> : null}
    </svg>
  );
}

/** Tight — several small, quick ripples. The middle one carries the accent. */
function TightMark() {
  return (
    <g {...STROKE}>
      <ellipse cx="15" cy="27" rx="4.5" ry="1.8" />
      <ellipse cx="15" cy="27" rx="9" ry="3.6" opacity="0.45" />
      <ellipse cx="49" cy="27" rx="4.5" ry="1.8" />
      <ellipse cx="49" cy="27" rx="9" ry="3.6" opacity="0.45" />
      <ellipse cx="32" cy="40" rx="4.5" ry="1.8" stroke={BRAND_BLUE} />
      <ellipse cx="32" cy="40" rx="9.5" ry="3.8" stroke={BRAND_BLUE} opacity="0.55" />
      <ellipse cx="32" cy="40" rx="15" ry="6" stroke={BRAND_BLUE} opacity="0.25" />
    </g>
  );
}

/** Wide — one broad, gentle wave, with a quieter echo beneath it in the accent. */
function WideMark() {
  return (
    <g {...STROKE}>
      <path d="M6 31c7-9 13-9 20 0s13 9 20 0 8-6 12-3" />
      <path d="M6 43c7-9 13-9 20 0s13 9 20 0 8-6 12-3" stroke={BRAND_BLUE} opacity="0.55" />
    </g>
  );
}

/** Patient — still water, one drop about to land, one faint ring where it will. */
function PatientMark() {
  return (
    <g {...STROKE}>
      <path
        d="M32 12c-4.5 6.2-6.5 9.4-6.5 12.6a6.5 6.5 0 0 0 13 0c0-3.2-2-6.4-6.5-12.6Z"
        stroke={BRAND_BLUE}
      />
      <line x1="8" y1="44" x2="56" y2="44" />
      <ellipse cx="32" cy="44" rx="13" ry="3.4" opacity="0.35" />
      <line x1="14" y1="52" x2="50" y2="52" opacity="0.3" />
    </g>
  );
}

/** Anything the catalogue does not name — a single, unremarkable ripple. */
function NeutralMark() {
  return (
    <g {...STROKE}>
      <ellipse cx="32" cy="34" rx="6" ry="2.4" />
      <ellipse cx="32" cy="34" rx="13" ry="5.2" opacity="0.45" />
      <ellipse cx="32" cy="34" rx="20" ry="8" opacity="0.2" />
    </g>
  );
}

/**
 * The reserve card's backdrop: a rock resting on water, two ripples leaving it. Drawn in the
 * brand blue only; the card sets the opacity. Always decorative.
 */
export function ReserveArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 160"
      aria-hidden
      className={cn("shrink-0", className)}
      fill="none"
      stroke={BRAND_BLUE}
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M38 96c3-22 16-46 36-60 14-10 30-12 44-6 20 9 32 30 34 50 2 16-8 26-24 30-22 5-52 4-74-4-12-4-18-8-16-10Z" />
      <path d="M104 46 98 70l9 18-11 18" strokeWidth="2.4" />
      <ellipse cx="80" cy="112" rx="60" ry="14" opacity="0.55" />
      <ellipse cx="80" cy="118" rx="76" ry="20" opacity="0.28" />
    </svg>
  );
}
