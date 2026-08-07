import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { CollapsibleSection } from "../common/CollapsibleSection";
import { MONO, SERIF } from "../../data/constants";
import { owLabel } from "../../lib/text/owLabel";
import type { OWEntry } from "../../types";

// The collapsed glimpse: three or four of the writings themselves rather than a
// sentence about them. Four only when the fourth fits — a preview that wraps to
// two lines is not a glimpse.
const MIN_GLIMPSE = 3, MAX_GLIMPSE = 4, GLIMPSE_CHARS = 34;

function sample(labels: string[]): { picks: string[]; more: number } {
  // Shuffled, not sliced: always showing the first few makes the same writings
  // the only ones ever seen. A rotating glimpse is worth more than a fixed one.
  const pool = [...labels];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picks: string[] = [];
  for (const label of pool) {
    if (picks.length >= MAX_GLIMPSE) break;
    const used = picks.reduce((n, p) => n + p.length + 3, 0);
    if (picks.length >= MIN_GLIMPSE && used + label.length > GLIMPSE_CHARS) break;
    picks.push(label);
  }
  return { picks, more: labels.length - picks.length };
}

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
  // Controlled, because the header has to know whether it is closed: a closed
  // section that holds writings shows them instead of describing them.
  const [open, setOpen] = useState(!isMobile);
  // Bumped on every close, so each collapse is a fresh handful rather than the
  // same four for ever.
  const [glimpse, setGlimpse] = useState(0);

  const labels = useMemo(
    () => entries.map(e => owLabel(e.seedWord, e.text) || "Object Writing"),
    [entries]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const preview = useMemo(() => sample(labels), [labels, glimpse]);

  return (
    <CollapsibleSection
      title="Imported & Written Object Writings"
      open={open}
      onOpenChange={v => { setOpen(v); if (!v) setGlimpse(g => g + 1); }}
      subtitle={
        entries.length === 0
          // The description is for the empty case only. Once there are
          // writings, saying what a pill is matters less than showing one.
          ? "Pills written here sync to the cloud. Imported ones stay with this song."
          : open ? undefined : (
            <span className="flex flex-wrap items-center gap-1 mt-1">
              {/* Spans, not buttons: this sits inside the header's own
                  role="button", and nesting interactive elements was a real
                  bug here once. Tapping anywhere opens the section, which is
                  where the live pills are. */}
              {preview.picks.map((label, i) => (
                <span key={`${label}-${i}`}
                  className="px-2 py-0.5 border border-border/70 rounded-full text-[11px] text-foreground/55 max-w-[9rem] truncate"
                  style={{ fontFamily: SERIF }}>
                  {label}
                </span>
              ))}
              {preview.more > 0 && (
                <span className="text-[10px] text-muted-foreground/45" style={{ fontFamily: MONO }}>
                  +{preview.more}
                </span>
              )}
            </span>
          )
      }
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
