<script lang="ts">
  import { page } from "$app/state";
  import { roomsStore } from "$lib/room/rooms.svelte";
  import { BRAND, ROUTES, copy } from "$lib/constants";
  import RoomButton from "./RoomButton.svelte";
  import UserChip from "./UserChip.svelte";
  import { roomListClass } from "./rail";

  const activePath = $derived(page.url.pathname);
</script>

<nav
  class="flex h-full w-[68px] shrink-0 flex-col items-center gap-2 overflow-y-auto overflow-x-hidden border-r border-surface/10 bg-base-deep/70 py-3 backdrop-blur-xl"
  aria-label={copy.navLabel}
>
  <a
    href={ROUTES.ROOMS}
    class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface/8 transition hover:bg-surface/15"
    aria-label="Início — {BRAND.NAME}"
    title={BRAND.NAME}
  >
    <img
      src={BRAND.LOGO_URL}
      alt=""
      class="h-8 w-8 object-contain"
      referrerpolicy="no-referrer"
      draggable="false"
    />
  </a>

  <span class="h-px w-8 shrink-0 bg-surface/10" aria-hidden="true"></span>

  <ul class={roomListClass()} aria-label={copy.roomsTitle}>
    {#each roomsStore.rooms as room (room.name)}
      <RoomButton
        {room}
        active={activePath === `/${room.name}`}
        liveBadge={copy.liveBadge}
      />
    {/each}
  </ul>

  <div class="mt-auto pt-2">
    <UserChip connectedAs={copy.connectedAs} logoutLabel={copy.logout} />
  </div>
</nav>
