import { createLogger } from "./logger";

const log = createLogger("DOM");

export function exitFullscreen(): void {
  if (!document.fullscreenElement) return;
  document.exitFullscreen().catch((e: unknown) => {
    log.warn("fullscreen_exit_failed", e);
  });
}

export function toggleFullscreen(elementId: string): void {
  const el = document.getElementById(elementId);
  if (!el) return;
  if (document.fullscreenElement) {
    exitFullscreen();
  } else {
    el.requestFullscreen?.().catch((e: unknown) => {
      log.warn("fullscreen_enter_failed", e);
    });
  }
}

export async function togglePiP(videoId: string): Promise<void> {
  const el = document.getElementById(videoId);
  if (!(el instanceof HTMLVideoElement)) return;
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await el.requestPictureInPicture();
    }
  } catch (err) {
    log.warn("pip_toggle_failed", err);
  }
}

export function exitPiP(): void {
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture().catch((err) => log.warn("pip_exit_failed", err));
  }
}

export function exitPiPIfRemoved(): void {
  const pipVideo = document.pictureInPictureElement;
  if (pipVideo && !document.body.contains(pipVideo)) {
    document.exitPictureInPicture().catch((err) => log.warn("pip_exit_failed", err));
  }
}
