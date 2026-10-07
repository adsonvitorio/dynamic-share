<script lang="ts">
  let { class: klass = "h-4 w-4" }: { class?: string } = $props();
</script>

<svg
  class={klass}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M12 3c-4.4 0-7.5 3-7.5 7 0 2.5 1.3 4.4 3.1 5.5V19a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-3.5c1.8-1.1 3.1-3 3.1-5.5 0-4-3.1-7-7.5-7Z" />
  <circle cx="9" cy="10.5" r="1.4" fill="currentColor" stroke="none" />
  <circle cx="15" cy="10.5" r="1.4" fill="currentColor" stroke="none" />
  <path d="M12 13.5v2M10 19.5v-1.6M14 19.5v-1.6" />
</svg>
