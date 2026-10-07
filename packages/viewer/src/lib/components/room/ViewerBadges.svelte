<script lang="ts">
  import { ROOM_UI, copy } from "$lib/constants";
  import { getInitials } from "$lib/utils/text";
  import type { StreamViewer } from "$lib/room/types";

  let {
    viewers,
    max = ROOM_UI.DEFAULT_VIEWER_BADGE_MAX,
    showCount = true,
  }: {
    viewers: StreamViewer[];
    max?: number;
    showCount?: boolean;
  } = $props();

  const visible = $derived(viewers.slice(0, max));
  const remaining = $derived(viewers.length - visible.length);
</script>

<div
  class="flex items-center gap-2 rounded-full border border-surface/15 bg-base-deep/80 px-2.5 py-1 backdrop-blur-md"
  role="status"
  aria-label={copy.viewersWatching(viewers.length)}
>
  <svg
    class="h-3.5 w-3.5 shrink-0 text-content"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    aria-hidden="true"
    ><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg
  >
  {#if visible.length > 0}
    <div class="flex -space-x-2">
      {#each visible as viewer (viewer.identity)}
        {#if viewer.avatarUrl}
          <img
            src={viewer.avatarUrl}
            alt={viewer.name}
            title={viewer.name}
            class="h-6 w-6 rounded-full object-cover ring-2 ring-base"
            referrerpolicy="no-referrer"
          />
        {:else}
          <div
            class="flex h-6 w-6 items-center justify-center rounded-full bg-surface/15 ring-2 ring-base"
            title={viewer.name}
          >
            <span class="text-[9px] font-medium text-content">{getInitials(viewer.name)}</span>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
  {#if remaining > 0}
    <span class="text-[10px] font-medium text-muted">+{remaining}</span>
  {/if}
  {#if showCount}
    <span class="text-[10px] font-semibold text-content tabular-nums">{viewers.length}</span>
  {/if}
</div>
