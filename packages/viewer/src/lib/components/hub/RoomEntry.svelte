<script lang="ts">
  import { getInitials } from "$lib/utils/text";
  import { isIconUrl, resolveRoomIcon } from "../icons/roomIcons";
  import OccupantSection from "./OccupantSection.svelte";
  import type { RoomPresence } from "@share/shared";

  export interface RoomEntryProps {
    room: RoomPresence;
    active: boolean;
    liveBadge: string;
    joinHint?: string;
    delay?: number;
  }

  let {
    room,
    active,
    liveBadge,
    joinHint = "",
    delay = 0,
  }: RoomEntryProps = $props();

  const KeyedIcon = $derived(resolveRoomIcon(room.icon));
</script>

<li class="animate-scale-in" style="animation-delay: {delay}ms">
  <a
    href="/{room.name}"
    data-roving-item
    aria-current={active ? "page" : undefined}
    class="group block rounded-2xl border p-3 transition-all duration-theme ease-theme {active
      ? 'border-brand/60 bg-brand/10 shadow-glow'
      : room.live
        ? 'border-live/30 bg-surface/6 hover:-translate-y-0.5 hover:border-live/50 hover:shadow-glow'
        : 'border-surface/10 bg-surface/5 hover:border-surface/20 hover:bg-surface/8'}"
  >
    <div class="flex items-center gap-3">
      <span
        class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl font-display text-sm font-bold transition {active || room.live
          ? 'bg-brand/25 text-brand'
          : 'bg-surface/10 text-muted group-hover:text-content'}"
      >
        {#if KeyedIcon}
          <KeyedIcon class="h-5 w-5" />
        {:else if isIconUrl(room.icon)}
          <img
            src={room.icon}
            alt=""
            class="h-full w-full object-cover"
            referrerpolicy="no-referrer"
            draggable="false"
          />
        {:else}
          {getInitials(room.displayName)}
        {/if}
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate font-display text-sm font-semibold text-content">{room.displayName}</p>
        {#if room.live}
          <p class="flex items-center gap-1 text-[10px] font-bold tracking-wider text-live" aria-live="polite">
            <span class="animate-pulse-dot h-1 w-1 rounded-full bg-live"></span>
            {liveBadge} · {room.participantCount}
          </p>
        {:else}
          <p class="truncate text-[11px] text-muted">{room.description ?? ""}</p>
        {/if}
      </div>
      <svg
        class="h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-brand"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        aria-hidden="true"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
    <OccupantSection occupants={room.occupants} participantCount={room.participantCount} {joinHint} />
  </a>
</li>
