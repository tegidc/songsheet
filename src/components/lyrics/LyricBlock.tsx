import { useState, useMemo } from "react";
import { Trash2, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { AutoTA } from "../common/AutoTA";
import { MONO, SCOL, SERIF } from "../../data/constants";
import { parseLyricsIntoSections } from "../../sections";
import type { Section, SectionType } from "../../types";

export function LyricBlock({ section, idx, total, onChange, onDelete, onMove, onDuplicate,
  onToggleNaming, namingStyle, onWordSelect, onSplitSections, collapsed, onToggleCollapse,
  onTapToEdit }: {
  section: Section; idx: number; total: number;
  onChange: (s: Section) => void; onDelete: () => void;
  onMove: (dir: -1|1) => void; onDuplicate: () => void;
  onToggleNaming: () => void; namingStyle: "number" | "letter";
  onWordSelect?: (w: string) => void;
  onSplitSections?: (parts: Array<{ type: SectionType; label: string; lyrics: string }>) => void;
  collapsed?: boolean; onToggleCollapse?: () => void;
  /** Mobile: hand this section off to the full-screen editor instead of typing in place. */
  onTapToEdit?: () => void;
}) {
  const [editLabel, setEditLabel] = useState(false);

  // Detect section headers in current lyrics content
  const splitParts = useMemo(() => parseLyricsIntoSections(section.lyrics), [section.lyrics]);
  const canSplit   = !!splitParts && !!onSplitSections;

  // First non-empty line for the collapsed preview
  const previewLine = section.lyrics.split("\n").find(l => l.trim()) ?? "";

  return (
    <div id={`section-${section.id}`} className="group border border-border rounded-sm overflow-hidden hover:shadow-sm transition-shadow">
      <div className={`${SCOL[section.type]} flex items-center gap-2 px-3 py-2 border-b border-border`}>
        {/* Label */}
        {editLabel ? (
          <input value={section.label} onChange={e => onChange({ ...section, label: e.target.value })}
            onBlur={() => setEditLabel(false)} onKeyDown={e => e.key === "Enter" && setEditLabel(false)}
            autoFocus className="bg-transparent text-[10px] uppercase tracking-[0.12em] text-muted-foreground focus:outline-none border-b border-foreground/20"
            style={{ fontFamily: MONO, width: `${Math.max(section.label.length + 1, 6)}ch` }} />
        ) : (
          <button onClick={() => setEditLabel(true)}
            className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground transition-colors"
            style={{ fontFamily: MONO }}>{section.label}</button>
        )}

        {/* Split suggestion — appears when section markers detected in lyrics */}
        {canSplit && (
          <button onClick={() => onSplitSections!(splitParts!)}
            className="text-[9px] px-1.5 py-0.5 border border-border/40 rounded-sm text-muted-foreground/50 hover:text-foreground hover:border-foreground/20 transition-colors shrink-0 leading-none"
            style={{ fontFamily: MONO }} title="Split detected sections">
            ⇥ split
          </button>
        )}

        {/* Right side: hover controls + always-visible collapse toggle */}
        <div className="ml-auto flex items-center gap-1.5">
          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onMove(-1)} disabled={idx === 0} title="Move up"
              className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"><ChevronUp size={12} /></button>
            <button onClick={() => onMove(1)} disabled={idx === total - 1} title="Move down"
              className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"><ChevronDown size={12} /></button>
            <button onClick={onDuplicate} title="Duplicate" className="text-muted-foreground hover:text-foreground transition-colors"><Copy size={12} /></button>
            <button onClick={onToggleNaming} title={namingStyle === "number" ? "Switch to A/B" : "Switch to 1/2"}
              className="text-muted-foreground hover:text-foreground transition-colors text-[9px] leading-none"
              style={{ fontFamily: MONO }}>{namingStyle === "number" ? "#" : "A"}</button>
            <button onClick={onDelete} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={12} /></button>
          </div>
          {/* Collapse toggle — always visible */}
          <button onClick={onToggleCollapse}
            className="text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors ml-0.5"
            title={collapsed ? "Expand" : "Collapse"}>
            <ChevronDown size={11} className={`transition-transform duration-150 ${collapsed ? "-rotate-90" : "rotate-0"}`} />
          </button>
        </div>
      </div>

      {/* Collapsed: show dim first-line preview, click to expand */}
      {collapsed ? (
        <div onClick={onToggleCollapse}
          className="px-3 py-2 cursor-pointer border-b border-transparent hover:bg-muted/10 transition-colors">
          <span className="text-[11px] text-muted-foreground/38 italic truncate block leading-snug"
            style={{ fontFamily: SERIF }}>
            {previewLine || "…"}
          </span>
        </div>
      ) : (
        <div className="px-3 pt-2.5 pb-3">
          <AutoTA value={section.lyrics} onChange={v => onChange({ ...section, lyrics: v })}
            placeholder="Write your lyrics here…" serif rows={4} onWordSelect={onWordSelect}
            onTapToEdit={onTapToEdit} />
        </div>
      )}
    </div>
  );
}

