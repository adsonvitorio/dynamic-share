<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { SHARED_LIMITS, ErrorCodes } from "@share/shared";
  import {
    connectionStore,
    streamsStore,
    connectRoom,
    destroyRoom,
  } from "$lib/room/room.svelte";
  import { roomsStore } from "$lib/room/rooms.svelte";
  import { exitFullscreen, exitPiP, exitPiPIfRemoved } from "$lib/utils/dom";
  import { initNotifySound, destroyNotifySound } from "$lib/utils/notify-sound";
  import { createLogger } from "$lib/utils/logger";
  import { copy, ROUTES } from "$lib/constants";
  import RoomStage from "$lib/components/stage/RoomStage.svelte";
  import StatusScreen from "$lib/components/StatusScreen.svelte";
  import Spinner from "$lib/components/Spinner.svelte";

  const log = createLogger("RoomPage");

  const roomName = $derived(page.params.room ?? "");
  const roomConfig = $derived(roomsStore.rooms.find((room) => room.name === roomName));

  $effect(() => {
    const name = roomName.trim();
    if (
      !name ||
      name.length > SHARED_LIMITS.ROOM_NAME_MAX_LENGTH ||
      !SHARED_LIMITS.ROOM_NAME_REGEX.test(name)
    ) {
      log.warn("invalid_room_slug", name);
      void goto(ROUTES.ROOMS, { replaceState: true });
      return;
    }
    let cancelled = false;
    initNotifySound();
    (async () => {
      try {
        await roomsStore.load();
        if (cancelled) return;
        await connectRoom(name);
      } catch (err) {
        if (cancelled) return;
        log.error("connect_failed", err);
        connectionStore.error = err instanceof Error ? err.message : "Erro ao carregar";
        connectionStore.loading = false;
      }
    })();
    return () => {
      cancelled = true;
      destroyNotifySound();
      exitPiP();
      destroyRoom().catch((err) => log.error("destroy_failed", err));
    };
  });

  $effect(() => {
    if (document.fullscreenElement) {
      const fsId = document.fullscreenElement.id;
      if (!streamsStore.videoCards.some((c) => `card-${c.participantSid}` === fsId)) {
        exitFullscreen();
      }
    }
    exitPiPIfRemoved();
  });

  $effect(() => {
    if (showRoom) return;
    streamsStore.releaseMediaOverlays();
  });

  $effect(() => {
    if (streamsStore.availableStreams.length > 0) {
      const focusedExists = streamsStore.availableStreams.some(
        (s) => s.participantSid === streamsStore.focusedSid,
      );
      if (!focusedExists) {
        streamsStore.focusedSid = streamsStore.availableStreams[0].participantSid;
      }
    } else {
      streamsStore.focusedSid = null;
    }
  });

  const focusedStream = $derived(
    streamsStore.availableStreams.find((s) => s.participantSid === streamsStore.focusedSid) ??
      streamsStore.availableStreams[0],
  );
  const otherStreams = $derived(
    streamsStore.availableStreams.filter(
      (s) => s.participantSid !== focusedStream?.participantSid,
    ),
  );
  const showRoom = $derived(
    !connectionStore.loading && connectionStore.room && !connectionStore.disconnectedReason,
  );
</script>

{#if connectionStore.disconnectedReason === "duplicate_identity"}
  <StatusScreen
    title={copy.statusRoomClosedTitle}
    description={copy.statusRoomClosedDesc}
    icon="warn"
  >
    <a
      href={ROUTES.ROOMS}
      class="inline-block rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
      >Voltar para salas</a
    >
  </StatusScreen>
{:else if connectionStore.disconnectedReason === "disconnected"}
  <StatusScreen
    title={copy.statusLostTitle}
    description={copy.statusLostDesc}
    icon="offline"
  >
    <button
      type="button"
      class="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
      onclick={() => window.location.reload()}
    >
      Reconectar
    </button>
  </StatusScreen>
{:else if connectionStore.loading}
  <div class="flex h-full items-center justify-center">
    <Spinner size={28} label={connectionStore.connecting ? "Conectando..." : "Carregando..."} />
  </div>
{:else if showRoom}
  {#key roomName}
    <div class="animate-fade-in h-full">
      <RoomStage
        roomName={roomConfig?.displayName ?? roomName}
        roomLive={roomConfig?.live ?? false}
        {focusedStream}
        {otherStreams}
      />
    </div>
  {/key}
{:else if connectionStore.errorCode === ErrorCodes.INVALID_ROOM}
  <StatusScreen
    title={copy.statusRoomNotFoundTitle}
    description={copy.statusRoomNotFoundDesc}
    icon="warn"
  >
    <a
      href={ROUTES.ROOMS}
      class="inline-block rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
      >Ver salas disponíveis</a
    >
  </StatusScreen>
{:else if connectionStore.error &&
    connectionStore.errorCode !== ErrorCodes.SESSION_EXPIRED &&
    connectionStore.errorCode !== ErrorCodes.SESSION_REPLACED &&
    connectionStore.errorCode !== ErrorCodes.NOT_AUTHORIZED}
  <StatusScreen title={copy.statusErrorTitle} description={connectionStore.error} icon="warn">
    <div class="flex justify-center gap-3">
      <button
        type="button"
        class="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
        onclick={() => window.location.reload()}
      >
        Tentar novamente
      </button>
      <a
        href={ROUTES.ROOMS}
        class="rounded-xl bg-surface/10 px-5 py-2.5 text-sm font-semibold text-content transition hover:bg-surface/15"
        >Voltar para salas</a
      >
    </div>
  </StatusScreen>
{/if}

{#if showRoom && connectionStore.error}
  <div
    class="animate-fade-in-up fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-live/20 bg-live/10 px-6 py-3 text-live backdrop-blur-md"
    role="alert"
  >
    {connectionStore.error}
  </div>
{/if}

{#if showRoom && connectionStore.reconnecting}
  <div
    role="status"
    aria-live="polite"
    class="animate-fade-in-up fixed top-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-surface/20 bg-base-deep/80 px-4 py-2 text-xs font-medium text-content backdrop-blur-md"
  >
    <span class="h-2 w-2 animate-pulse rounded-full bg-brand"></span>
    Reconectando…
  </div>
{/if}


