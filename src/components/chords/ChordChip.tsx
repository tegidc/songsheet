import { MONO } from "../../data/constants";

export function ChordChip({ chord, label, onTap }: { chord: string; label: string; onTap: () => void }) {
  return (
    <button onClick={onTap}
      className="flex flex-col items-center justify-center min-w-[54px] px-2.5 py-1.5 rounded-md border border-border bg-background active:bg-muted transition-colors"
      style={{ fontFamily: MONO }}>
      <span className="text-[13px] text-foreground leading-tight">{chord}</span>
      {label && <span className="text-[8px] uppercase tracking-[0.1em] text-muted-foreground mt-0.5">{label}</span>}
    </button>
  );
}
