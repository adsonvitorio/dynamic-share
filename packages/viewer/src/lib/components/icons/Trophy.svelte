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
  <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
  <path d="M8 5.5H5.5a2.6 2.6 0 0 0 2.7 3.4M16 5.5h2.5a2.6 2.6 0 0 1-2.7 3.4" />
  <path d="M12 13v3.5" />
  <path d="M10 16.5h4l1 4H9l1-4Z" />
</svg>
