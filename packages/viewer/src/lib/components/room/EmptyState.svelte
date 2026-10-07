<script lang="ts">
  import type { Component } from "svelte";

  let {
    title,
    message,
    icon = null,
  }: {
    title: string;
    message: string;
    icon?: Component | null;
  } = $props();
</script>

<div role="status" class="flex h-full flex-col items-center justify-center p-8 text-center">
  <div class="mb-4 rounded-2xl bg-surface/8 p-5">
    {#if icon}
      {@const Icon = icon}
      <Icon class="h-10 w-10 text-muted" />
    {:else}
      <svg
        class="h-10 w-10 text-muted"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        ><rect x="2" y="3" width="20" height="14" rx="2" /><path
          d="M8 21h8M12 17v4"
          stroke-linecap="round"
        /></svg
      >
    {/if}
  </div>
  <h2 class="mb-2 text-lg font-semibold text-content">{title}</h2>
  <p class="max-w-sm text-sm text-muted">{message}</p>
</div>
