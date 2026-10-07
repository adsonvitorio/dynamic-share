<script lang="ts">
  import { streamsStore, participantsStore } from "$lib/room/room.svelte";
  import { copy, ROOM_UI } from "$lib/constants";
  import { LAYOUT_CLASSES } from "$lib/utils/layoutModel";
  import VideoCard from "./VideoCard.svelte";
  import LiveBadge from "./LiveBadge.svelte";
  import EmptyState from "$lib/components/room/EmptyState.svelte";
  import Crosshair from "../icons/Crosshair.svelte";
  import MembersRail from "$lib/components/members/MembersRail.svelte";
  import PresenceToasts from "$lib/components/PresenceToasts.svelte";
  import ControlBar from "./ControlBar.svelte";
  import type { AvailableStream } from "$lib/room/types";

  let {
    roomName,
    roomLive,
    focusedStream,
    otherStreams,
  }: {
    roomName: string;
    roomLive: boolean;
    focusedStream: AvailableStream | undefined;
    otherStreams: AvailableStream[];
  } = $props();

  const count = $derived(participantsStore.participantCount);
</script>

<div class="flex h-full min-w-0">
  <div class="flex min-w-0 flex-1 flex-col">
    <header class="flex h-14 shrink-0 items-center gap-3 border-b border-surface/10 px-4">
      <h1 class="min-w-0 flex-1 truncate font-display text-sm font-semibold text-content">
        {roomName}
      </h1>
      {#if roomLive}
        <span class="shrink-0"><LiveBadge /></span>
      {/if}
      <span class="shrink-0 text-xs text-muted">{copy.viewers(count)}</span>
    </header>

    <div class="relative min-h-0 flex-1 p-4">
      {#if streamsStore.availableStreams.length === 0}
        <EmptyState
          title={copy.stageEmptyTitle}
          message={copy.stageEmptyMessage}
          icon={Crosshair}
        />
      {:else}
        <div class="mx-auto flex h-full {LAYOUT_CLASSES.stageMax} flex-col gap-3">
          {#if focusedStream}
            {@const card = streamsStore.videoCards.find(
              (c) => c.participantSid === focusedStream.participantSid,
            )}
            {#key focusedStream.participantSid}
              <div class="animate-fade-in flex min-h-0 flex-1 flex-col">
                <VideoCard stream={focusedStream} {card} isFocused />
              </div>
            {/key}
          {/if}
          {#if otherStreams.length > 0}
            <div
              class="grid min-h-0 auto-rows-[7rem] grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3 overflow-y-auto pb-1"
            >
              {#each otherStreams as stream, i (stream.participantSid)}
                {@const card = streamsStore.videoCards.find(
                  (c) => c.participantSid === stream.participantSid,
                )}
                <div
                  class="animate-fade-in-up"
                  style="animation-delay: {i * ROOM_UI.LIST_STAGGER_MS}ms"
                >
                  <VideoCard {stream} {card} isFocused={false} />
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      <PresenceToasts />
    </div>
    <ControlBar focusedSid={focusedStream?.participantSid ?? null} />
  </div>
  <MembersRail />
</div>
