import type { Occupant } from "@share/shared";

export interface OccupantPreview {
  visible: Occupant[];
  extra: number;
}

export function occupantPreview(
  occupants: Occupant[],
  participantCount: number,
  max: number,
): OccupantPreview {
  // Sharers primeiro — quem transmite lidera o stack visual.
  const sorted = [...occupants].sort((a, b) => Number(b.sharing === true) - Number(a.sharing === true));
  const visible = sorted.slice(0, Math.max(0, max));
  return { visible, extra: Math.max(0, participantCount - visible.length) };
}
