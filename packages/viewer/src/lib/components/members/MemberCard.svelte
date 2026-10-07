<script lang="ts">
  import { getInitials } from "$lib/utils/text";
  import type { RoomParticipant } from "$lib/room/types";

  let {
    participant,
    youLabel,
    delay = 0,
  }: {
    participant: RoomParticipant;
    youLabel: string;
    delay?: number;
  } = $props();
</script>

<li
  data-roving-item
  class="animate-scale-in relative overflow-hidden rounded-xl border border-neon/25 bg-gradient-to-b from-neon/10 to-neon/5 px-2.5 pt-3 pb-2 text-center shadow-card"
  style="animation-delay: {delay}ms"
>
  <p class="text-[9px] font-black tracking-[0.25em] text-neon/90">ONLINE</p>
  <div class="mx-auto mt-1.5 h-10 w-10">
    {#if participant.avatarUrl}
      <img
        src={participant.avatarUrl}
        alt=""
        class="h-10 w-10 rounded-lg border border-neon/40 object-cover"
        referrerpolicy="no-referrer"
        draggable="false"
      />
    {:else}
      <span
        class="flex h-10 w-10 items-center justify-center rounded-lg border border-neon/40 bg-surface/15 text-xs font-bold text-content"
      >
        {getInitials(participant.name)}
      </span>
    {/if}
  </div>
  <p class="mt-1.5 truncate text-[11px] font-semibold text-content">{participant.name}</p>
  {#if participant.isLocal}
    <span
      class="mt-0.5 inline-block rounded-full bg-brand/25 px-2 py-0.5 text-[9px] font-semibold text-brand"
      >{youLabel}</span
    >
  {/if}
</li>
