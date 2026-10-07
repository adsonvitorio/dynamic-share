import { scale, type ScaleParams, type TransitionConfig } from "svelte/transition";

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function occupantLeave(node: Element, params?: ScaleParams): TransitionConfig {
  if (prefersReducedMotion()) return { duration: 0 };
  return scale(node, { duration: 160, start: 0.5, ...params });
}
