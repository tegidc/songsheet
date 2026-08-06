import { useState, useRef } from "react";
import { Plus, ChevronDown } from "lucide-react";
import { CollapsibleSection } from "../common/CollapsibleSection";
import { ObjectWritingBox } from "./ObjectWritingBox";
import { MONO, SERIF } from "../../data/constants";
import { uid } from "../../format";
import type { OWEntry } from "../../types";

export function ObjectWritingSection({ entries, allSongText, onUpdate, onSaveToNotebook, isMobile }: {
  entries: OWEntry[];
  allSongText: string;
  onUpdate: (entries: OWEntry[]) => void;
  onSaveToNotebook: (title: string, text: string) => void;
  isMobile?: boolean;
}) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const entryRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleCollapsed = (id: string) =>
    setCollapsedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const rawEntries = entries.length > 0 ? entries : null;
  const [defaultEntry] = useState<OWEntry>(() => ({ id: "ow-default", text: "" }));
  const visibleEntries = rawEntries ?? [defaultEntry];

  const updateEntry = (id: string, text: string, seedWord?: string) => {
    const current = rawEntries ?? [defaultEntry];
    onUpdate(current.map(e => e.id === id ? { ...e, text, seedWord } : e));
  };

  const drillDown = (word: string) => {
    const current = rawEntries ?? [defaultEntry];
    const next = [...current, { id: uid(), text: "", seedWord: word }];
    onUpdate(next);
    const newId = next[next.length - 1].id;
    setTimeout(() => {
      setCollapsedIds(prev => { const s = new Set(prev); s.delete(newId); return s; });
      entryRefs.current[newId]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  const addNew = () => {
    const current = rawEntries ?? [defaultEntry];
    const next = [...current, { id: uid(), text: "" }];
    onUpdate(next);
    const newId = next[next.length - 1].id;
    setTimeout(() => {
      setCollapsedIds(prev => { const s = new Set(prev); s.delete(newId); return s; });
      entryRefs.current[newId]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  // Header pills for entries with a seed word
  const pillEntries = visibleEntries.filter(e => e.seedWord?.trim());
  const headerExtra = pillEntries.length > 0 ? (
    <div className="flex flex-wrap gap-1 mt-1.5" onClick={e => e.stopPropagation()}>
      {pillEntries.map(e => (
        <button key={e.id}
          onClick={() => {
            setCollapsedIds(prev => { const s = new Set(prev); s.delete(e.id); return s; });
            setTimeout(() => entryRefs.current[e.id]?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
          }}
          className="text-[8px] uppercase tracking-wider border border-border/40 text-muted-foreground/50 hover:text-foreground rounded px-1.5 py-0.5 transition-colors"
          style={{ fontFamily: MONO }}
          title={e.seedWord}>
          {e.seedWord}
        </button>
      ))}
    </div>
  ) : undefined;

  return (
    <CollapsibleSection
      title="Object Writing"
      subtitle="Pick an object. Write freely through the senses. No editing, no judgement."
      isMobile={isMobile}
      headerExtra={headerExtra}>
      <div>
        {visibleEntries.map(entry => {
          const isCollapsed = collapsedIds.has(entry.id);
          return (
            <div key={entry.id} ref={el => { entryRefs.current[entry.id] = el; }}
              className="border-b border-border/40 last:border-b-0">
              {/* Per-entry title row — only shown when collapsed */}
              {isCollapsed && (
                <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/10 border-b border-border/30">
                  <button onClick={() => toggleCollapsed(entry.id)}
                    className="flex items-center gap-1.5 flex-1 min-w-0 text-left group">
                    <ChevronDown size={10} className="text-muted-foreground/40 -rotate-90 shrink-0" />
                    <span className="text-[10px] text-foreground/60 group-hover:text-foreground transition-colors truncate"
                      style={{ fontFamily: SERIF, fontStyle: entry.seedWord ? "italic" : "normal" }}>
                      {entry.seedWord ?? "Object Writing"}
                    </span>
                  </button>
                </div>
              )}
              {!isCollapsed && (
                <ObjectWritingBox
                  entry={entry}
                  onChange={(text, seedWord) => updateEntry(entry.id, text, seedWord)}
                  onMinimize={() => toggleCollapsed(entry.id)}
                  onDrillDown={drillDown}
                  onSaveToNotebook={(title, text) => onSaveToNotebook(title, text)}
                  allSongText={allSongText}
                  isMobile={isMobile}
                />
              )}
            </div>
          );
        })}
        <div className="px-4 py-3">
          <button onClick={addNew}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors"
            style={{ fontFamily: MONO }}>
            <Plus size={10} /> New Object Writing
          </button>
        </div>
      </div>
    </CollapsibleSection>
  );
}

