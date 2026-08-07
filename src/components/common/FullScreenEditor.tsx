import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { MONO, SERIF } from "../../data/constants";
import { CARET_REST_MS, wordAtCaret } from "../../lib/text/caretWord";

export type FSField = {
  id: string;
  /** What is being written into — a section label, or a Create-page box name. */
  label: string;
  value: string;
  placeholder?: string;
  /** The songwriter's own prose is serif; notes-about-the-song are mono. */
  serif?: boolean;
};

// Writing on a phone, full screen.
//
// Tapping a box used to focus it in place, which on iOS zooms the visual
// viewport to the field — and everything fixed to the top of the layout
// viewport, the inspiration tools included, goes off screen with it. You could
// only get them back by scrolling away from what you were typing. So the box
// stops being a box: it becomes the whole screen, with the tools pinned above
// the text and the navigation pinned below it, and nothing that can scroll away
// from either.
//
// Three things make that hold on iOS:
//   · the overlay is sized from visualViewport, not from 100vh, so it shrinks
//     to the space above the keyboard instead of hiding its own footer behind
//     it (100vh on iOS is the height as if no keyboard existed);
//   · the textarea is 16px, which is the threshold below which Safari zooms on
//     focus — the zoom is the whole bug, so the fix is to not trip it;
//   · only the textarea scrolls. The strip and the footer are siblings of it,
//     not ancestors, so no amount of scrolling can move them.
export function FullScreenEditor({
  fields, index, onIndexChange, onChange, onClose, tools, onWordOffer,
}: {
  fields: FSField[];
  index: number;
  onIndexChange: (i: number) => void;
  onChange: (id: string, value: string) => void;
  onClose: () => void;
  /** The inspiration tools. Pinned at the top; never scrolls. */
  tools?: ReactNode;
  /**
   * The word the caret has come to rest in — an offer, not a choice. Called
   * with null the instant the caret moves again. Committing it is the strip's
   * business, not this component's: nothing here changes when it fires.
   */
  onWordOffer?: (w: string | null) => void;
}) {
  const field = fields[index];
  const taRef = useRef<HTMLTextAreaElement>(null);

  // ── The caret coming to rest ───────────────────────────────────────────────
  // Selection cannot pick a word on a phone: on iOS it is the gesture that
  // raises Cut/Copy/Paste, and that callout floats exactly over the strip the
  // word was for. A caret that stops moving inside a word raises nothing, so
  // that is the trigger — and it only ever *offers*. Nothing is looked up, and
  // nothing moves under the writer, until they tap the offer.
  const restRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offerRef = useRef(onWordOffer);
  offerRef.current = onWordOffer;

  const noteCaret = useCallback(() => {
    if (restRef.current) clearTimeout(restRef.current);
    // Any movement withdraws the standing offer first — an offer that outlived
    // the caret that made it would name a word the writer has already left.
    offerRef.current?.(null);
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: start, selectionEnd: end, value } = ta;
    // A selection is not a resting caret, and is the case this replaces.
    if (start == null || start !== end) return;
    restRef.current = setTimeout(() => {
      offerRef.current?.(wordAtCaret(value, start));
    }, CARET_REST_MS);
  }, []);

  useEffect(() => () => {
    if (restRef.current) clearTimeout(restRef.current);
    offerRef.current?.(null);
  }, []);

  // iOS reports the space actually left over by the keyboard here; everywhere
  // else this is just the window and the effect is a no-op.
  const [vv, setVv] = useState<{ h: number; top: number } | null>(null);
  useEffect(() => {
    const v = window.visualViewport;
    if (!v) return;
    const read = () => setVv({ h: v.height, top: v.offsetTop });
    read();
    v.addEventListener("resize", read);
    v.addEventListener("scroll", read);
    return () => { v.removeEventListener("resize", read); v.removeEventListener("scroll", read); };
  }, []);

  // The page behind must not scroll under the overlay.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!field) return null;

  const navBtn = "flex items-center gap-0.5 text-[11px] px-2 py-1.5 border border-border rounded-sm text-muted-foreground active:bg-muted disabled:opacity-25 transition-colors";

  return (
    <div className="fixed inset-x-0 z-50 bg-background flex flex-col"
      style={{ top: vv?.top ?? 0, height: vv ? vv.h : "100dvh" }}>

      {/* Chrome: what you are writing into, and the way out */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <span className="flex-1 min-w-0 truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
          style={{ fontFamily: MONO }}>
          {field.label}
        </span>
        <button onClick={onClose} aria-label="Close editor"
          className="shrink-0 -mr-1 p-1.5 text-muted-foreground active:text-foreground transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* The tools, pinned. This is the whole point of the mode. */}
      {tools}

      <textarea
        ref={taRef}
        value={field.value}
        onChange={e => { onChange(field.id, e.target.value); noteCaret(); }}
        placeholder={field.placeholder}
        className="flex-1 min-h-0 w-full bg-transparent px-4 py-4 text-foreground placeholder:text-muted-foreground/35 focus:outline-none resize-none leading-[1.85]"
        /* 16px exactly: below this iOS zooms the viewport on focus, which is
           what put the tools off screen in the first place. */
        style={{ fontFamily: field.serif ? SERIF : MONO, fontSize: 16 }}
        /* onSelect covers every way the caret moves that React reports — taps,
           arrow keys, typing — and onKeyUp/onClick are belt and braces for the
           cases where a caret move leaves the selection shallow-equal. */
        onSelect={noteCaret}
        onKeyUp={noteCaret}
        onClick={noteCaret} />

      {/* Navigation, above the keyboard because the overlay ends where the
          keyboard begins */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/30">
        <button onClick={() => onIndexChange(index - 1)} disabled={index === 0}
          className={navBtn} style={{ fontFamily: MONO }}>
          <ChevronLeft size={12} /> Prev
        </button>
        <button onClick={() => onIndexChange(index + 1)} disabled={index >= fields.length - 1}
          className={navBtn} style={{ fontFamily: MONO }}>
          Next <ChevronRight size={12} />
        </button>
        <span className="flex-1 min-w-0 text-center text-[10px] text-muted-foreground/45 tabular-nums"
          style={{ fontFamily: MONO }}>
          {index + 1} / {fields.length}
        </span>
        <button onClick={onClose}
          className="shrink-0 text-[12px] px-3 py-1.5 border border-foreground/25 rounded-sm text-foreground active:bg-muted transition-colors"
          style={{ fontFamily: MONO }}>
          Done
        </button>
      </div>
    </div>
  );
}
