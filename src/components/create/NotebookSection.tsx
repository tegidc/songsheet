import { useState, useRef } from "react";
import { ChevronDown, X } from "lucide-react";
import { CollapsibleSection } from "../common/CollapsibleSection";
import { MONO, SERIF } from "../../data/constants";
import type { NbEntry } from "../../types";

export function NotebookSection({ value, onChange, nbSections, onDeleteNbSection, isMobile }: {
  value: string; onChange: (v: string) => void;
  nbSections?: NbEntry[]; onDeleteNbSection?: (id: string) => void;
  isMobile?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleOpen = (id: string) =>
    setOpenIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const scrollToSection = (id: string) => {
    setOpenIds(prev => { const s = new Set(prev); s.add(id); return s; });
    setTimeout(() => sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  const sections = nbSections ?? [];

  // Header pills — one per saved OW subsection
  const headerExtra = sections.length > 0 ? (
    <div className="flex flex-wrap gap-1 mt-1.5" onClick={e => e.stopPropagation()}>
      {sections.map(s => (
        <button key={s.id}
          onClick={() => scrollToSection(s.id)}
          className="text-[8px] uppercase tracking-wider border border-accent/40 text-accent/70 hover:text-accent rounded px-1.5 py-0.5 transition-colors"
          style={{ fontFamily: MONO }}
          title={s.title}>
          {s.title || "Object Writing"}
        </button>
      ))}
    </div>
  ) : undefined;

  return (
    <CollapsibleSection title="Notebook" subtitle="creative thinking · free writing · ideas" isMobile={isMobile} headerExtra={headerExtra}>
      {/* Free textarea */}
      <div className="px-4 pt-3 pb-2">
        <div className={`overflow-hidden transition-all duration-200 ${expanded ? "" : "max-h-32"}`}>
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="Free writing, creative ideas, associations, things that feel true about this song…"
            rows={expanded ? 16 : 5}
            className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/35 focus:outline-none resize-none leading-[1.9]"
            style={{ fontFamily: SERIF }}
          />
        </div>
        {value.trim().length > 0 && (
          <button onClick={() => setExpanded(e => !e)}
            className="mt-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            style={{ fontFamily: MONO }}>
            {expanded ? "Collapse ↑" : "Expand ↓"}
          </button>
        )}
      </div>

      {/* Saved Object Writing subsections */}
      {sections.length > 0 && (
        <div className="border-t border-border/40">
          {sections.map(s => (
            <div key={s.id} ref={el => { sectionRefs.current[s.id] = el; }} className="border-b border-border/30 last:border-b-0">
              <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/10">
                <button onClick={() => toggleOpen(s.id)}
                  className="flex items-center gap-1.5 flex-1 min-w-0 text-left group">
                  <ChevronDown size={10} className={`text-muted-foreground/40 shrink-0 transition-transform duration-150 ${openIds.has(s.id) ? "" : "-rotate-90"}`} />
                  <span className="text-[10px] text-accent/80 group-hover:text-accent transition-colors truncate"
                    style={{ fontFamily: SERIF, fontStyle: "italic" }}>
                    {s.title || "Object Writing"}
                  </span>
                  <span className="text-[8px] text-muted-foreground/40 shrink-0 ml-1" style={{ fontFamily: MONO }}>
                    {new Date(s.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </button>
                {onDeleteNbSection && (
                  <button onClick={() => onDeleteNbSection(s.id)}
                    className="text-muted-foreground/25 hover:text-muted-foreground transition-colors shrink-0">
                    <X size={10} />
                  </button>
                )}
              </div>
              {openIds.has(s.id) && (
                <div className="px-4 py-3">
                  <p className="text-xs leading-[1.9] text-foreground/80 whitespace-pre-wrap" style={{ fontFamily: SERIF }}>
                    {s.text}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
