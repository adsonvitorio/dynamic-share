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
  <circle cx="12" cy="12" r="7" />
  <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
  <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
</svg>
