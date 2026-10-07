import { describe, expect, it, vi } from "vitest";
import type { Room } from "livekit-client";
import { publishData } from "./livekit-data";

function fakeRoom(publish = vi.fn().mockResolvedValue(undefined)) {
  return { room: { localParticipant: { publishData: publish } } as unknown as Room, publish };
}

describe("publishData", () => {
  it("no-op sem room", () => {
    expect(() => publishData(null, { type: "x" })).not.toThrow();
  });

  it("publica JSON encoded com reliable:true", () => {
    const { room, publish } = fakeRoom();
    publishData(room, { type: "viewership", watching: true });
    expect(publish).toHaveBeenCalledTimes(1);
    const [payload, opts] = publish.mock.calls[0]!;
    expect(JSON.parse(new TextDecoder().decode(payload))).toEqual({
      type: "viewership",
      watching: true,
    });
    expect(opts).toEqual({ reliable: true });
  });

  it("erro de publish é engolido com log (não lança)", async () => {
    const { room } = fakeRoom(vi.fn().mockRejectedValue(new Error("net")));
    expect(() => publishData(room, { type: "x" })).not.toThrow();
    await Promise.resolve();
  });
});
