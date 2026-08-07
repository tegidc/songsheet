import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { MONO, SANS } from "../../data/constants";

export function CollapsibleSection({ title, subtitle, defaultOpen = true, isMobile, headerExtra, open: controlledOpen, onOpenChange, children }: {
  /** Usually a string; a node when the heading carries a glyph (see Object Writing). */
  title: React.ReactNode;
  /**
   * The line under the heading. A node rather than a string because a collapsed
   * section is sometimes better off showing what it holds than describing it.
   */
  subtitle?: React.ReactNode;
  defaultOpen?: boolean; isMobile?: boolean;
  headerExtra?: React.ReactNode;
  open?: boolean; onOpenChange?: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(isMobile ? false : defaultOpen);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => { setInternalOpen(v); onOpenChange?.(v); };
  return (
    <div className="border border-border rounded-sm overflow-hidden">
      <div role="button" tabIndex={0} onClick={() => setOpen(!open)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(!open); } }}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left cursor-pointer">
        <div className="flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>{title}</span>
          {/* A div, not a p: the subtitle slot can hold pills as well as prose,
              and pills are not phrasing content. */}
          {subtitle && <div className="text-xs text-muted-foreground/60 mt-0.5" style={{ fontFamily: SANS }}>{subtitle}</div>}
          {headerExtra}
        </div>
        <ChevronDown size={13} className={`text-muted-foreground transition-transform shrink-0 ml-4 ${open ? "rotate-180" : ""}`} />
      </div>
      {open && children}
    </div>
  );
}
