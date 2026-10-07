import { ROOM_UI } from "$lib/constants";

export function parseAvatarUrl(metadata: string | undefined): string | null {
  if (!metadata) return null;
  try {
    const data: unknown = JSON.parse(metadata);
    if (typeof data !== "object" || data === null) return null;
    const avatarUrl = (data as Record<string, unknown>).avatarUrl;
    return typeof avatarUrl === "string" && avatarUrl.startsWith(`${ROOM_UI.DISCORD_CDN_BASE}/`)
      ? avatarUrl
      : null;
  } catch {
    return null;
  }
}
