import { useRef, useEffect, type RefObject } from "react";
import { SERIF, MONO } from "../../data/constants";

export function AutoTA({ value, onChange, placeholder, serif = false, rows = 3, onWordSelect, dimText = false, innerRef, textClass = "text-xs", onTapToEdit }: {
  value: string; onChange: (v: string) => void; placeholder?: string; serif?: boolean; rows?: number;
  onWordSelect?: (w: string) => void; dimText?: boolean; innerRef?: RefObject<HTMLTextAreaElement>;
  textClass?: string;
  /**
   * Mobile: tapping the box opens the full-screen editor instead of typing
   * here. readOnly is what keeps the OS keyboard down — a focusable textarea
   * would raise it (and zoom the viewport) before the overlay could appear.
   */
  onTapToEdit?: () => void;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const r = (innerRef ?? localRef) as RefObject<HTMLTextAreaElement>;
  useEffect(() => {
    if (r.current) { r.current.style.height = "auto"; r.current.style.height = r.current.scrollHeight + "px"; }
  }, [value]);
  return (
    <textarea ref={r} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      readOnly={!!onTapToEdit}
      onClick={onTapToEdit}
      className={`w-full bg-transparent ${textClass} placeholder:text-muted-foreground/35 focus:outline-none resize-none leading-[1.85] transition-colors duration-300 ${dimText ? "text-foreground/40" : "text-foreground"} ${onTapToEdit ? "cursor-pointer" : ""}`}
      style={{ fontFamily: serif ? SERIF : MONO }}
      onSelect={onWordSelect ? e => {
        const ta = e.currentTarget;
        const sel = ta.value.substring(ta.selectionStart ?? 0, ta.selectionEnd ?? 0).trim();
        if (sel.length >= 2 && /^[a-zA-Z''\-]+$/.test(sel) && !sel.includes(" ")) {
          onWordSelect(sel.toLowerCase().replace(/[^a-z']/g, ""));
        }
      } : undefined} />
  );
}
