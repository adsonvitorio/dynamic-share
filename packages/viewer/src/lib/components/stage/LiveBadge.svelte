<script lang="ts">
  import { copy } from "$lib/constants";
  import Bolt from "../icons/Bolt.svelte";

  let { compact = false }: { compact?: boolean } = $props();

</script>

{#if compact}
  <span
    class="flex items-center gap-1 rounded bg-live/90 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white"
  >
    <Bolt class="h-2.5 w-2.5" />
    {copy.liveBadge}
  </span>
{:else}
  <span
    class="flex items-center gap-1.5 rounded-lg bg-live/90 px-2 py-1 text-[10px] font-bold tracking-wider text-white"
  >
    <Bolt class="h-3.5 w-3.5" />
    {copy.liveBadge}
  </span>
{/if}
