<script lang="ts">
  import { ROOM_UI } from "$lib/constants";
  import { qualityStore, sharingStore } from "$lib/room/room.svelte";
  import { menuAnchorClass } from "$lib/utils/menuPosition";

  let { participantSid, isLocal }: { participantSid: string; isLocal: boolean } = $props();

  const muted = $derived(
    isLocal
      ? sharingStore.localAudioMuted
      : (qualityStore.remoteAudioMuted[participantSid] ?? false),
  );
  const volume = $derived(qualityStore.remoteAudioVolume[participantSid] ?? ROOM_UI.AUDIO_VOLUME_MAX);
</script>

{#if isLocal}
  <button
    type="button"
    onclick={(e) => {
      e.stopPropagation();
      sharingStore.toggleLocalAudio();
    }}
    class="rounded-lg border p-2 backdrop-blur-md transition {muted
      ? 'border-live/60 bg-live/80 text-white hover:bg-live'
      : 'border-surface/15 bg-base-deep/80 text-content hover:bg-surface/15'}"
    title={muted ? "Ativar áudio" : "Desativar áudio"}
    aria-label={muted ? "Ativar áudio" : "Desativar áudio"}
  >
    {#if muted}
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        ><path
          d="M11 5L6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6"
          stroke-linecap="round"
          stroke-linejoin="round"
        /></svg
      >
    {:else}
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        ><path
          d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"
          stroke-linecap="round"
          stroke-linejoin="round"
        /></svg
      >
    {/if}
  </button>
{:else}
  <div class="group relative">
    <button
      type="button"
      onclick={(e) => {
        e.stopPropagation();
        qualityStore.toggleRemoteAudio(participantSid);
      }}
      class="rounded-lg border p-2 backdrop-blur-md transition {muted
        ? 'border-live/60 bg-live/80 text-white hover:bg-live'
        : 'border-surface/15 bg-base-deep/80 text-content hover:bg-surface/15'}"
      title={muted ? "Ativar áudio" : "Desativar áudio"}
      aria-label={muted ? "Ativar áudio" : "Desativar áudio"}
    >
      {#if muted}
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          ><path
            d="M11 5L6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6"
            stroke-linecap="round"
            stroke-linejoin="round"
          /></svg
        >
      {:else}
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          ><path
            d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"
            stroke-linecap="round"
            stroke-linejoin="round"
          /></svg
        >
      {/if}
    </button>
    <div
      class="pointer-events-none absolute right-0 {menuAnchorClass('up')} opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
    >
      <div
        class="flex items-center gap-2 rounded-xl border border-surface/15 bg-base-deep px-3 py-2.5 shadow-card"
      >
        <svg
          class="h-3.5 w-3.5 text-muted"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          ><path
            d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07"
            stroke-linecap="round"
            stroke-linejoin="round"
          /></svg
        >
        <input
          type="range"
          min={ROOM_UI.AUDIO_VOLUME_MIN}
          max={ROOM_UI.AUDIO_VOLUME_MAX}
          step={0.05}
          value={volume}
          onclick={(e) => e.stopPropagation()}
          oninput={(e) => {
            qualityStore.setRemoteVolume(participantSid, e.currentTarget.valueAsNumber);
          }}
          class="slider h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-surface/20"
          title="Volume"
          aria-label="Volume"
        />
        <span class="w-8 text-right text-[10px] font-medium text-muted"
          >{Math.round(volume * 100)}%</span
        >
      </div>
    </div>
  </div>
{/if}

<style>
  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: rgb(var(--brand));
    cursor: pointer;
    border: none;
  }
  .slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: rgb(var(--brand));
    cursor: pointer;
    border: none;
  }
</style>
