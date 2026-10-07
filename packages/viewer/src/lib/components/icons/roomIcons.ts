import type { Component } from "svelte";
import Bolt from "./Bolt.svelte";
import Crosshair from "./Crosshair.svelte";
import Skull from "./Skull.svelte";
import Trophy from "./Trophy.svelte";
import Gamepad from "./Gamepad.svelte";

// `icon: "<scheme><key>"` na config da sala resolve para um SVG temático —
// URLs continuam passando como <img>. Chave desconhecida cai no fallback
// de iniciais.
export const ROOM_ICON_SCHEME = "icon:";

const REGISTRY = new Map<string, Component>([
  ["bolt", Bolt],
  ["crosshair", Crosshair],
  ["skull", Skull],
  ["trophy", Trophy],
  ["gamepad", Gamepad],
]);

export function resolveRoomIcon(icon: string | undefined): Component | undefined {
  if (!icon?.startsWith(ROOM_ICON_SCHEME)) return undefined;
  return REGISTRY.get(icon.slice(ROOM_ICON_SCHEME.length));
}

// Só URLs reais viram <img> — valores `icon:` que não resolveram no
// registry caem nas iniciais, nunca num src quebrado.
export function isIconUrl(icon: string | undefined): icon is string {
  return icon !== undefined && !icon.startsWith(ROOM_ICON_SCHEME);
}
