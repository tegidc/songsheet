import { MONO } from "../../data/constants";

export function FL({ children }: { children: React.ReactNode }) {
  return <span className="block text-[9px] uppercase tracking-[0.14em] text-muted-foreground mb-0.5" style={{ fontFamily: MONO }}>{children}</span>;
}
