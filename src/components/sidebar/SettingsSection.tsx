import { MONO } from "../../data/constants";
import { setUiPrefs, useUiPrefs, type Instrument } from "../../lib/prefs";

const INSTRUMENTS: Instrument[] = ["piano", "guitar", "ambient"];

/**
 * The sidebar's Settings block. Per-device preferences only — nothing here is
 * song data, so nothing here can save.
 */
export function SettingsSection() {
  const prefs = useUiPrefs();
  return (
    <div className="px-3 py-3 border-t border-border/30 flex flex-col gap-2">
      <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>Settings</span>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-foreground/80" style={{ fontFamily: MONO }}>Play sound</span>
        <div className="flex items-center gap-2" role="radiogroup" aria-label="Play instrument">
          {INSTRUMENTS.map(i => (
            <button key={i} role="radio" aria-checked={prefs.instrument === i}
              onClick={() => setUiPrefs({ instrument: i })}
              className={`text-[11px] py-1.5 transition-colors ${prefs.instrument === i ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}`}
              style={{ fontFamily: MONO }}>{i}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
