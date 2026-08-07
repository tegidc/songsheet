import { useState } from "react";
import { CollapsibleSection } from "../common/CollapsibleSection";
import { MONO } from "../../data/constants";

export function ProductionSection({ value, onChange, isMobile, onTapToEdit }: {
  value: string; onChange: (v: string) => void; isMobile?: boolean;
  /** Mobile: open this box in the full-screen editor rather than typing in place. */
  onTapToEdit?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <CollapsibleSection title="Production" subtitle="references · arrangement · technical ideas" defaultOpen={false} isMobile={isMobile}>
      <div className="px-4 pt-3 pb-2">
        <div className={`overflow-hidden transition-all duration-200 ${expanded ? "" : "max-h-32"}`}>
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="References, sounds, instruments, arrangement notes, tempo/key ideas, plugins, production direction…"
            rows={expanded ? 14 : 5}
            readOnly={!!onTapToEdit}
            onClick={onTapToEdit}
            className={`w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/35 focus:outline-none resize-none leading-[1.9] ${onTapToEdit ? "cursor-pointer" : ""}`}
            style={{ fontFamily: MONO }}
          />
        </div>
        {value.trim().length > 0 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="mt-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            style={{ fontFamily: MONO }}>
            {expanded ? "Collapse ↑" : "Expand ↓"}
          </button>
        )}
      </div>
    </CollapsibleSection>
  );
}

