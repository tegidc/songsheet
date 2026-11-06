import { setUiPrefs, useUiPrefs, type Instrument } from "../../lib/prefs";
import { THEMES, darkFace, themeById } from "../../lib/theme/themes";

const INSTRUMENTS: Instrument[] = ["piano", "guitar", "ambient"];
const LABEL = { fontFamily: "var(--font-label)" } as const;

/**
 * The sidebar's Settings block, under everything else and folded with one
 * tap on its heading: theme and its dark face, Play's sound, and the view
 * toggles. Per-device preferences only — none of this is song data, so none
 * of it can save. (Play itself is switched on the Chords screen.)
 */
export function SettingsSection() {
  const prefs = useUiPrefs();
  const current = themeById(prefs.theme);
  const open = prefs.settingsOpen;

  return (
    <div className="px-4 pt-1 pb-3 border-t border-[var(--rule)] flex flex-col" style={LABEL}>
      <button onClick={() => setUiPrefs({ settingsOpen: !open })} aria-expanded={open}
        className="flex items-center justify-between min-h-11 text-left">
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Settings</span>
        <span aria-hidden className="text-[11px] text-muted-foreground transition-transform" style={{ transform: open ? "rotate(90deg)" : "none" }}>›</span>
      </button>

      {open && <div className="flex flex-col gap-1 pb-1">
        {/* Theme */}
        <div className="flex items-center justify-between gap-2 min-h-11">
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] text-foreground">Theme</span>
            <span className="text-[11px] text-muted-foreground">{current.name}</span>
          </span>
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Theme">
            {THEMES.map(t => {
              const sel = t.id === current.id;
              const face = prefs.dark ? darkFace(t.id) : t;
              return (
                <button key={t.id} role="radio" aria-checked={sel} aria-label={t.name} title={t.name}
                  onClick={() => setUiPrefs({ theme: t.id })}
                  className="w-11 h-11 flex items-center justify-center">
                  <span className="w-7 h-7 rounded-full box-border flex items-center justify-center"
                    style={{ background: face.bg, border: sel ? "2px solid var(--ink)" : "1px solid var(--rule-soft)" }}>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: face.accent }} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <Toggle label="Dark" on={prefs.dark} onClick={() => setUiPrefs({ dark: !prefs.dark })} />

        <div className="h-px bg-[var(--rule-soft)] my-1" />

        {/* Play's sound — Play itself is switched in the Chords screen's view line */}
        <div className="flex items-center justify-between gap-2 min-h-11">
          <span className="flex flex-col gap-0.5"><span className="text-[13px] text-foreground">Play sound</span></span>
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
        <div className="h-px bg-[var(--rule-soft)] my-1" />

        {/* View */}
        <Toggle label="Show chord function" on={prefs.showFunction}
          onClick={() => setUiPrefs({ showFunction: !prefs.showFunction })}
          hint={<>
            <span style={{ color: "var(--fn-home)" }}>●</span> home{" "}
            <span style={{ color: "var(--fn-lift)" }}>■</span> lift{" "}
            <span style={{ color: "var(--fn-pull)" }}>▲</span> pull{" "}
            <span className="text-foreground">◆</span> borrowed
          </>} />
        <Toggle label="Show numerals" on={prefs.showNumerals}
          onClick={() => setUiPrefs({ showNumerals: !prefs.showNumerals })}
          hint="I · vi · V/ii beside chord names" />
      </div>}
    </div>
  );
}

function Toggle({ label, hint, on, onClick }: {
  label: string; hint?: React.ReactNode; on: boolean; onClick: () => void;
}) {
  return (
    <button role="switch" aria-checked={on} onClick={onClick}
      className="flex items-center justify-between gap-3 py-1.5 text-left min-h-11">
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[13px] text-foreground">{label}</span>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      <span className="relative shrink-0 w-11 h-[26px] rounded-full transition-colors"
        style={{ background: on ? "var(--ink)" : "var(--rule-soft)" }}>
        <span className="absolute top-1 w-[18px] h-[18px] rounded-full transition-all"
          style={{ left: on ? 22 : 4, background: "var(--bg)" }} />
      </span>
    </button>
  );
}
