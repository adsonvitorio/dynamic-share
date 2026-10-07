<script lang="ts">
  let { class: klass = "h-4 w-4" }: { class?: string } = $props();
</script>

<svg
  class={klass}
  viewBox="0 0 120 120"
  fill="none"
  stroke="currentColor"
  stroke-width="2.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <rect x="18" y="34" width="84" height="52" rx="7" />
  <path d="M60 74V54" />
  <path d="M51 63l9-9 9 9" />
  <path d="M60 86v10" />
  <path d="M44 100h32" />
  <path d="M42 24a26 26 0 0 1 36 0" opacity="0.55" />
  <path d="M50 16a15 15 0 0 1 20 0" opacity="0.55" />
</svg>
