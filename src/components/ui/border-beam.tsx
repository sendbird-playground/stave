import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface BorderBeamProps {
  /** Animation duration in seconds. Default 6. */
  duration?: number;
  /** Animation delay in seconds (positive values skip into the loop). Default 0. */
  delay?: number;
  /** Starting color of the beam head. Accepts any CSS color. */
  colorFrom?: string;
  /** Ending color of the beam head. Accepts any CSS color. */
  colorTo?: string;
  /** Border width of the beam ring in px. Default 1. */
  borderWidth?: number;
  /** Extra classes on the outer wrapper. */
  className?: string;
}

/**
 * Decorative animated "beam" that travels around the border of its positioned
 * parent container. The parent must establish `position: relative` and a
 * `border-radius` — the beam inherits both via `absolute inset-0` and
 * `rounded-[inherit]`.
 *
 * The beam is rendered as a masked conic gradient so the traced edge always
 * matches the parent's rounded corners exactly, regardless of container size.
 * Honors `prefers-reduced-motion` (animation is neutralized globally in
 * `globals.css`).
 */
export function BorderBeam(args: BorderBeamProps) {
  const {
    duration = 6,
    delay = 0,
    colorFrom = "var(--color-primary)",
    colorTo = "var(--color-ring)",
    borderWidth = 1,
    className,
  } = args;

  const style: CSSProperties = {
    // Custom properties consumed by the `.border-beam` rule in globals.css.
    ["--beam-duration" as string]: `${duration}s`,
    ["--beam-delay" as string]: `${-delay}s`,
    ["--beam-color-from" as string]: colorFrom,
    ["--beam-color-to" as string]: colorTo,
    ["--beam-border-width" as string]: `${borderWidth}px`,
  };

  return (
    <div
      aria-hidden="true"
      data-border-beam
      style={style}
      className={cn(
        "border-beam pointer-events-none absolute inset-0 rounded-[inherit]",
        className,
      )}
    />
  );
}
