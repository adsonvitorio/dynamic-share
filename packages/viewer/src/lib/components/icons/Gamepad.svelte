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
  <rect x="3" y="8" width="18" height="9" rx="4.5" />
  <path d="M8 11v3M6.5 12.5h3" />
  <circle cx="15.8" cy="11.6" r="0.9" fill="currentColor" stroke="none" />
  <circle cx="17.8" cy="13.6" r="0.9" fill="currentColor" stroke="none" />
</svg>
