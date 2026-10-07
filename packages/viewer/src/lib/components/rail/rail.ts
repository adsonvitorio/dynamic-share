import type { RoomPresence } from "@share/shared";

export function roomButtonLabel(room: RoomPresence, liveBadge: string): string {
  return room.live
    ? `${room.displayName} — ${liveBadge} (${room.participantCount})`
    : room.displayName;
}

export function roomListClass(): string {
  return "flex w-full flex-col items-center gap-2";
}

export function roomItemClass(): string {
  return "group relative flex w-full items-center justify-center";
}

export function roomIconClass(active: boolean): string {
  return `relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl transition-colors duration-theme ease-theme ${
    active
      ? "bg-brand/25 text-content"
      : "bg-surface/8 text-muted hover:bg-brand/25 hover:text-content"
  }`;
}

export function userMenuPositionClass(): string {
  return "fixed bottom-4 left-[80px] z-50 w-44";
}
