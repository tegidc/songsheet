import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { MONO, SANS } from "../../data/constants";

export function CollapsibleSection({ title, subtitle, defaultOpen = true, isMobile, headerExtra, open: controlledOpen, onOpenChange, children }: {
  title: string; subtitle?: string; defaultOpen?: boolean; isMobile?: boolean;
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
          {subtitle && <p className="text-xs text-muted-foreground/60 mt-0.5" style={{ fontFamily: SANS }}>{subtitle}</p>}
          {headerExtra}
        </div>
        <ChevronDown size={13} className={`text-muted-foreground transition-transform shrink-0 ml-4 ${open ? "rotate-180" : ""}`} />
      </div>
      {open && children}
    </div>
  );
}
