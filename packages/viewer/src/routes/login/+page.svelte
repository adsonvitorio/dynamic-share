<script lang="ts">
  import { page } from "$app/state";
  import { API, BRAND, copy } from "$lib/constants";
  import ScreenCast from "$lib/components/icons/ScreenCast.svelte";


  const reason = $derived(page.url.searchParams.get("reason") ?? "");
  const reasonMessage = $derived(
    (copy.loginReasons as Record<string, string>)[reason] ?? "",
  );

  const deeplink = $derived.by(() => {
    // "redirect" é o formato de links antigos ainda circulando.
    const path =
      page.url.searchParams.get("path") ?? page.url.searchParams.get("redirect") ?? "";
    return path.startsWith("/") && !path.startsWith("//") ? path : "";
  });
  const loginHref = $derived(
    deeplink ? `${API.AUTH_DISCORD_LOGIN}?path=${encodeURIComponent(deeplink)}` : API.AUTH_DISCORD_LOGIN,
  );
</script>

<div class="relative z-10 flex min-h-dvh items-center justify-center p-6">
  <div
    class="glass-strong animate-fade-in-up relative w-full max-w-sm overflow-hidden rounded-3xl p-8 text-center shadow-card"
  >
    <div
      class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/60 to-transparent"
      aria-hidden="true"
    ></div>
    <ScreenCast class="mx-auto mb-4 h-16 w-16 text-brand" />
    <h1 class="font-display text-2xl font-bold">{BRAND.NAME}</h1>
    <p class="mt-2 text-sm text-muted">{copy.loginTagline}</p>

    {#if reasonMessage}
      <div class="mt-5 rounded-xl border border-live/30 bg-live/10 px-4 py-3 text-left text-sm text-content">
        {reasonMessage}
      </div>
    {/if}

    <a
      href={loginHref}
      class="mt-6 flex w-full items-center justify-center gap-2.5 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98]"
    >
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M20.317 4.37a19.79 19.79 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.3 12.3 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.84 19.84 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
      </svg>
      Entrar com Discord
    </a>
  </div>
</div>
