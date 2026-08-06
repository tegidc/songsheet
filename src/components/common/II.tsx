import { MONO, SANS } from "../../data/constants";
import { FL } from "./FL";

export function II({ label, value, onChange, placeholder, mono = false, style }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; mono?: boolean; style?: React.CSSProperties;
}) {
  return (
    <div style={style}><FL>{label}</FL>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="bg-transparent border-b border-border text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-accent pb-0.5 w-full transition-colors"
        style={{ fontFamily: mono ? MONO : SANS }} />
    </div>
  );
}
