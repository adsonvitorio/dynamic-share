export function fitAspect(videoW: number, videoH: number): string {
  if (
    !Number.isFinite(videoW) ||
    !Number.isFinite(videoH) ||
    videoW <= 0 ||
    videoH <= 0
  ) {
    return "";
  }
  return `${videoW} / ${videoH}`;
}

export function effectiveDims(
  videoW: number,
  videoH: number,
  watching: boolean,
  fallback: { width: number; height: number },
): { width: number; height: number } {
  return watching && videoW > 0 && videoH > 0 ? { width: videoW, height: videoH } : fallback;
}

export type AspectFit = "width" | "height" | "none";

export function aspectFit(
  videoW: number,
  videoH: number,
  containerW: number,
  containerH: number,
): AspectFit {
  if (
    fitAspect(videoW, videoH) === "" ||
    !Number.isFinite(containerW) ||
    !Number.isFinite(containerH) ||
    containerW <= 0 ||
    containerH <= 0
  ) {
    return "none";
  }
  return videoW / videoH >= containerW / containerH ? "width" : "height";
}
