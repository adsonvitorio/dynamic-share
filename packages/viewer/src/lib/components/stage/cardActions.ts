export type TileSecondaryAction = "unwatch";

export function tileSecondaryAction(watching: boolean): TileSecondaryAction | null {
  return watching ? "unwatch" : null;
}
