import { setUiPrefs, useUiPrefs, type Instrument } from "../../lib/prefs";
import { THEMES, themeById } from "../../lib/theme/themes";

const INSTRUMENTS: Instrument[] = ["piano", "guitar", "ambient"];
const LABEL = { fontFamily: "var(--font-label)" } as const;

/**
 * The sidebar's Settings block, under everything else and kept quiet: theme,
 * the Play instrument, and the chord-function markers. Per-device preferences
 * only — none of this is song data, so none of it can save.
 */
export function SettingsSection() {
  const prefs = useUiPrefs();
  const current = themeById(prefs.theme);
  return (
    <div className="px-4 pt-3 pb-4 border-t border-[var(--rule)] flex flex-col gap-2" style={LABEL}>
      <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Settings</span>

      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-foreground">Theme</span>
        <span className="text-[13px] text-foreground font-bold">{current.name}</span>
      </div>
      <div className="grid grid-cols-7 gap-1" role="radiogroup" aria-label="Theme">
        {THEMES.map(t => {
          const on = t.id === current.id;
          return (
            <button key={t.id} role="radio" aria-checked={on} aria-label={t.name} title={t.name}
              onClick={() => setUiPrefs({ theme: t.id })}
              className="h-11 flex items-center justify-center">
              <span className="w-7 h-7 rounded-full box-border flex items-center justify-center"
                style={{ background: t.bg, border: on ? "2px solid var(--ink)" : "1px solid var(--rule-soft)" }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.accent }} />
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 min-h-11">
        <span className="text-[13px] text-foreground">Play sound</span>
        <div className="flex items-center gap-3" role="radiogroup" aria-label="Play instrument">
          {INSTRUMENTS.map(i => (
            <button key={i} role="radio" aria-checked={prefs.instrument === i}
              onClick={() => setUiPrefs({ instrument: i })}
              className={`text-[13px] py-2 transition-colors ${prefs.instrument === i ? "text-foreground font-bold" : "text-muted-foreground hover:text-foreground"}`}>
              {i}
            </button>
          ))}
        </div>
      </div>

      <button role="switch" aria-checked={prefs.showFunction}
        onClick={() => setUiPrefs({ showFunction: !prefs.showFunction })}
        className="flex items-center justify-between gap-3 py-1.5 text-left min-h-11">
        <span className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[13px] text-foreground">Show chord function</span>
          <span className="text-[11px] text-muted-foreground">
            <span style={{ color: "var(--fn-home)" }}>●</span> home{" "}
            <span style={{ color: "var(--fn-lift)" }}>■</span> lift{" "}
            <span style={{ color: "var(--fn-pull)" }}>▲</span> pull{" "}
            <span className="text-foreground">◆</span> borrowed
          </span>
        </span>
        <span className="relative shrink-0 w-11 h-[26px] rounded-full transition-colors"
          style={{ background: prefs.showFunction ? "var(--ink)" : "var(--rule-soft)" }}>
          <span className="absolute top-1 w-[18px] h-[18px] rounded-full transition-all"
            style={{ left: prefs.showFunction ? 22 : 4, background: "var(--bg)" }} />
        </span>
      </button>
    </div>
  );
}
