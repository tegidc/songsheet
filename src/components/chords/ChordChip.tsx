import { X } from "lucide-react";
import { MONO } from "../../data/constants";

export function ChordChip({ chord, label, onTap, onRemove }: {
  chord: string; label: string; onTap: () => void;
  /**
   * Only the From Fretboard row passes this — that row is a log the songwriter
   * keeps, not a set derived from the key, so it is the only one with anything
   * to prune. The × is a sibling of the chord button rather than inside it:
   * nesting interactive elements was a real bug in this codebase once.
   */
  onRemove?: () => void;
}) {
  const chip = (
    <button onClick={onTap}
      className="flex flex-col items-center justify-center min-w-[54px] px-2.5 py-1.5 rounded-md border border-border bg-background active:bg-muted transition-colors"
      style={{ fontFamily: MONO }}>
      <span className="text-[13px] text-foreground leading-tight">{chord}</span>
      {label && <span className="text-[8px] uppercase tracking-[0.1em] text-muted-foreground mt-0.5">{label}</span>}
    </button>
  );
  if (!onRemove) return chip;
  return (
    <div className="relative">
      {chip}
      {/* There is no hover on a phone, so it stands — small, dim and in the
          corner, the same bargain the writing pills make on mobile. */}
      <button onClick={onRemove} aria-label={`Remove ${chord}`}
        className="absolute -top-1 -left-1 p-1 leading-none text-muted-foreground/40 active:text-destructive transition-colors">
        <X size={9} />
      </button>
    </div>
  );
}
