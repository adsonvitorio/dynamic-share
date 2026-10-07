import { goto } from "$app/navigation";
import { ROUTES } from "$lib/constants";
import { destroyRoom, sharingStore, streamsStore } from "$lib/room/room.svelte";

export function toggleShare(): Promise<void> {
  return sharingStore.isSharing ? sharingStore.stopShare() : sharingStore.shareScreen();
}

export async function leaveRoom(): Promise<void> {
  await destroyRoom();
  await goto(ROUTES.ROOMS);
}

export function switchScreen(): Promise<void> {
  return sharingStore.switchScreen();
}

export function unwatchStream(sid: string): Promise<void> {
  return streamsStore.toggleSubscribe(sid);
}

export interface ControlBarModel {
  showFps: boolean;
  showSwitchScreen: boolean;
  showUploadQuality: boolean;
  showUnwatch: boolean;
  showViewActions: boolean;
  audioSid: string | null;
  audioIsLocal: boolean;
  showAudioUnavailable: boolean;
}

export function controlBarModel(opts: {
  isSharing: boolean;
  focused: { participantSid: string; isLocal: boolean } | undefined;
  focusedWatched: boolean;
  hasAudio: boolean;
}): ControlBarModel {
  const focused = opts.focused;
  return {
    showFps: opts.isSharing,
    showSwitchScreen: opts.isSharing,
    showUploadQuality: opts.isSharing,
    showUnwatch: !!focused && !focused.isLocal && opts.focusedWatched,
    showViewActions: !!focused && opts.focusedWatched,
    audioSid: focused && opts.hasAudio ? focused.participantSid : null,
    audioIsLocal: focused?.isLocal ?? false,
    showAudioUnavailable:
      opts.isSharing && focused?.isLocal === true && !opts.hasAudio,
  };
}
