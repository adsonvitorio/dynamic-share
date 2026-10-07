<script lang="ts">
  import { notifications } from "$lib/room/notifications.svelte";
  import { getInitials } from "$lib/utils/text";

  const toasts = $derived(notifications.toasts);
</script>

<div class="sr-only" role="status" aria-live="polite">{notifications.announcement}</div>

{#if toasts.length > 0}
  <div class="absolute top-4 right-4 z-30 flex w-72 flex-col gap-2" aria-hidden="true">
    {#each toasts as toast (toast.id)}
      <div
        class="animate-fade-in-up flex items-center gap-2.5 rounded-xl border border-surface/15 bg-base-deep/85 px-3 py-2.5 shadow-card backdrop-blur-xl"
      >
        <div class="flex -space-x-2">
          {#each toast.people.slice(0, 3) as person, i (i)}
            {#if person.avatarUrl}
              <img
                src={person.avatarUrl}
                alt=""
                class="h-7 w-7 rounded-full object-cover ring-2 ring-base-deep"
                referrerpolicy="no-referrer"
                draggable="false"
              />
            {:else}
              <span
                class="flex h-7 w-7 items-center justify-center rounded-full bg-surface/15 text-[9px] font-bold text-content ring-2 ring-base-deep"
              >
                {getInitials(person.name)}
              </span>
            {/if}
          {/each}
        </div>
        <p class="min-w-0 flex-1 truncate text-xs font-medium text-content">{toast.text}</p>
      </div>
    {/each}
  </div>
{/if}
