<script lang="ts">
  import type { Occupant } from "@share/shared";
  import { copy } from "$lib/constants";
  import { getInitials } from "$lib/utils/text";
  import OccupantStack from "./OccupantStack.svelte";

  let {
    occupants,
    participantCount,
    joinHint = "",
  }: {
    occupants: Occupant[];
    participantCount: number;
    joinHint?: string;
  } = $props();

  const sharer = $derived(occupants.find((o) => o.sharing));
  const rest = $derived(occupants.filter((o) => o !== sharer));
</script>

{#if occupants.length > 0}
  <div class="mt-2.5 flex items-center justify-between gap-2 border-t border-surface/10 pt-2.5">
    {#if sharer}
      <div class="flex min-w-0 items-center gap-2.5">
        {#if sharer.avatarUrl}
          <img
            src={sharer.avatarUrl}
            alt=""
            class="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-live"
            referrerpolicy="no-referrer"
            draggable="false"
          />
        {:else}
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-live/15 text-[11px] font-bold text-live ring-2 ring-live"
            aria-hidden="true"
          >
            {getInitials(sharer.name)}
          </span>
        {/if}
        <div class="min-w-0">
          <p class="truncate text-xs font-semibold text-content">{sharer.name}</p>
          <p class="flex items-center gap-1 text-[10px] font-bold text-live">
            <span class="animate-pulse-dot h-1 w-1 rounded-full bg-live"></span>
            {copy.sharingNow}
          </p>
        </div>
      </div>
      {#if participantCount > 1}
        <span class="flex shrink-0 items-center gap-2">
          {#if rest.length > 0}
            <OccupantStack occupants={rest} participantCount={participantCount - 1} />
          {/if}
          <span class="text-[10px] font-medium text-muted">
            {copy.inRoomNow(participantCount - 1)}
          </span>
        </span>
      {/if}
      <span class="shrink-0 text-[10px] font-semibold text-brand opacity-0 transition group-hover:opacity-100">
        {joinHint} →
      </span>
    {:else}
      <OccupantStack {occupants} {participantCount} />
      <span class="flex shrink-0 items-center gap-2">
        <span class="text-[10px] font-medium text-muted">
          {copy.inRoomNow(participantCount)}
        </span>
        <span class="text-[10px] font-semibold text-brand opacity-0 transition group-hover:opacity-100">
          {joinHint} →
        </span>
      </span>
    {/if}
  </div>
{/if}
