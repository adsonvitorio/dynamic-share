export function nextRovingIndex(
  current: number,
  key: string,
  count: number,
): number | null {
  if (count === 0) return null;
  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return Math.min(current + 1, count - 1);
    case "ArrowUp":
    case "ArrowLeft":
      return Math.max(current - 1, 0);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

const ITEM_SELECTOR = "[data-roving-item]";

export function rovingList(node: HTMLElement) {
  let active = 0;
  const items = () => [...node.querySelectorAll<HTMLElement>(ITEM_SELECTOR)];

  const sync = (activeIndex: number) => {
    active = activeIndex;
    items().forEach((el, i) => el.setAttribute("tabindex", i === activeIndex ? "0" : "-1"));
  };

  const ensure = () => {
    const els = items();
    if (els.length === 0) return;
    const missing = els.some((el) => !el.hasAttribute("tabindex"));
    const hasActive = els.some((el) => el.getAttribute("tabindex") === "0");
    if (missing || !hasActive) sync(Math.min(active, els.length - 1));
  };

  const onKeydown = (e: KeyboardEvent) => {
    const els = items();
    const current = els.indexOf(document.activeElement as HTMLElement);
    const next = nextRovingIndex(current < 0 ? active : current, e.key, els.length);
    if (next === null || next === current) return;
    e.preventDefault();
    sync(next);
    els[next]?.focus();
  };

  const onFocusIn = (e: FocusEvent) => {
    const index = items().indexOf(e.target as HTMLElement);
    if (index >= 0) sync(index);
  };

  const observer = new MutationObserver(ensure);
  observer.observe(node, { childList: true, subtree: true });

  sync(0);
  node.addEventListener("keydown", onKeydown);
  node.addEventListener("focusin", onFocusIn);
  return {
    destroy() {
      observer.disconnect();
      node.removeEventListener("keydown", onKeydown);
      node.removeEventListener("focusin", onFocusIn);
    },
  };
}
