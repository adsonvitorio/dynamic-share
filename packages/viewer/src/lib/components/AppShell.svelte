<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { roomsStore } from "$lib/room/rooms.svelte";
  import IconRail from "./rail/IconRail.svelte";

  let { children } = $props();

  const isHub = $derived(page.route.id === "/rooms");
  const inRoom = $derived(page.route.id === "/[room]");

  onMount(() => {
    void roomsStore.load();
    return () => roomsStore.destroy();
  });
</script>

<a
  href="#main"
  class="sr-only z-[60] rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
>
  Pular para o conteúdo
</a>
<div class="flex h-dvh">
  {#if !isHub}
    <IconRail />
  {/if}
  <main
    id="main"
    class="min-w-0 flex-1 {inRoom ? 'overflow-hidden' : 'overflow-y-auto'}"
    tabindex="-1"
  >
    {@render children()}
  </main>
</div>
