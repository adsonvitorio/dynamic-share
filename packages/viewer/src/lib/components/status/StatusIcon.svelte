<script lang="ts">
  import Bolt from "../icons/Bolt.svelte";
  import Crosshair from "../icons/Crosshair.svelte";

  let { severity, class: cls = "h-8 w-8" }: { severity: string; class?: string } = $props();
</script>

{#if severity === "warn"}
  <Bolt class={cls} />
{:else}
  <Crosshair class={cls} />
{/if}
