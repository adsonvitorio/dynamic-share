<script lang="ts">
  import { LIVEKIT } from "$lib/constants";
  import type { UploadQuality, ViewQuality } from "$lib/room/types";
  import { qualityStore } from "$lib/room/room.svelte";
  import DropdownMenu from "./DropdownMenu.svelte";

  let {
    isLocal,
    focusedSid = null,
  }: {
    isLocal: boolean;
    focusedSid?: string | null;
  } = $props();

  const effectiveView = $derived(qualityStore.qualityFor(focusedSid));

  const label = $derived(
    isLocal
      ? `${qualityStore.uploadQuality}p`
      : (LIVEKIT.VIEW_QUALITY_OPTIONS.find((o) => o.key === effectiveView)
          ?.label ?? effectiveView),
  );

  const items = $derived(
    isLocal
      ? LIVEKIT.UPLOAD_QUALITY_OPTIONS.map((o) => ({
          key: o.key,
          label: o.label,
          selected: qualityStore.uploadQuality === o.key,
        }))
      : LIVEKIT.VIEW_QUALITY_OPTIONS.map((o) => ({
          key: o.key,
          label: o.label,
          selected: effectiveView === o.key,
        })),
  );

  function onSelect(key: string) {
    if (isLocal) {
      void qualityStore.setUploadQuality(key as UploadQuality);
    } else {
      qualityStore.setQuality(key as ViewQuality, focusedSid);
    }
  }
</script>

<DropdownMenu {label} title="Qualidade" {items} {onSelect} />
