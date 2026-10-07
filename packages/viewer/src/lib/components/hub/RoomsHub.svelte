<script lang="ts">
  import { auth } from "$lib/auth/auth.svelte";
  import { connectionStore } from "$lib/room/room.svelte";
  import { roomsStore } from "$lib/room/rooms.svelte";
  import { copy, ROOM_UI } from "$lib/constants";
  import { rovingList } from "$lib/utils/rovingTabindex";
  import { getInitials } from "$lib/utils/text";
  import RoomEntry from "./RoomEntry.svelte";
  import EmptyState from "../room/EmptyState.svelte";
  import Crosshair from "../icons/Crosshair.svelte";

  const liveCount = $derived(roomsStore.rooms.filter((r) => r.live).length);
  const user = $derived(auth.user);
</script>

<div class="mx-auto flex h-full w-full max-w-5xl flex-col overflow-y-auto px-6 py-8">
  <header class="mb-6 flex shrink-0 items-start justify-between gap-4">
    <div class="min-w-0">
      <h1 class="font-display text-2xl font-bold tracking-tight text-content">
        {copy.welcomeTitle}
      </h1>
      <p class="mt-1 text-sm text-muted">{copy.welcomeHint}</p>
      {#if liveCount > 0}
        <p
          class="animate-scale-in mt-4 inline-flex items-center gap-2 rounded-full border border-live/25 bg-live/10 px-4 py-1.5 text-xs font-semibold text-live"
        >
          <span class="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-live"></span>
          {copy.liveNow(liveCount)}
        </p>
      {/if}
    </div>
    {#if user}
      <div class="flex shrink-0 items-center gap-3">
        <div class="text-right">
          <div class="text-xs text-muted">{copy.connectedAs}</div>
          <div class="max-w-40 truncate text-sm font-semibold text-content">{user.name}</div>
        </div>
        {#if user.avatarUrl}
          <img
            src={user.avatarUrl}
            alt=""
            class="h-10 w-10 rounded-full object-cover"
            referrerpolicy="no-referrer"
            draggable="false"
          />
        {:else}
          <div
            class="flex h-10 w-10 items-center justify-center rounded-full bg-brand/25 text-sm font-bold text-content"
            aria-hidden="true"
          >
            {getInitials(user.name)}
          </div>
        {/if}
        <button
          type="button"
          onclick={() => void connectionStore.logout()}
          class="rounded-lg border border-surface/15 bg-surface/10 px-3 py-2 text-xs font-semibold text-content transition hover:border-live/50 hover:bg-live/15 hover:text-live"
        >
          {copy.logout}
        </button>
      </div>
    {/if}
  </header>

  {#if roomsStore.loading && roomsStore.rooms.length === 0}
    <div class="grid gap-3 sm:grid-cols-2">
      {#each Array(6) as _, i (i)}
        <div class="skeleton h-16 rounded-2xl"></div>
      {/each}
    </div>
  {:else if roomsStore.error && roomsStore.rooms.length === 0}
    <div class="flex flex-1 flex-col items-center justify-center text-center">
      <p class="text-sm text-muted">{copy.hubError}</p>
      <button
        type="button"
        class="mt-4 rounded-lg bg-surface/10 px-4 py-2 text-sm font-semibold text-content transition hover:bg-surface/15"
        onclick={() => void roomsStore.load()}
      >
        {copy.retry}
      </button>
    </div>
  {:else if roomsStore.rooms.length === 0}
    <div class="flex-1">
      <EmptyState
        title={copy.emptyRooms}
        message={copy.hubEmpty}
        icon={Crosshair}
      />
    </div>
  {:else}
    <ul class="grid content-start gap-3 sm:grid-cols-2" use:rovingList>
      {#each roomsStore.rooms as room, i (room.name)}
        <RoomEntry
          {room}
          active={false}
          liveBadge={copy.liveBadge}
          joinHint={copy.joinHint}
          delay={i * ROOM_UI.LIST_STAGGER_MS}
        />
      {/each}
    </ul>
  {/if}
</div>
