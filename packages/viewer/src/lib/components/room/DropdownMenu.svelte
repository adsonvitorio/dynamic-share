<script lang="ts">
  import { menuAnchorClass, type MenuDirection } from "$lib/utils/menuPosition";

  let {
    label,
    title,
    items,
    onSelect,
    direction = "up",
  }: {
    label: string;
    title: string;
    items: { key: string; label: string; selected: boolean }[];
    onSelect: (key: string) => void;
    direction?: MenuDirection;
  } = $props();

  let open = $state(false);
  let suppressOpen = false;
  let trigger = $state<HTMLButtonElement>();
  let menu = $state<HTMLDivElement>();

  function menuItems(): HTMLElement[] {
    if (!menu) return [];
    return [...menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
  }

  // suppressOpen impede que o focusin do próprio trigger reabra o menu —
  // é o que permite ao Escape fechar de verdade mantendo o foco no trigger.
  function close() {
    suppressOpen = true;
    open = false;
    trigger?.focus();
  }

  function onTriggerKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      suppressOpen = false;
      open = true;
      menuItems()[0]?.focus();
    }
  }

  function onMenuKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = menuItems();
    if (items.length === 0) return;
    const cur = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "ArrowDown"
        ? (cur + 1) % items.length
        : (cur - 1 + items.length) % items.length;
    items[next]?.focus();
  }
</script>

<div
  class="group relative"
  role="group"
  onmouseenter={() => (open = true)}
  onmouseleave={() => (open = false)}
  onfocusin={() => {
    if (!suppressOpen) open = true;
  }}
  onfocusout={(e) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      open = false;
      suppressOpen = false;
    }
  }}
>
  <button
    bind:this={trigger}
    type="button"
    onclick={(e) => {
      e.stopPropagation();
      suppressOpen = false;
      open = true;
      menuItems()[0]?.focus();
    }}
    onkeydown={onTriggerKeydown}
    class="rounded-lg border border-surface/15 bg-base-deep/80 px-2 py-2 text-xs font-medium text-content backdrop-blur-md transition hover:bg-surface/15"
    {title}
    aria-label={title}
    aria-haspopup="menu"
    aria-expanded={open}
  >
    {label}
  </button>
  <div
    class="absolute right-0 transition-opacity {menuAnchorClass(direction)} {open
      ? 'pointer-events-auto opacity-100'
      : 'pointer-events-none opacity-0'}"
  >
    <div
      bind:this={menu}
      role="menu"
      aria-label={title}
      tabindex="-1"
      onkeydown={onMenuKeydown}
      class="w-32 rounded-xl border border-surface/15 bg-base-deep p-1.5 shadow-card"
    >
      {#each items as item (item.key)}
        <button
          type="button"
          role="menuitemradio"
          aria-checked={item.selected}
          tabindex={open ? 0 : -1}
          onclick={(e) => {
            e.stopPropagation();
            onSelect(item.key);
            close();
          }}
          class="w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition {item.selected
            ? 'bg-brand/20 text-brand'
            : 'text-content hover:bg-surface/10'}"
        >
          {item.label}
        </button>
      {/each}
    </div>
  </div>
</div>
