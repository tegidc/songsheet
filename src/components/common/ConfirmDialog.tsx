import { useEffect } from "react";
import { MONO, SANS } from "../../data/constants";

// A confirm that can carry more than a question: the thing being replaced or
// deleted, and a note about what the *negative* answer does. `window.confirm`
// gives OK/Cancel and one line of text, which isn't enough for either the
// "update original" replacement preview or the cloud-delete Yes/No.
export function ConfirmDialog({
  title, detail, note, confirmLabel = "Yes", cancelLabel = "No", destructive = false,
  onConfirm, onCancel, onDeny,
}: {
  title: string;
  /** What is being acted on — label and date of the row, typically. */
  detail?: string;
  /** What answering `cancelLabel` leaves behind. */
  note?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  /** Backing out entirely — backdrop click and Escape. */
  onCancel: () => void;
  /**
   * Makes this a three-way question: the negative button *does* something
   * rather than dismissing. Only backdrop/Escape then means "never mind".
   */
  onDeny?: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={onCancel}>
      <div className="w-full max-w-sm bg-background border border-border rounded-sm shadow-xl mx-4"
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-xs text-foreground" style={{ fontFamily: SANS }}>{title}</p>
          {detail && (
            <p className="text-[11px] text-muted-foreground/70 border-l-2 border-border pl-2.5 leading-relaxed"
              style={{ fontFamily: MONO }}>{detail}</p>
          )}
          {note && (
            <p className="text-[11px] text-muted-foreground/60 leading-relaxed" style={{ fontFamily: SANS }}>{note}</p>
          )}
        </div>
        <div className="px-5 py-3 border-t border-border/40 flex items-center justify-end gap-2">
          <button onClick={onDeny ?? onCancel}
            className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            style={{ fontFamily: MONO }}>{cancelLabel}</button>
          <button onClick={onConfirm}
            className={`text-[12px] px-2.5 py-1 border rounded-sm transition-colors ${destructive
              ? "border-destructive/40 text-destructive hover:bg-destructive/10"
              : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"}`}
            style={{ fontFamily: MONO }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
