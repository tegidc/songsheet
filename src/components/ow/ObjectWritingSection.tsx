import { Plus, Cloud } from "lucide-react";
import { CollapsibleSection } from "../common/CollapsibleSection";
import { MONO } from "../../data/constants";

// The object writing area. The song's existing writings are no longer listed
// here — they are the pill row above (`OWPillRow`), which sits between the
// Notebook and this. What is left is the two ways to acquire one: start a new
// writing, or bring in a past one from the cloud.
export function ObjectWritingSection({ onNew, onOpenPicker, isMobile }: {
  onNew: () => void;
  /** Opens the cloud picker. Omitted when signed out — there is nothing to pick from. */
  onOpenPicker?: () => void;
  isMobile?: boolean;
}) {
  return (
    <CollapsibleSection
      title={<>
        {/* The same ✦ the header button, the floating button and the sidebar
            use — one glyph, one meaning, so the heading and the ways into it
            read as the same thing. */}
        <span aria-hidden className="text-accent/70 mr-1.5">✦</span>
        Object Writing
      </>}
      subtitle="Pick an object. Write freely through the senses. No editing, no judgement."
      isMobile={isMobile}>
      <div className="px-4 py-3 flex items-center gap-4">
        <button onClick={onNew}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors"
          style={{ fontFamily: MONO }}>
          <Plus size={10} /> New Object Writing
        </button>
        {onOpenPicker && (
          <button onClick={onOpenPicker} title="Bring in a past writing from the cloud"
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors"
            style={{ fontFamily: MONO }}>
            <Cloud size={11} /> From the cloud
          </button>
        )}
      </div>
    </CollapsibleSection>
  );
}
