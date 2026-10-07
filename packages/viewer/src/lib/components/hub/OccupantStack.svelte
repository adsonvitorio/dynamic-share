<script lang="ts">
  import type { Occupant } from "@share/shared";
  import { getInitials } from "$lib/utils/text";
  import { RAILS } from "$lib/constants";
  import { occupantLeave } from "$lib/utils/motion";
  import { occupantPreview } from "./occupants";

  let {
    occupants,
    participantCount,
    max = RAILS.OCCUPANT_STACK_MAX,
    vertical = false,
  }: {
    occupants: Occupant[];
    participantCount: number;
    max?: number;
    vertical?: boolean;
  } = $props();

  const preview = $derived(occupantPreview(occupants, participantCount, max));
</script>

{#if preview.visible.length > 0}
  <ul class="flex {vertical ? 'flex-col -space-y-2' : '-space-x-2'}" aria-label="Quem está dentro">
    {#each preview.visible as occupant (occupant.id)}
      {@const ring = occupant.sharing ? "ring-live" : "ring-base"}
      <li class="animate-scale-in shrink-0" title={occupant.name} out:occupantLeave|local>
        {#if occupant.avatarUrl}
          <img
            src={occupant.avatarUrl}
            alt=""
            class="h-6 w-6 rounded-full object-cover ring-2 {ring}"
            referrerpolicy="no-referrer"
            draggable="false"
          />
        {:else}
          <span
            class="flex h-6 w-6 items-center justify-center rounded-full bg-brand/25 text-[9px] font-bold text-content ring-2 {ring}"
            aria-hidden="true"
          >
            {getInitials(occupant.name)}
          </span>
        {/if}
      </li>
    {/each}
    {#if preview.extra > 0}
      <li
        class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface/15 text-[9px] font-bold text-muted ring-2 ring-base"
        aria-label="+{preview.extra} participantes"
      >
        +{preview.extra}
      </li>
    {/if}
  </ul>
{/if}
