import { X } from "lucide-react";
import { CollapsibleSection } from "../common/CollapsibleSection";
import { SERIF } from "../../data/constants";
import { owLabel } from "../../lib/text/owLabel";
import type { OWEntry } from "../../types";

// The song's writings as a row of pills. A pill is a collapsed OWWindow, not a
// summary of one — clicking it opens the writing in that same editor.
//
// Two kinds, both already in the data model:
//   linked — written here, has a cloudId, edits sync to its standalone_ow row
//   loose  — imported, carries sourceId, syncs nowhere; the text belongs to the
//            song. Marked with a hollow dot so the difference is visible at a
//            glance without a legend.
//
// Deleting a pill removes it from this song only, whichever kind it is —
// standalone_ow is never touched from here. (The one place a cloud row can be
// deleted is the discreet control inside its own window.)
export function OWPillRow({ entries, onOpen, onDelete, isMobile }: {
  entries: OWEntry[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  isMobile?: boolean;
}) {
  return (
    <CollapsibleSection
      title="Imported & Written Object Writings"
      subtitle="Pills written here sync to the cloud. Imported ones stay with this song."
      isMobile={isMobile}>
      <div className="px-4 py-3">
        {entries.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/40 italic" style={{ fontFamily: SERIF }}>
            Nothing yet — write one below, or bring one in from the cloud.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {entries.map(entry => {
              const loose = !!entry.imported;
              return (
                <div key={entry.id}
                  className="group flex items-center gap-1 pl-2.5 pr-1 py-1 border border-border rounded-full hover:border-foreground/30 transition-colors">
                  {loose && (
                    <span aria-hidden
                      title="Loose — imported from the cloud, syncs nowhere"
                      className="w-1.5 h-1.5 rounded-full border border-muted-foreground/60 shrink-0" />
                  )}
                  <button onClick={() => onOpen(entry.id)}
                    title={loose ? "Loose — imported from the cloud, syncs nowhere" : "Linked — edits sync to the cloud"}
                    className="text-[11px] text-foreground/70 hover:text-foreground transition-colors max-w-[14rem] truncate"
                    style={{ fontFamily: SERIF, fontStyle: entry.seedWord ? "italic" : "normal" }}>
                    {owLabel(entry.seedWord, entry.text) || "Object Writing"}
                  </button>
                  <button onClick={() => onDelete(entry.id)}
                    title="Remove from this song (the cloud copy is untouched)"
                    className="text-muted-foreground/30 hover:text-destructive transition-colors p-0.5 md:opacity-0 md:group-hover:opacity-100">
                    <X size={9} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
