<script lang="ts">
  import type { Snippet } from "svelte";
  import { BRAND } from "$lib/constants";
  import StatusIcon from "./status/StatusIcon.svelte";

  let {
    title,
    description = "",
    icon = "info",
    children,
  }: {
    title: string;
    description?: string;
    icon?: "info" | "warn" | "pause" | "offline";
    children?: Snippet;
  } = $props();

  const tones: Record<string, string> = {
    info: "bg-brand/15 text-brand ring-brand/30",
    warn: "bg-live/15 text-live ring-live/30",
    pause: "bg-accent/15 text-accent ring-accent/30",
    offline: "bg-surface/10 text-muted ring-surface/25",
  };
</script>

<div class="relative flex h-dvh overflow-y-auto p-6">
  <div
    role="status"
    class="glass-strong animate-fade-in-up relative m-auto w-full max-w-md overflow-hidden rounded-3xl p-8 text-center shadow-card"
  >
    <div
      class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/60 to-transparent"
      aria-hidden="true"
    ></div>
    <img
      src={BRAND.LOGO_URL}
      alt={BRAND.NAME}
      class="mx-auto mb-6 h-10 w-10 rounded-xl object-contain opacity-90"
      referrerpolicy="no-referrer"
      draggable="false"
    />
    <div
      class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl ring-1 {tones[icon]}"
    >
      <StatusIcon severity={icon} class="h-8 w-8" />
    </div>
    <h1 class="font-display text-xl font-bold tracking-tight text-content">{title}</h1>
    {#if description}
      <p class="mx-auto mt-2.5 max-w-sm text-sm leading-relaxed text-muted">{description}</p>
    {/if}
    {#if children}
      <div class="mt-7">{@render children()}</div>
    {/if}
    <p class="mt-8 text-[10px] font-semibold tracking-[0.2em] text-muted uppercase opacity-60">
      {BRAND.NAME}
    </p>
  </div>
</div>
