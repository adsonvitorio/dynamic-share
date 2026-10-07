<script lang="ts">
  import { sharingStore, streamsStore } from "$lib/room/room.svelte";
  import { copy } from "$lib/constants";
  import { toggleFullscreen, togglePiP } from "$lib/utils/dom";
  import QualityDropdown from "$lib/components/room/QualityDropdown.svelte";
  import FpsDropdown from "$lib/components/room/FpsDropdown.svelte";
  import AudioControls from "$lib/components/room/AudioControls.svelte";
  import {
    controlBarModel,
    leaveRoom,
    switchScreen,
    toggleShare,
    unwatchStream,
  } from "./controlbar";

  let {
    focusedSid,
  }: {
    focusedSid: string | null;
  } = $props();

  const focused = $derived(
    streamsStore.availableStreams.find((s) => s.participantSid === focusedSid),
  );
  const focusedWatched = $derived(
    focused
      ? focused.isLocal || streamsStore.subscribedSids.has(focused.participantSid)
      : false,
  );
  const hasAudio = $derived(
    focusedSid ? (streamsStore.hasAudioTrack[focusedSid] ?? false) : false,
  );
  const model = $derived(
    controlBarModel({
      isSharing: sharingStore.isSharing,
      focused,
      focusedWatched,
      hasAudio,
    }),
  );
</script>

<div class="animate-fade-in-up flex shrink-0 justify-center px-4 pb-4">
  <div
    class="flex items-center gap-1.5 rounded-2xl border border-surface/15 bg-base-deep/85 px-2.5 py-2 shadow-card backdrop-blur-xl"
    role="toolbar"
    aria-label="Controles da sala"
  >
    {#if sharingStore.isSharing}
      <button
        type="button"
        onclick={() => void toggleShare()}
        class="flex items-center gap-2 rounded-xl bg-live px-3.5 py-2 text-xs font-semibold text-white transition hover:brightness-110"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="6" y="6" width="12" height="12" rx="1" />
        </svg>
        {copy.stopShare}
      </button>
    {:else}
      <button
        type="button"
        onclick={() => void toggleShare()}
        disabled={sharingStore.starting}
        aria-busy={sharingStore.starting}
        class="flex items-center gap-2 rounded-xl bg-brand px-3.5 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
        {sharingStore.starting ? copy.shareStarting : copy.shareScreen}
      </button>
    {/if}
    {#if model.showSwitchScreen}
      <button
        type="button"
        onclick={() => void switchScreen()}
        disabled={sharingStore.switching}
        class="flex items-center gap-2 rounded-xl border border-surface/15 bg-surface/10 px-3 py-2 text-xs font-semibold text-content transition hover:bg-surface/15 disabled:opacity-50"
        title="Trocar tela"
        aria-label="Trocar tela compartilhada"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      </button>
    {/if}
    {#if model.showUnwatch && focusedSid}
      <button
        type="button"
        onclick={() => void unwatchStream(focusedSid)}
        class="flex items-center gap-2 rounded-xl border border-surface/15 bg-surface/10 px-3 py-2 text-xs font-semibold text-content transition hover:border-live/50 hover:bg-live/15 hover:text-live"
        title={copy.unwatch}
        aria-label={copy.unwatch}
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M16 17l5-5-5-5M21 12H9M9 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
        </svg>
      </button>
    {/if}
    {#if model.showViewActions && focusedSid}
      <button
        type="button"
        onclick={() => toggleFullscreen(`card-${focusedSid}`)}
        class="flex items-center gap-2 rounded-xl border border-surface/15 bg-surface/10 px-3 py-2 text-xs font-semibold text-content transition hover:bg-surface/15"
        title={copy.fullscreenLabel}
        aria-label={copy.fullscreenLabel}
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
        </svg>
      </button>
      <button
        type="button"
        onclick={() => togglePiP(`video-${focusedSid}`)}
        class="flex items-center gap-2 rounded-xl border border-surface/15 bg-surface/10 px-3 py-2 text-xs font-semibold text-content transition hover:bg-surface/15"
        title={copy.pipLabel}
        aria-label={copy.pipLabel}
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <rect x="2" y="4" width="20" height="16" rx="2" /><rect
            x="12"
            y="12"
            width="8"
            height="6"
            rx="1"
            fill="currentColor"
          />
        </svg>
      </button>
    {/if}

    <span class="mx-0.5 h-6 w-px bg-surface/15" aria-hidden="true"></span>

    {#if model.showUploadQuality}
      <QualityDropdown isLocal />
    {/if}
    <QualityDropdown
      isLocal={false}
      focusedSid={focused && !focused.isLocal ? focused.participantSid : null}
    />
    {#if model.showFps}
      <FpsDropdown />
    {/if}
    {#if model.audioSid}
      <AudioControls participantSid={model.audioSid} isLocal={model.audioIsLocal} />
    {/if}
    {#if model.showAudioUnavailable}
      <button
        type="button"
        aria-disabled="true"
        class="flex cursor-help items-center rounded-lg border border-surface/15 bg-surface/10 p-2 text-muted opacity-50"
        title={copy.shareAudioUnavailable}
        aria-label={copy.shareAudioUnavailable}
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M11 5L6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6" />
        </svg>
      </button>
    {/if}

    <span class="mx-0.5 h-6 w-px bg-surface/15" aria-hidden="true"></span>

    <button
      type="button"
      onclick={() => void leaveRoom()}
      class="flex items-center gap-2 rounded-xl border border-surface/15 bg-surface/10 px-3.5 py-2 text-xs font-semibold text-content transition hover:border-live/50 hover:bg-live/15 hover:text-live"
    >
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      {copy.leaveRoom}
    </button>
  </div>
</div>
