<script lang="ts">
  let { count = 3 }: { count?: number } = $props();
  const orbs = $derived(
    Array.from({ length: count }, (_, i) => ({
      size: 42 + i * 14,
      x: [8, 62, 30][i % 3],
      y: [12, 55, 78][i % 3],
      delay: i * -4.5,
      color: `var(--orb-${(i % 3) + 1})`,
    })),
  );
</script>

<div class="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
  {#each orbs as orb}
    <div
      class="animate-float-orb absolute rounded-full blur-3xl"
      style="
        width: {orb.size}vmax;
        height: {orb.size}vmax;
        left: {orb.x}%;
        top: {orb.y}%;
        background: rgb({orb.color} / 0.10);
        animation-delay: {orb.delay}s;
      "
    ></div>
  {/each}
</div>
