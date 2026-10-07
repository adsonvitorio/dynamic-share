<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ROUTES } from "$lib/constants";

  onMount(() => {
    void goto(ROUTES.ROOMS, { replaceState: true });
  });
</script>
