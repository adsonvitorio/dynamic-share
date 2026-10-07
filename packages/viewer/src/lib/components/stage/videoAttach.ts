import { streamsStore } from "$lib/room/room.svelte";

export function videoAttach(el: HTMLVideoElement, sid: string) {
  let current = sid;
  streamsStore.attachVideoElement(current, el);
  return {
    update(newSid: string) {
      if (newSid === current) return;
      streamsStore.detachVideoElement(current, el);
      current = newSid;
      streamsStore.attachVideoElement(current, el);
    },
    destroy() {
      streamsStore.detachVideoElement(current, el);
    },
  };
}
