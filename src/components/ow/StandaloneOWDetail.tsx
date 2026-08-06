import { useState } from "react";
import { Copy, X } from "lucide-react";
import { MONO, SERIF } from "../../data/constants";
import type { StandaloneOW } from "../../types";

export function StandaloneOWDetail({
  entry, onClose, onCreateSong, onAddToSong,
}: {
  entry: StandaloneOW;
  onClose: () => void;
  onCreateSong: (seedWord: string, body: string) => void;
  onAddToSong?: (seedWord: string, body: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState(false);

  const handleAddToSong = () => {
    onAddToSong?.(entry.seed_word, entry.body);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(entry.body).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-background border border-border rounded-sm shadow-xl mx-4">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <span className="text-[11px] italic text-foreground/70" style={{ fontFamily: SERIF }}>{entry.seed_word}</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={14} />
          </button>
        </div>
        <div className="px-5 py-4">
          <pre className="text-sm leading-[1.85] text-foreground/80 whitespace-pre-wrap max-h-80 overflow-y-auto"
            style={{ fontFamily: SERIF }}>{entry.body}</pre>
        </div>
        <div className="px-5 py-3 border-t border-border/40 flex items-center justify-between gap-2">
          <button onClick={onClose}
            className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            style={{ fontFamily: MONO }}>Close</button>
          <div className="flex items-center gap-2">
            <button onClick={handleCopy}
              className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground transition-colors"
              style={{ fontFamily: MONO }}>{copied ? "Copied ✓" : "Copy text"}</button>
            {onAddToSong && (
              <button onClick={handleAddToSong} disabled={added}
                className={`text-[12px] px-2.5 py-1 border rounded-sm transition-colors ${added ? "border-accent text-accent" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"}`}
                style={{ fontFamily: MONO }}>{added ? "Added ✓" : "Add to song"}</button>
            )}
            <button onClick={() => { onCreateSong(entry.seed_word, entry.body); onClose(); }}
              className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              style={{ fontFamily: MONO }}>Create song from writing</button>
          </div>
        </div>
      </div>
    </div>
  );
}

