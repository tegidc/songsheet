import { CH, CW, MONO } from "../../data/constants";
import { toNashville } from "../../lib/theory/chords";
import { flash, usePlay } from "../../lib/audio/PlayContext";

export function BarCell({ value, onChange, onKD, onFocus, reff, isDiatonic, warnWavy, nashville, songKey, playId }: {
  value: string; onChange: (v: string) => void;
  onKD?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus?: () => void;
  reff?: React.Ref<HTMLInputElement>; isDiatonic: boolean; warnWavy: boolean;
  nashville?: boolean; songKey?: string;
  /** Which on-screen chord this is, for Play mode's now-playing mark. */
  playId?: string;
}) {
  const playApi = usePlay();
  const displayValue = nashville && songKey && value.trim() ? toNashville(value, songKey) : value;
  return (
    <div className={`shrink-0 flex items-center justify-center ${!isDiatonic && value.trim() ? "bg-amber-50/50" : ""}`}
      style={{ width: CW, height: CH }}>
      {playApi.on ? (
        // Play mode: a button that sounds the chord and does nothing else. No
        // input is rendered, so nothing can focus, edit or take a shortcut.
        value.trim() ? (
          <button type="button" onClick={e => { flash(e.currentTarget); playApi.play(value, playId); }}
            className={["w-full h-full text-center text-[12px] select-none",
              !isDiatonic ? "text-amber-700" : "text-foreground"].join(" ")}
            style={{ fontFamily: MONO }} title={`Play ${value}`}>{displayValue}</button>
        ) : <span aria-hidden className="text-muted-foreground/20 text-[12px]" style={{ fontFamily: MONO }}>—</span>
      ) : nashville && value.trim() ? (
        <span className={["text-center text-[12px] select-none",
          !isDiatonic && value.trim() ? "text-amber-700" : "text-foreground/70",
          warnWavy && value.trim() ? "underline decoration-red-400 decoration-wavy" : ""].join(" ")}
          style={{ fontFamily: MONO }}>{displayValue}</span>
      ) : (
        <input ref={reff} value={value} onChange={e => { const v = e.target.value; onChange(v ? v[0].toUpperCase() + v.slice(1) : v); }} onKeyDown={onKD} onFocus={onFocus}
          maxLength={8} placeholder="—"
          className={["w-full h-full bg-transparent text-center text-[12px] focus:outline-none caret-accent placeholder:text-muted-foreground/20",
            !isDiatonic && value.trim() ? "text-amber-700" : "text-foreground",
            warnWavy && value.trim() ? "underline decoration-red-400 decoration-wavy" : ""].join(" ")}
          style={{ fontFamily: MONO }} />
      )}
    </div>
  );
}
