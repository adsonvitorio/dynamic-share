<script lang="ts">
  import { onMount } from "svelte";
  import { afterNavigate, goto } from "$app/navigation";
  import { page } from "$app/state";
  import { app } from "$lib/app/app.svelte";
  import { auth } from "$lib/auth/auth.svelte";
  import { connectionStore } from "$lib/room/room.svelte";
  import {
    initDomProtection,
    destroyDomProtection,
  } from "$lib/utils/dom-protection";
  import { createLogger } from "$lib/utils/logger";
  import { BRAND, copy, ROUTES } from "$lib/constants";
  import StatusScreen from "$lib/components/StatusScreen.svelte";
  import Orbs from "$lib/components/Orbs.svelte";
  import Spinner from "$lib/components/Spinner.svelte";
  import AppShell from "$lib/components/AppShell.svelte";
  import "../app.css";

  const log = createLogger("Layout");

  let { children } = $props();

  const onLoginPage = $derived(page.url.pathname === ROUTES.LOGIN);
  const needsAuthGate = $derived(app.status === "ready" && !onLoginPage);

  afterNavigate(() => {
    if (app.status === "ready") void auth.checkAuth();
  });

  onMount(() => {
    initDomProtection();
    void app.load();
    const onVisibility = () => {
      if (document.visibilityState === "visible" && app.status === "ready") {
        void auth.checkAuth();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      destroyDomProtection();
    };
  });

  $effect(() => {
    if (!needsAuthGate) return;
    if (auth.status === "unchecked") {
      void auth.checkAuth();
      return;
    }
    if (auth.status === "unauthenticated") {
      void goto(`${ROUTES.LOGIN}?path=${encodeURIComponent(page.url.pathname)}`, {
        replaceState: true,
      });
    }
  });

  $effect(() => {
    if (onLoginPage && auth.status === "authenticated") {
      void goto(ROUTES.ROOMS, { replaceState: true });
    }
  });

  // Sessão substituída é evento de conta — a sala cai junto.
  $effect(() => {
    if (auth.status === "session_replaced" && connectionStore.room) {
      connectionStore
        .destroy()
        .catch((err) => log.warn("destroy_on_session_replaced_failed", err));
    }
  });
</script>

<Orbs />

{#if app.status === "loading"}
  <div class="flex min-h-dvh items-center justify-center">
    <Spinner size={28} label="Carregando aplicação" />
  </div>
{:else if app.status === "error"}
  <StatusScreen
    title={copy.statusConnectTitle}
    description={copy.statusConnectDesc}
    icon="offline"
  >
    <button
      class="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
      onclick={() => void app.load()}
    >
      Tentar novamente
    </button>
  </StatusScreen>
{:else if app.status === "paused"}
  <StatusScreen
    title={copy.statusPausedTitle}
    description={copy.statusPausedDesc(BRAND.NAME)}
    icon="pause"
  />
{:else}
  <div class="relative min-h-dvh">
    {#if needsAuthGate && auth.status === "unchecked"}
      <div class="relative z-10 flex min-h-dvh items-center justify-center">
        <Spinner size={28} label="Verificando sessão" />
      </div>
    {:else if needsAuthGate && auth.status === "session_replaced"}
      <StatusScreen
        title={copy.statusReplacedTitle}
        description={copy.statusReplacedDesc}
        icon="warn"
      >
        <button
          class="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          onclick={() => {
            window.location.href = `${ROUTES.LOGIN}?reason=session_replaced`;
          }}
        >
          Ir para login
        </button>
      </StatusScreen>
    {:else if needsAuthGate && auth.status === "error"}
      <StatusScreen
        title={copy.statusAuthTitle}
        description={copy.statusConnectDesc}
        icon="offline"
      >
        <button
          class="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          onclick={() => void auth.checkAuth()}
        >
          Tentar novamente
        </button>
      </StatusScreen>
    {:else if needsAuthGate && auth.status === "authenticated"}
      <div class="relative z-10">
        <AppShell>
          {@render children()}
        </AppShell>
      </div>
    {:else}
      {@render children()}
    {/if}
  </div>
{/if}
