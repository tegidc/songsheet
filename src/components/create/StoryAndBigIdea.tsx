import { CollapsibleSection } from "../common/CollapsibleSection";
import { FL } from "../common/FL";
import { MONO, SERIF } from "../../data/constants";
import type { Song } from "../../types";

export function StoryAndBigIdea({ story, bigIdea, onStoryChange, onBigIdeaChange, isMobile, onTapToEdit }: {
  story: Song["story"]; bigIdea: string;
  onStoryChange: (s: Song["story"]) => void;
  onBigIdeaChange: (v: string) => void;
  isMobile?: boolean;
  /** Mobile: open this box in the full-screen editor rather than typing in place. */
  onTapToEdit?: (id: "bigIdea" | keyof Song["story"]) => void;
}) {
  // readOnly is what keeps the OS keyboard down until the overlay is up.
  const tap = (id: "bigIdea" | keyof Song["story"]) =>
    onTapToEdit ? { readOnly: true, onClick: () => onTapToEdit(id) } : {};
  const parts: { key: keyof Song["story"]; label: string; placeholder: string }[] = [
    { key: "beginning", label: "Beginning", placeholder: "Where does it start — emotionally, narratively?" },
    { key: "middle",    label: "Middle",    placeholder: "What shifts or deepens?" },
    { key: "end",       label: "End",       placeholder: "Where does it land — resolved or not?" },
  ];
  return (
    <CollapsibleSection title="Story · Big Idea" isMobile={isMobile}>
      <div className={isMobile ? "flex flex-col divide-y divide-border" : "flex divide-x divide-border"}>
        {/* Big Idea — first on both layouts */}
        <div className={`${isMobile ? "w-full" : "flex-[1] min-w-0"} px-4 py-3 flex flex-col`}>
          <FL className="block text-muted-foreground mb-2">
            The Big Idea
          </FL>
          <textarea
            value={bigIdea}
            onChange={e => onBigIdeaChange(e.target.value)}
            placeholder={"The theme, spark, or one true thing this song is about.\n\nIf it doesn't fit here, it might be too big."}
            rows={isMobile ? 3 : 5}
            {...tap("bigIdea")}
            className={`flex-1 w-full bg-transparent text-foreground placeholder:text-muted-foreground/35 focus:outline-none resize-none leading-snug ${onTapToEdit ? "cursor-pointer" : ""}`}
            style={{ fontFamily: SERIF, fontSize: 13}}
          />
        </div>
        {/* Story Arc */}
        <div className={isMobile ? "w-full" : "flex-[2] min-w-0"}>
          {parts.map((part, i) => (
            <div key={part.key} className={`px-4 py-2.5 ${!isMobile && i < parts.length - 1 ? "border-b border-border/50" : ""} ${isMobile && i < parts.length - 1 ? "border-b border-border/40" : ""}`}>
              <FL className="block text-muted-foreground mb-1">
                {part.label}
              </FL>
              <input
                value={story[part.key]}
                onChange={e => onStoryChange({ ...story, [part.key]: e.target.value })}
                placeholder={part.placeholder}
                {...tap(part.key)}
                className={`w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/35 focus:outline-none ${onTapToEdit ? "cursor-pointer" : ""}`}
                style={{ fontFamily: SERIF }}
              />
            </div>
          ))}
        </div>
      </div>
    </CollapsibleSection>
  );
}

