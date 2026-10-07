import { describe, expect, it } from "vitest";
import videoCardSrc from "./VideoCard.svelte?raw";
import { tileSecondaryAction } from "./cardActions";

describe("cardActions", () => {
  it("tile inscrito tem ação secundária unwatch", () => {
    expect(tileSecondaryAction(true)).toBe("unwatch");
  });

  it("tile não inscrito não tem ação secundária — só o open", () => {
    expect(tileSecondaryAction(false)).toBeNull();
  });
});

describe("VideoCard — ações de view vivem só na ControlBar", () => {
  it("card não chama fullscreen/pip nem importa os toggles", () => {
    expect(videoCardSrc).not.toContain("toggleFullscreen(");
    expect(videoCardSrc).not.toContain("togglePiP(");
    expect(videoCardSrc).not.toContain("heroActions");
  });

  it("card mantém footprint estável via aspect padrão quando sem dimensões", () => {
    expect(videoCardSrc).toContain("LIVEKIT.DEFAULT_ASPECT");
    expect(videoCardSrc).toContain("videoReady");
    expect(videoCardSrc).toContain("fit === 'none' ? 'w-full'");
  });

  it("card mostra overlay de conexão até o vídeo estar pronto", () => {
    expect(videoCardSrc).toContain("{#if !videoReady}");
    expect(videoCardSrc).toContain("copy.streamConnecting");
  });
});
