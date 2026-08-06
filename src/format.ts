export const uid = () => Math.random().toString(36).slice(2, 9);
export function formatRelativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
const PROJECT_PREFIX_RE = /^(\d{6})(?:\s*·\s*(.*))?$/;

// The YYMMDD prefix records when a song was started and must never change
// after that first save. Only call this when creating a brand-new project.
export function newProjectPrefix(): string {
  const now = new Date();
  return `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

// Extracts the YYMMDD prefix from a stored project name, if it has one.
export function parseProjectPrefix(name: string): string | null {
  const m = name.match(PROJECT_PREFIX_RE);
  return m ? m[1] : null;
}

// Rebuilds a project name from an existing prefix (preserved) and the current title.
export function projectNameWithPrefix(prefix: string, title: string): string {
  return title.trim() ? `${prefix} · ${title.trim()}` : prefix;
}
