export const uid = () => Math.random().toString(36).slice(2, 9);
export function formatRelativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
const PROJECT_PREFIX_RE = /^(\d{6})(?:\s*·\s*(.*))?$/;

// The YYMMDD prefix records when a song was started. `projects.created_at` is
// the real record of that, so the prefix is derived from it rather than read
// back out of the name the prefix was last written into.
export function prefixFromDate(when: string | Date): string {
  const d = when instanceof Date ? when : new Date(when);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

// Only call this when creating a brand-new project — its created_at is now().
export function newProjectPrefix(): string {
  return prefixFromDate(new Date());
}

// Fallback only, for a row whose created_at is missing or unparseable:
// extracts the YYMMDD prefix from a stored project name, if it has one.
export function parseProjectPrefix(name: string): string | null {
  const m = name.match(PROJECT_PREFIX_RE);
  return m ? m[1] : null;
}

// Rebuilds a project name from an existing prefix (preserved) and the current title.
export function projectNameWithPrefix(prefix: string, title: string): string {
  return title.trim() ? `${prefix} · ${title.trim()}` : prefix;
}
