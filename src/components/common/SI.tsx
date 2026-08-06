import { ChevronDown } from "lucide-react";
import { MONO } from "../../data/constants";
import { FL } from "./FL";

export function SI({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div><FL>{label}</FL>
      <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)}
          className="appearance-none bg-transparent border-b border-border text-xs text-foreground focus:outline-none focus:border-accent pb-0.5 pr-4 cursor-pointer transition-colors"
          style={{ fontFamily: MONO }}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown size={10} className="absolute right-0 top-1 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );
}
