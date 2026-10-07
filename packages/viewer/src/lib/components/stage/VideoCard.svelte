<script lang="ts">
  import { streamsStore } from "$lib/room/room.svelte";
  import { copy, LIVEKIT } from "$lib/constants";
  import { getInitials } from "$lib/utils/text";
  import AudioControls from "$lib/components/room/AudioControls.svelte";
  import FpsDropdown from "$lib/components/room/FpsDropdown.svelte";
  import QualityDropdown from "$lib/components/room/QualityDropdown.svelte";
  import ViewerBadges from "$lib/components/room/ViewerBadges.svelte";
  import LiveBadge from "./LiveBadge.svelte";
  import { tileSecondaryAction } from "./cardActions";
  import { exitFullscreen } from "$lib/utils/dom";
  import { videoAttach } from "./videoAttach";
  import { fitAspect, aspectFit, effectiveDims } from "$lib/utils/videoAspect";
  import type { AvailableStream, VideoCard } from "$lib/room/types";

  let {
    stream,
    card,
    isFocused,
  }: {
    stream: AvailableStream;
    card: VideoCard | undefined;
    isFocused: boolean;
  } = $props();

  const isWatching = $derived(
    stream.isLocal || streamsStore.subscribedSids.has(stream.participantSid),
  );
  const viewers = $derived(streamsStore.streamViewers[stream.participantSid] ?? []);
  const hasAudio = $derived(streamsStore.hasAudioTrack[stream.participantSid] ?? false);
  const secondary = $derived(tileSecondaryAction(isWatching && !stream.isLocal));

  let boxW = $state(0);
  let boxH = $state(0);
  let videoW = $state(0);
  let videoH = $state(0);
  // Não-assistindo sempre usa o aspect padrão — o placeholder fica com o
  // mesmo tamanho antes e depois de assistir (dims persistem no state).
  const eff = $derived(effectiveDims(videoW, videoH, isWatching, LIVEKIT.DEFAULT_ASPECT));
  const aspect = $derived(fitAspect(eff.width, eff.height));
  const fit = $derived(aspectFit(eff.width, eff.height, boxW, boxH));
  const videoReady = $derived(videoW > 0 && videoH > 0);

  function open(): void {
    void streamsStore.openStream(stream.participantSid);
  }

  function unwatch(): void {
    void streamsStore.toggleSubscribe(stream.participantSid);
  }

  function syncVideoDims(e: Event): void {
    const el = e.currentTarget as HTMLVideoElement;
    videoW = el.videoWidth;
    videoH = el.videoHeight;
  }

  // O overlay "Conectando" depende de videoWidth>0 — mas nem todo evento
  // dispara em todo cenário (track muted no início, attach tardio, frame
  // único de aba estática). Enquanto não há dims, requestVideoFrameCallback
  // captura o 1º frame apresentado e o interval cobre browsers sem rVFC
  // (ou rVFC que nunca dispara).
  $effect(() => {
    if (!(isWatching && card) || videoReady) return;
    const sid = stream.participantSid;
    const el = document.getElementById(`video-${sid}`);
    if (!(el instanceof HTMLVideoElement)) return;
    const sync = () => {
      if (el.videoWidth > 0 && el.videoHeight > 0) {
        videoW = el.videoWidth;
        videoH = el.videoHeight;
        return;
      }
      // Aba em background suspende decode (tab share de outra aba) —
      // getSettings() reporta dims da captura sem frame decodificado.
      const dims = streamsStore.trackDims(sid);
      if (dims) {
        videoW = dims.width;
        videoH = dims.height;
      }
    };
    const rVFC =
      typeof el.requestVideoFrameCallback === "function"
        ? el.requestVideoFrameCallback(sync)
        : undefined;
    const id = setInterval(sync, LIVEKIT.VIDEO_DIMS_POLL_MS);
    return () => {
      if (rVFC !== undefined) el.cancelVideoFrameCallback(rVFC);
      clearInterval(id);
    };
  });
</script>

<div
  bind:clientWidth={boxW}
  bind:clientHeight={boxH}
  class="group/card relative {isFocused
    ? 'flex min-h-0 flex-1 items-center justify-center'
    : 'h-full w-full'}"
