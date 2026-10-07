<script lang="ts">
  let { size = 20, label = "Carregando" }: { size?: number; label?: string } = $props();
</script>

<span
  role="status"
  aria-label={label}
  class="inline-block animate-spin rounded-full border-2 border-surface/20 border-t-brand"
  style="width: {size}px; height: {size}px;"
></span>
