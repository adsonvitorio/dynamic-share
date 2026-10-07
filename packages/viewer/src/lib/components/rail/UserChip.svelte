<script lang="ts">
  import { auth } from "$lib/auth/auth.svelte";
  import { connectionStore } from "$lib/room/room.svelte";
  import { getInitials } from "$lib/utils/text";
  import { portal } from "$lib/utils/portal";
  import { userMenuPositionClass } from "./rail";

  let { connectedAs, logoutLabel }: { connectedAs: string; logoutLabel: string } = $props();

  const user = $derived(auth.user);
  let open = $state(false);
  let root = $state<HTMLDivElement>();
  let menu = $state<HTMLDivElement>();
  let trigger = $state<HTMLButtonElement>();

  function containsFocus(target: Node | null): boolean {
    return !!target && !!(root?.contains(target) || menu?.contains(target));
  }

  function onFocusOut(e: FocusEvent) {
    if (!containsFocus(e.relatedTarget as Node | null)) open = false;
  }

  function onMenuKeydown(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    open = false;
    trigger?.focus();
  }
</script>

<div class="relative flex justify-center" bind:this={root} onfocusout={onFocusOut}>
  <button
    bind:this={trigger}
    type="button"
    onclick={() => (open = !open)}
    class="h-11 w-11 overflow-hidden rounded-full ring-2 ring-transparent transition hover:ring-brand/50 focus-visible:ring-brand"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={user?.name ? `Conta de ${user.name}` : "Conta"}
    title={user?.name ?? "Conta"}
  >
    {#if user?.avatarUrl}
      <img
        src={user.avatarUrl}
        alt=""
        class="h-full w-full object-cover"
        referrerpolicy="no-referrer"
        draggable="false"
      />
    {:else}
      <span class="flex h-full w-full items-center justify-center bg-brand text-sm font-bold text-white">
        {getInitials(user?.name ?? "?")}
      </span>
    {/if}
  </button>
</div>

{#if open}
  <div
    use:portal
    bind:this={menu}
    role="menu"
    aria-label="Conta"
    tabindex="-1"
    onfocusout={onFocusOut}
    onkeydown={onMenuKeydown}
    class="{userMenuPositionClass()} rounded-xl border border-surface/15 bg-base-deep p-3 shadow-card"
  >
    <p class="truncate text-sm font-semibold text-content">{user?.name ?? ""}</p>
    <p class="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
      <span class="h-1.5 w-1.5 rounded-full bg-accent"></span>{connectedAs}
    </p>
    <button
      type="button"
      role="menuitem"
      onclick={() => void connectionStore.logout()}
      class="mt-3 w-full rounded-lg bg-live/15 px-3 py-1.5 text-left text-xs font-semibold text-live transition hover:bg-live/25"
    >
      {logoutLabel}
    </button>
  </div>
{/if}
