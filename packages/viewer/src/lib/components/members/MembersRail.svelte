<script lang="ts">
  import { participantsStore } from "$lib/room/room.svelte";
  import { copy, ROOM_UI, RAILS } from "$lib/constants";
  import { LAYOUT_CLASSES } from "$lib/utils/layoutModel";
  import { focusTrap, isMobileViewport } from "$lib/utils/focusTrap";
  import { rovingList } from "$lib/utils/rovingTabindex";
  import { membersRailStore } from "./members.svelte";
  import MemberCard from "./MemberCard.svelte";
  import OccupantStack from "$lib/components/hub/OccupantStack.svelte";

  const trapActive = $derived(!membersRailStore.collapsed && isMobileViewport());
  const participants = $derived(participantsStore.participants);
  const count = $derived(participantsStore.participantCount);
  const collapsed = $derived(membersRailStore.collapsed);

  $effect(() => {
    if (collapsed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") membersRailStore.toggle();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
</script>

{#if collapsed}
  <div class="flex w-10 shrink-0 flex-col items-center gap-2 border-l border-surface/10 bg-base/80 py-2 backdrop-blur-xl">
    <button
      type="button"
      onclick={() => membersRailStore.toggle()}
      class="rounded-lg p-2 text-muted transition hover:bg-surface/10 hover:text-content"
      aria-label="Mostrar {copy.membersTitle.toLowerCase()}"
      aria-expanded="false"
      title={copy.membersTitle}
    >
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    </button>
    <div
      class="flex min-h-0 flex-1 flex-col items-center overflow-y-auto overflow-x-hidden"
      aria-label="{count} {copy.membersTitle.toLowerCase()}"
    >
      <OccupantStack
        occupants={participants.map((p) => ({ id: p.sid, name: p.name, avatarUrl: p.avatarUrl }))}
        participantCount={count}
        max={RAILS.MEMBER_STACK_MAX}
        vertical
      />
    </div>
  </div>
{:else}
  <button
    type="button"
    class="fixed inset-0 z-30 bg-black/50 lg:hidden"
    aria-label="Fechar {copy.membersTitle.toLowerCase()}"
    onclick={() => membersRailStore.toggle()}
  ></button>
  <aside
    aria-label={copy.membersTitle}
    use:focusTrap={trapActive}
    class="flex shrink-0 flex-col border-l border-surface/10 bg-base/80 backdrop-blur-xl {LAYOUT_CLASSES.members} max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:shadow-card max-lg:animate-slide-in-right"
  >
    <div class="flex items-center justify-between gap-2 border-b border-surface/10 px-3 py-3.5">
      <p class="text-[11px] font-semibold tracking-wider text-muted uppercase">
        {copy.membersTitle} — {count}
      </p>
      <button
        type="button"
        onclick={() => membersRailStore.toggle()}
        class="rounded-lg p-1.5 text-muted transition hover:bg-surface/10 hover:text-content"
        aria-label="Ocultar {copy.membersTitle.toLowerCase()}"
        aria-expanded="true"
      >
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
    <ul
      class="flex-1 overflow-y-auto p-2 grid grid-cols-2 content-start gap-2"
      role="list"
      aria-label={copy.membersTitle}
      use:rovingList
    >
      {#each participants as participant, i (participant.sid)}
        <MemberCard {participant} youLabel={copy.youLabel} delay={i * ROOM_UI.LIST_STAGGER_MS} />
      {/each}
    </ul>
  </aside>
{/if}
