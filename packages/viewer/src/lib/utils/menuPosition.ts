export type MenuDirection = "up" | "down";

export function menuAnchorClass(direction: MenuDirection): string {
  return direction === "up" ? "bottom-full pb-3" : "top-full pt-3";
}
