import { cn } from "@/lib/ui/cn";

/**
 * The strategy illustrations - one calm mark per preset, keyed by the preset's `label`.
 *
 * The three presets differ only in fee, so the pictures say what the fee *does* rather than
 * anything about the curve: Tight trades most often (several quick ripples), Wide trades
 * steadily (one broad wave), Patient trades rarely (still water, a single drop). A label the
 * catalogue does not know gets a neutral ripple, never a wrong picture.
 *
 * Ink strokes in `currentColor`, the brand blue as the single accent. No motion.
 */

/** The blue of `public/brand/logo.svg` - the one accent colour illustrations may use. */
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
  /** The preset's `label` - "Wide", "Tight", "Patient". */
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

/** Tight - several small, quick ripples. The middle one carries the accent. */
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

/** Wide - one broad, gentle wave, with a quieter echo beneath it in the accent. */
function WideMark() {
  return (
    <g {...STROKE}>
      <path d="M6 31c7-9 13-9 20 0s13 9 20 0 8-6 12-3" />
      <path d="M6 43c7-9 13-9 20 0s13 9 20 0 8-6 12-3" stroke={BRAND_BLUE} opacity="0.55" />
    </g>
  );
}

/** Patient - still water, one drop about to land, one faint ring where it will. */
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

/** Anything the catalogue does not name - a single, unremarkable ripple. */
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
      {/* Water: two hand-drawn rings, slightly off-round, breathing slowly when motion is allowed. */}
      <g className="origin-center [transform-box:fill-box] motion-safe:animate-ripple-breathe">
        <path
          d="M28 110c10-10 42-15 66-13 22 2 42 8 46 16 3 7-14 14-42 16-32 2-62-3-72-11-3-3-2-6 2-8Z"
          opacity="0.5"
        />
        <path
          d="M10 116c14-15 58-22 92-19 30 3 54 12 56 22 1 9-24 18-62 20-44 2-82-6-90-16-2-3 0-5 4-7Z"
          opacity="0.25"
          strokeWidth="2.4"
        />
      </g>

      {/* The rock: a lumpy pebble with a soft fill, two facets and a few grains, bobbing gently. */}
      <g className="origin-center [transform-box:fill-box] motion-safe:animate-rock-bob">
        <path
          d="M34 88c-8-18 2-42 22-52 12-6 22-2 34-6 16-5 32 4 40 18 6 11 10 24 4 36-5 10-16 14-30 18-14 4-28 6-42 2-12-3-24-6-28-16Z"
          fill={BRAND_BLUE}
          fillOpacity="0.14"
        />
        <path d="M60 46c10-4 20-6 30-4" strokeWidth="2.4" opacity="0.7" />
        <path d="M102 54l-7 16 8 12-9 14" strokeWidth="2.4" opacity="0.8" />
        <path d="M46 78c6 6 14 10 24 12" strokeWidth="2.4" opacity="0.55" />
        <circle cx="76" cy="66" r="1.8" fill={BRAND_BLUE} stroke="none" opacity="0.7" />
        <circle cx="118" cy="80" r="1.8" fill={BRAND_BLUE} stroke="none" opacity="0.6" />
        <circle cx="64" cy="94" r="1.6" fill={BRAND_BLUE} stroke="none" opacity="0.5" />
      </g>
    </svg>
  );
}
