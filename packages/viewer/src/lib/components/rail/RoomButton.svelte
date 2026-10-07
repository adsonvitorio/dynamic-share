<script lang="ts">
  import type { RoomPresence } from "@share/shared";
  import { getInitials } from "$lib/utils/text";
  import { isIconUrl, resolveRoomIcon } from "../icons/roomIcons";
  import { roomButtonLabel, roomIconClass, roomItemClass } from "./rail";

  let {
    room,
    active,
    liveBadge,
  }: {
    room: RoomPresence;
    active: boolean;
    liveBadge: string;
  } = $props();

  const KeyedIcon = $derived(resolveRoomIcon(room.icon));
</script>

<li class={roomItemClass()}>
  <span
    class="absolute left-0 w-1 rounded-r-full bg-content transition-all duration-theme ease-theme {active
      ? 'h-9'
      : room.live
        ? 'h-2.5 group-hover:h-5'
        : 'h-0 group-hover:h-5'}"
    aria-hidden="true"
  ></span>
  <a
    href="/{room.name}"
    aria-current={active ? "page" : undefined}
    aria-label={roomButtonLabel(room, liveBadge)}
    title={room.displayName}
    class={roomIconClass(active)}
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
      <span class="font-display text-sm font-bold">{getInitials(room.displayName)}</span>
    {/if}
  </a>
  {#if room.live}
    <span
      class="absolute right-0.5 bottom-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-base bg-live"
      aria-hidden="true"
    ></span>
  {/if}
</li>
