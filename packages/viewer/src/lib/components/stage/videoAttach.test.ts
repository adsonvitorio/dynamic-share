import { beforeEach, describe, expect, it, vi } from "vitest";

const streamsStore = vi.hoisted(() => ({
  attachVideoElement: vi.fn(),
  detachVideoElement: vi.fn(),
}));

vi.mock("$lib/room/room.svelte", () => ({ streamsStore }));

import { videoAttach } from "./videoAttach";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("videoAttach", () => {
  const el = {} as HTMLVideoElement;

  it("attach no mount e detach no destroy", () => {
    const action = videoAttach(el, "sid-a")!;
    expect(streamsStore.attachVideoElement).toHaveBeenCalledWith("sid-a", el);
    action.destroy?.();
    expect(streamsStore.detachVideoElement).toHaveBeenCalledWith("sid-a", el);
  });

  it("update troca o sid: detach do antigo antes de attach do novo", () => {
    const action = videoAttach(el, "sid-a")!;
    action.update!("sid-b");
    expect(streamsStore.detachVideoElement).toHaveBeenCalledWith("sid-a", el);
    expect(streamsStore.attachVideoElement).toHaveBeenCalledWith("sid-b", el);
    const detachOrder = streamsStore.detachVideoElement.mock.invocationCallOrder[0];
    const attachOrder = streamsStore.attachVideoElement.mock.invocationCallOrder[1];
    expect(detachOrder).toBeLessThan(attachOrder);
  });

  it("update com mesmo sid não faz nada", () => {
    const action = videoAttach(el, "sid-a")!;
    action.update!("sid-a");
    expect(streamsStore.detachVideoElement).not.toHaveBeenCalled();
    expect(streamsStore.attachVideoElement).toHaveBeenCalledTimes(1);
  });

  it("destroy apos update libera o sid atual", () => {
    const action = videoAttach(el, "sid-a")!;
    action.update!("sid-b");
    action.destroy?.();
    expect(streamsStore.detachVideoElement).toHaveBeenLastCalledWith("sid-b", el);
  });
});
