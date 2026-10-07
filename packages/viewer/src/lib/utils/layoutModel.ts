export type BreakpointTier = "base" | "lg" | "xl" | "2xl";

export interface LayoutSpec {
  tier: BreakpointTier;
  roomsWidth: number;
  membersWidth: number;
  stageMaxWidth: number;
  tileMinWidth: number;
}

const TIERS: Record<Exclude<BreakpointTier, "base">, LayoutSpec> = {
  lg: { tier: "lg", roomsWidth: 240, membersWidth: 200, stageMaxWidth: 1600, tileMinWidth: 176 },
  xl: { tier: "xl", roomsWidth: 272, membersWidth: 240, stageMaxWidth: 1600, tileMinWidth: 176 },
  "2xl": {
    tier: "2xl",
    roomsWidth: 288,
    membersWidth: 272,
    stageMaxWidth: 1600,
    tileMinWidth: 176,
  },
};

const BASE: LayoutSpec = {
  tier: "base",
  roomsWidth: 240,
  membersWidth: 224,
  stageMaxWidth: 1600,
  tileMinWidth: 176,
};

export function layoutModel(width: number): LayoutSpec {
  if (width >= 1536) return TIERS["2xl"];
  if (width >= 1280) return TIERS.xl;
  if (width >= 1024) return TIERS.lg;
  return BASE;
}

export const LAYOUT_CLASSES = {
  rooms: "w-60 lg:w-[240px] xl:w-[272px] 2xl:w-[288px]",
  members: "w-56 lg:w-[200px] xl:w-[240px] 2xl:w-[272px]",
  stageMax: "max-w-[1600px]",
} as const;
