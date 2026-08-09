import { useEffect, useMemo, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { MONO, SERIF } from "../../data/constants";
import { formatRelativeTime } from "../../format";
import { useOWCloudVersion } from "../../lib/owCloud";
import { owLabel } from "../../lib/text/owLabel";
import type { StandaloneOW } from "../../types";

const HANDFUL = 6;

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Bringing a past writing into this song. Two ways in, because they answer
// different questions: the shuffled handful is for when you don't know what
// you're looking for, the search box for when you do.
//
// One writing at a time, and the picker stays open so the next can be chosen
// straight away — a batch import would flood both the pill row and Inspiration
// with text the song never asked for.
export function OWCloudPicker({ onImport, onClose }: {
  onImport: (row: StandaloneOW) => void;
  onClose: () => void;
}) {
  const [rows, setRows]       = useState<StandaloneOW[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery]     = useState("");
  const [order, setOrder]     = useState<string[]>([]);
  const [added, setAdded]     = useState<Record<string, boolean>>({});

  // Re-read when the cloud gains or loses a writing — the picker can be open
  // while a song's autosave mirrors one out of it, and a search that can't find
  // a writing the songwriter just made is the picker saying it isn't there.
  const owCloudVersion = useOWCloudVersion();
  useEffect(() => {
    supabase.from("standalone_ow")
      .select("id, seed_word, body, written_at, origin_song_id")
      .order("written_at", { ascending: false })
      .then(({ data }) => {
        const list = (data as StandaloneOW[]) ?? [];
        setRows(list);
        // The deal is only made once. A refetch must not re-shuffle the handful
        // being read, so what is already in the order keeps its place and a new
        // writing joins the pool behind it — Shuffle is what re-deals.
        setOrder(prev => prev.length === 0
          ? shuffle(list).map(r => r.id)
          : [...prev, ...list.filter(r => !prev.includes(r.id)).map(r => r.id)]);
        setLoading(false);
      });
  }, [owCloudVersion]);

  const searching = query.trim().length > 0;

  const shown = useMemo(() => {
    if (searching) {
      const q = query.trim().toLowerCase();
      return rows.filter(r =>
        owLabel(r.seed_word, r.body).toLowerCase().includes(q) || r.body.toLowerCase().includes(q));
    }
    const byId = new Map(rows.map(r => [r.id, r]));
    return order.map(id => byId.get(id)).filter((r): r is StandaloneOW => !!r).slice(0, HANDFUL);
  }, [rows, order, query, searching]);

  const take = (row: StandaloneOW) => {
    onImport(row);
    setAdded(a => ({ ...a, [row.id]: true }));
    setTimeout(() => setAdded(a => ({ ...a, [row.id]: false })), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg bg-background border border-border rounded-sm shadow-xl mx-4 flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>
            From the Object Writing cloud
          </span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-border/40 flex items-center gap-2 shrink-0">
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="search your writings…"
            className="flex-1 min-w-0 bg-transparent border-b border-border/60 text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-accent pb-0.5 transition-colors"
            style={{ fontFamily: SERIF }} />
          {!searching && (
            <button onClick={() => setOrder(shuffle(rows).map(r => r.id))} title="Shuffle another handful"
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0"
              style={{ fontFamily: MONO }}>
              <RefreshCw size={10} /> Shuffle
            </button>
          )}
        </div>

        <div className="overflow-y-auto">
          {loading ? (
            <p className="px-5 py-8 text-center text-[10px] text-muted-foreground/50" style={{ fontFamily: MONO }}>Loading…</p>
          ) : shown.length === 0 ? (
            <p className="px-5 py-8 text-center text-[11px] text-muted-foreground/40 italic" style={{ fontFamily: SERIF }}>
              {searching ? "Nothing matches that." : "No writings in the cloud yet."}
            </p>
          ) : shown.map(row => (
            <button key={row.id} onClick={() => take(row)}
              className="w-full text-left px-5 py-2.5 border-b border-border/30 last:border-b-0 hover:bg-foreground/[0.03] transition-colors group">
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] text-foreground/70 group-hover:text-foreground transition-colors truncate"
                  style={{ fontFamily: SERIF, fontStyle: row.seed_word ? "italic" : "normal" }}>
                  {owLabel(row.seed_word, row.body) || "Object Writing"}
                </span>
                <span className="text-[9px] text-muted-foreground/40 shrink-0 ml-auto" style={{ fontFamily: MONO }}>
                  {added[row.id] ? <span className="text-accent">Added ✓</span> : formatRelativeTime(row.written_at)}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5" style={{ fontFamily: SERIF }}>
                {row.body.replace(/\s+/g, " ").trim()}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
