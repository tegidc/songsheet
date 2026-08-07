import { MONO } from "../../data/constants";

// The small-uppercase-mono label pattern (see STYLE.md), factored out so it's
// written once. `text-[9px] uppercase tracking-[0.14em]` never varies; colour,
// spacing and display do — callers that need something other than the
// original block/`mb-0.5`/full-opacity label (most of them: this pattern is
// usually one word inline in a flex row, not a stacked field label) pass it
// via `className`. Two classes in one attribute never fight over specificity
// regardless of order, so this is a byte-for-byte swap wherever the caller's
// existing classes are just moved into `className` unchanged.
export function FL({ children, className = "block text-muted-foreground mb-0.5" }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-[9px] uppercase tracking-[0.14em] ${className}`} style={{ fontFamily: MONO }}>{children}</span>;
}
