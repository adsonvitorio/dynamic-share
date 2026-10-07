<script lang="ts">
  import { LIVEKIT } from "$lib/constants";
  import type { UploadFps } from "$lib/room/types";
  import { qualityStore } from "$lib/room/room.svelte";
  import DropdownMenu from "./DropdownMenu.svelte";

  const items = $derived(
    LIVEKIT.FPS_OPTIONS.map((o) => ({
      key: o.key,
      label: o.label,
      selected: qualityStore.uploadFps === o.key,
    })),
  );
</script>

<DropdownMenu
  label="{qualityStore.uploadFps}fps"
  title="FPS"
  {items}
  onSelect={(key) => void qualityStore.setUploadFps(key as UploadFps)}
/>
