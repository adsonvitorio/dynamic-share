export function maskedId(id: string | null | undefined): string {
  if (!id) return "<none>";
  if (id.length <= 3) return "...";
  if (id.length <= 8) return `${id.slice(0, 3)}...`;
  return `${id.slice(0, 8)}...`;
}
