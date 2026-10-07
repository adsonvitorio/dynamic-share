const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
}

export function nextFocusIndex(current: number, key: string, count: number): number {
  if (count === 0) return -1;
  if (key === "Tab") return (current + 1) % count;
  if (key === "ShiftTab") return (current - 1 + count) % count;
  return current;
}

function focusableChildren(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

export function trapFocus(container: HTMLElement): () => void {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const items = () => focusableChildren(container);

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const els = items();
    if (els.length === 0) {
      e.preventDefault();
      return;
    }
    const current = els.indexOf(document.activeElement as HTMLElement);
    const next = nextFocusIndex(current, e.shiftKey ? "ShiftTab" : "Tab", els.length);
    e.preventDefault();
    els[next]?.focus();
  };

  container.addEventListener("keydown", onKeydown);
  queueMicrotask(() => items()[0]?.focus());

  return () => {
    container.removeEventListener("keydown", onKeydown);
    previous?.focus();
  };
}

export function focusTrap(node: HTMLElement, active: boolean) {
  let release: (() => void) | undefined;
  const apply = (enabled: boolean) => {
    if (enabled && !release) release = trapFocus(node);
    if (!enabled && release) {
      release();
      release = undefined;
    }
  };
  apply(active);
  return {
    update: apply,
    destroy: () => release?.(),
  };
}