>
  <div
    id={`card-${stream.participantSid}`}
    class="video-card relative overflow-hidden bg-base-deep {isFocused
      ? `max-h-full max-w-full rounded-2xl border border-surface/10 shadow-card ${fit === 'none' ? 'w-full' : ''} ${isWatching && card ? 'shadow-glow' : ''}`
      : 'h-full w-full rounded-xl border border-surface/10 shadow-card transition-all duration-theme ease-theme hover:border-brand/50'}"
    style:aspect-ratio={isFocused ? aspect || null : null}
    style:width={isFocused && fit === "width" ? "100%" : null}
    style:height={isFocused && fit === "height" ? "100%" : null}
  >
  {#if isWatching && card}
    <video
      id={`video-${stream.participantSid}`}
      use:videoAttach={stream.participantSid}
      autoplay
      playsinline
      muted
      oncontextmenu={(e) => e.preventDefault()}
      onloadedmetadata={syncVideoDims}
      onloadeddata={syncVideoDims}
      onplaying={syncVideoDims}
      onresize={syncVideoDims}
      class="{isFocused ? LIVEKIT.VIDEO_CLASS_NORMAL : LIVEKIT.VIDEO_CLASS_THUMBNAIL} transition-opacity duration-300 {videoReady
        ? 'opacity-100'
        : 'opacity-0'}"
    ></video>
    {#if !videoReady}
      <div
        class="absolute inset-0 z-[5] flex flex-col items-center justify-center bg-base-deep"
        aria-hidden="true"
      >
        {#if stream.avatarUrl}
          <img
            src={stream.avatarUrl}
            alt=""
            class="rounded-full object-cover {isFocused ? 'h-20 w-20' : 'h-8 w-8'}"
            referrerpolicy="no-referrer"
          />
        {:else}
          <div
            class="flex items-center justify-center rounded-full bg-surface/10 {isFocused
              ? 'h-20 w-20'
              : 'h-8 w-8'}"
          >
            <span class="font-medium text-content {isFocused ? 'text-2xl' : 'text-xs'}"
              >{getInitials(stream.name)}</span
            >
          </div>
        {/if}
        {#if isFocused}
          <div class="mt-4 text-sm font-medium text-content">{stream.name}</div>
          <div class="mt-1 text-xs text-muted">{copy.streamConnecting}</div>
        {/if}
      </div>
    {/if}

    {#if isFocused}
      <div
        class="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/60 to-transparent"
        aria-hidden="true"
      ></div>
      <div class="fs-controls absolute top-3 left-3 flex items-center gap-2">
        <div
          class="rounded-lg border border-surface/15 bg-base-deep/80 px-3 py-1.5 text-sm font-medium text-content backdrop-blur-md"
        >
          {stream.name}
        </div>
        <LiveBadge />
      </div>
      {#if viewers.length > 0 || stream.isLocal}
        <div class="fs-controls absolute bottom-3 left-3 z-10">
          <ViewerBadges {viewers} />
        </div>
      {/if}
    {:else}
      <div class="absolute top-1.5 left-1.5 z-10">
        <LiveBadge compact />
      </div>
      <div
        class="absolute bottom-1 left-1 z-10 rounded bg-base-deep/90 px-1.5 py-0.5 text-[10px] font-medium text-content"
      >
        {stream.name}
      </div>
      {#if viewers.length > 0 || stream.isLocal}
        <div class="absolute right-1 bottom-1 z-10 scale-90">
          <ViewerBadges {viewers} max={2} />
        </div>
      {/if}
      <button
        type="button"
        onclick={open}
        class="absolute inset-0 z-0 cursor-pointer"
        aria-label="{copy.openLabel} — {stream.name}"
      ></button>
      {#if secondary === "unwatch"}
        <button
          type="button"
          onclick={unwatch}
          class="absolute top-1.5 right-1.5 z-10 rounded-lg border border-live/60 bg-live/90 p-1.5 text-white opacity-0 transition group-hover/card:opacity-100 group-focus-within/card:opacity-100 hover:bg-live"
          title={copy.unwatch}
          aria-label="{copy.unwatch} — {stream.name}"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"
            ><path
              d="M16 17l5-5-5-5M21 12H9M9 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4"
              stroke-linecap="round"
              stroke-linejoin="round"
            /></svg
          >
        </button>
      {/if}
    {/if}
  {:else if isFocused}
    <div class="flex h-full flex-col items-center justify-center p-8 text-center">
      {#if stream.avatarUrl}
        <img
          src={stream.avatarUrl}
          alt={stream.name}
          class="mb-4 h-20 w-20 rounded-full object-cover ring-4 ring-live/30"
          referrerpolicy="no-referrer"
        />
      {:else}
        <div
          class="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-surface/10 ring-4 ring-live/30"
        >
          <span class="text-2xl font-medium text-content">{getInitials(stream.name)}</span>
        </div>
      {/if}
      <div class="mb-2 text-lg font-medium text-content">{stream.name}</div>
      <div class="mb-5">
        <LiveBadge />
      </div>
      {#if viewers.length > 0}
        <div class="mb-5 flex items-center gap-2">
          <ViewerBadges {viewers} showCount={false} />
          <span class="text-xs text-muted">{copy.viewersWatching(viewers.length)}</span>
        </div>
      {/if}
      <button
        type="button"
        onclick={open}
        class="flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white shadow-card transition hover:brightness-110"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg
        >{copy.watchStream}
      </button>
    </div>
  {:else}
    <div class="flex h-full w-full flex-col items-center justify-center bg-base-deep">
      {#if stream.avatarUrl}
        <img
          src={stream.avatarUrl}
          alt={stream.name}
          class="mb-1 h-8 w-8 rounded-full object-cover"
          referrerpolicy="no-referrer"
        />
      {:else}
        <div class="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-surface/10">
          <span class="text-xs font-medium text-content">{getInitials(stream.name)}</span>
        </div>
      {/if}
      <LiveBadge compact />
    </div>
    <div
      class="absolute bottom-1 left-1 z-10 rounded bg-base-deep/90 px-1.5 py-0.5 text-[10px] font-medium text-content"
    >
      {stream.name}
    </div>
    {#if viewers.length > 0}
      <div class="absolute right-1 bottom-1 z-10 scale-90">
        <ViewerBadges {viewers} max={2} />
      </div>
    {/if}
    <button
      type="button"
      onclick={open}
      class="absolute inset-0 z-0 cursor-pointer"
      aria-label="{copy.openLabel} — {stream.name}"
    ></button>
    <div
      class="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-base-deep/50 opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100"
      aria-hidden="true"
    >
      <span class="rounded-lg border border-brand/60 bg-brand/90 p-1.5 text-white">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
      </span>
    </div>
  {/if}
  {#if isFocused}
    <button
      type="button"
      onclick={exitFullscreen}
      class="fs-controls fs-exit absolute top-3 right-3 z-10 items-center rounded-lg border border-surface/15 bg-base-deep/80 p-2 text-content backdrop-blur-md transition hover:bg-surface/15"
      title={copy.exitFullscreen}
      aria-label={copy.exitFullscreen}
    >
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
      </svg>
    </button>
    <div class="fs-controls fs-viewer-controls absolute right-3 bottom-3 z-10 items-center gap-2">
      {#if stream.isLocal}
        <QualityDropdown isLocal />
        <FpsDropdown />
      {:else}
        <QualityDropdown isLocal={false} focusedSid={stream.participantSid} />
      {/if}
      {#if hasAudio}
        <AudioControls participantSid={stream.participantSid} isLocal={stream.isLocal} />
      {/if}
    </div>
  {/if}
  </div>
</div>

<style>
  .video-card:fullscreen {
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 0;
    background: var(--base-deep);
  }
  .video-card:fullscreen video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .fs-exit,
  .fs-viewer-controls {
    display: none;
  }
  .video-card:fullscreen .fs-exit,
  .video-card:fullscreen .fs-viewer-controls {
    display: flex;
  }
  .video-card:fullscreen .fs-controls {
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s;
  }
  .video-card:fullscreen:hover .fs-controls,
  .video-card:fullscreen:focus-within .fs-controls {
    opacity: 1;
    pointer-events: auto;
  }
</style>
