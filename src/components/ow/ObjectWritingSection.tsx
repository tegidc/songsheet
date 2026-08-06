import { Plus, ChevronRight } from "lucide-react";
import { CollapsibleSection } from "../common/CollapsibleSection";
import { MONO, SERIF } from "../../data/constants";
import { owLabel } from "../../lib/text/owLabel";
import type { OWEntry } from "../../types";

// The song's writings, as a list. Composing happens in an OWWindow now, so
// nothing here is editable: a row opens its writing, the control at the bottom
// opens an empty one. (This list becomes the pill row in Phase 4.)
export function ObjectWritingSection({ entries, onOpen, onNew, isMobile }: {
  entries: OWEntry[];
  onOpen: (id: string) => void;
  onNew: () => void;
  isMobile?: boolean;
}) {
  return (
    <CollapsibleSection
      title="Object Writing"
      subtitle="Pick an object. Write freely through the senses. No editing, no judgement."
      isMobile={isMobile}>
      <div>
        {entries.map(entry => (
          <button key={entry.id} onClick={() => onOpen(entry.id)}
            className="w-full flex items-center gap-1.5 px-4 py-2 border-b border-border/30 last:border-b-0 hover:bg-foreground/[0.03] transition-colors text-left group">
            <ChevronRight size={10} className="text-muted-foreground/40 shrink-0" />
            <span className="text-[10px] text-foreground/60 group-hover:text-foreground transition-colors truncate"
              style={{ fontFamily: SERIF, fontStyle: entry.seedWord ? "italic" : "normal" }}>
              {owLabel(entry.seedWord, entry.text) || "Object Writing"}
            </span>
          </button>
        ))}
        <div className="px-4 py-3">
          <button onClick={onNew}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors"
            style={{ fontFamily: MONO }}>
            <Plus size={10} /> New Object Writing
          </button>
        </div>
      </div>
    </CollapsibleSection>
  );
}
