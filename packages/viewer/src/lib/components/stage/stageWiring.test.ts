import { describe, expect, it } from "vitest";
import videoCardSrc from "./VideoCard.svelte?raw";
import viewerBadgesSrc from "../room/ViewerBadges.svelte?raw";
import streamsSrc from "../../room/streams.svelte.ts?raw";
import { copy, LIVEKIT, SOUND } from "$lib/constants";

describe("VideoCard — readiness robusto (tab share)", () => {
  it("escuta eventos de frame além de loadedmetadata/resize", () => {
    expect(videoCardSrc).toContain("onloadeddata");
    expect(videoCardSrc).toContain("onplaying");
    expect(videoCardSrc).toContain("onloadedmetadata");
    expect(videoCardSrc).toContain("onresize");
  });

  it("captura o 1º frame via requestVideoFrameCallback com poll de fallback", () => {
    expect(videoCardSrc).toContain("requestVideoFrameCallback");
    expect(videoCardSrc).toContain("cancelVideoFrameCallback");
    expect(videoCardSrc).toContain("setInterval");
    expect(videoCardSrc).toContain("LIVEKIT.VIDEO_DIMS_POLL_MS");
    expect(LIVEKIT.VIDEO_DIMS_POLL_MS).toBeGreaterThan(0);
  });

  it("vídeo sempre muted — autoplay garantido mesmo com áudio na stream", () => {
    // sem muted o browser pode bloquear autoplay → "Conectando…" eterno
    expect(videoCardSrc).toMatch(/<video[\s\S]{0,400}\bmuted\b/);
  });

  it("fallback de dims via trackDims — aba em background não decodifica", () => {
    // tab share de outra aba suspende decode → videoWidth fica 0 para
    // sempre; getSettings() reporta dims da captura sem depender de frame.
    expect(videoCardSrc).toContain("streamsStore.trackDims(sid)");
    expect(streamsSrc).toContain("getSettings");
  });

  it("attach não depende de rAF — track registrada antes do mount", () => {
    // rAF não dispara em aba backgrounded; attachedTracks.set fora do
    // tryAttach (antes da definição do closure) garante attach imediato
    // pelo use:videoAttach no mount do elemento.
    expect(streamsSrc).toContain("tryAttach(0)");
    const addIdx = streamsSrc.indexOf("addVideoCard(participant");
    const setIdx = streamsSrc.indexOf("this.attachedTracks.set(sid, track)", addIdx);
    const closureIdx = streamsSrc.indexOf("const tryAttach", addIdx);
    expect(setIdx).toBeGreaterThan(addIdx);
    expect(setIdx).toBeLessThan(closureIdx);
  });
});

describe("VideoCard — saída de fullscreen sem teclado", () => {
  it("botão de sair existe dentro do card fullscreenizado e chama exitFullscreen", () => {
    // ESC é a única saída nativa — sem o botão, usuário sem teclado fica preso
    expect(videoCardSrc).toContain("exitFullscreen");
    expect(videoCardSrc).toContain("copy.exitFullscreen");
    expect(videoCardSrc).toContain("fs-exit");
  });

  it("controles são filhos do .video-card, fora da cadeia de estados do vídeo", () => {
    // dentro da cadeia isWatching eles sumiriam se a stream caísse em
    // fullscreen (novo trap); fora do .video-card nunca ficariam visíveis
    expect(videoCardSrc).toMatch(
      /\{#if isFocused\}\s*<button[\s\S]*?fs-exit[\s\S]*?<\/button>\s*<div class="fs-controls fs-viewer-controls[\s\S]*?<\/div>\s*\{\/if\}\s*<\/div>\s*<\/div>\s*<style>/,
    );
  });

  it("viewer remoto recebe qualidade e áudio condicional no fullscreen", () => {
    expect(videoCardSrc).toContain(
      "<QualityDropdown isLocal={false} focusedSid={stream.participantSid} />",
    );
    expect(videoCardSrc).toMatch(
      /\{#if hasAudio\}[\s\S]*?<AudioControls participantSid=\{stream\.participantSid\} isLocal=\{stream\.isLocal\} \/>/,
    );
  });

  it("apresentador recebe qualidade de upload, fps e mute do áudio no fullscreen", () => {
    // sem esses controles o apresentador precisa sair do fullscreen pra ajustar
    expect(videoCardSrc).toMatch(
      /\{#if stream\.isLocal\}[\s\S]*?<QualityDropdown isLocal \/>[\s\S]*?<FpsDropdown \/>[\s\S]*?\{:else\}/,
    );
  });

  it("controles só existem em :fullscreen e seguem o reveal por hover/tap", () => {
    expect(videoCardSrc).toMatch(/\.fs-exit,\s*\.fs-viewer-controls\s*\{\s*display:\s*none/);
    expect(videoCardSrc).toMatch(/:fullscreen\s+\.fs-exit,\s*\.video-card:fullscreen\s+\.fs-viewer-controls\s*\{\s*display:\s*flex/);
    // fs-controls ocultos não podem receber toque (senão o botão invisível
    // sai do fullscreen por acidente)
    expect(videoCardSrc).toContain("pointer-events: none");
    expect(videoCardSrc).toContain("pointer-events: auto");
  });
});

describe("ViewerBadges — pill visível", () => {
  it("é um pill com ícone de olho, role status e label de contagem", () => {
    expect(viewerBadgesSrc).toContain('role="status"');
    expect(viewerBadgesSrc).toContain("copy.viewersWatching(viewers.length)");
    expect(viewerBadgesSrc).toContain("rounded-full");
    expect(viewerBadgesSrc).toContain("<svg");
  });

  it("renderiza nos 4 contextos do VideoCard (focado + thumbnail)", () => {
    // pill só no focado deixava o sharer sem ver quem assiste no thumbnail
    const usages = videoCardSrc.match(/<ViewerBadges/g) ?? [];
    expect(usages.length).toBe(4);
    expect(videoCardSrc).toContain("max={2}");
  });

  it("copy viewersWatching formata a contagem", () => {
    expect(copy.viewersWatching(3)).toBe("3 assistindo");
  });
});

describe("streams — viewer local na lista", () => {
  it("announceViewership reflete o próprio usuário em streamViewers", () => {
    expect(streamsSrc).toContain("setLocalViewer(streamSid, watching)");
    expect(streamsSrc).toContain("private setLocalViewer");
    // fallback de nome quando userName vem vazio
    expect(streamsSrc).toContain("ROOM_UI.DEFAULT_LOCAL_NAME");
  });
});

describe("notify-sound — pendente pré-gesto", () => {
  it("SOUND.PENDING_MAX_AGE_MS define o TTL do evento guardado", () => {
    expect(SOUND.PENDING_MAX_AGE_MS).toBeGreaterThan(0);
  });
});
