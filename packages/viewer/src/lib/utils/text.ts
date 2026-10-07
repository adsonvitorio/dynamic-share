export function sanitizeDisplayName(name: string): string {
  return name.replace(/[<>"'&\x00-\x1f\x7f]/g, "").trim();
}

export function getInitials(name: string): string {
  const clean = sanitizeDisplayName(name);
  if (!clean) return "?";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return [...parts[0]].slice(0, 2).join("").toUpperCase();
  return ([...parts[0]][0] + [...parts[parts.length - 1]][0]).toUpperCase();
}
