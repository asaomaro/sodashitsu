import { afterEach, expect, it, vi } from "vitest";
import { DesktopFrameChain, type DesktopFrameInfo } from "@sodashitsu/protocol";
import { renderDesktopUpdate } from "./render.js";
afterEach(() => vi.unstubAllGlobals());
const full: DesktopFrameInfo = {
  seq: 1,
  width: 128,
  height: 64,
  format: "image/jpeg",
  captureMs: 0,
  encodeMs: 0,
  contentId: "a".repeat(64),
};
function fixture() {
  const chain = new DesktopFrameChain();
  chain.accept(full);
  const drawImage = vi.fn();
  const canvas = {
    width: 128,
    height: 64,
    getContext: () => ({ drawImage }),
  } as unknown as HTMLCanvasElement;
  const frame = {
    info: {
      ...full,
      seq: 2,
      format: "image/png" as const,
      contentId: "b".repeat(64),
      update: {
        kind: "patch" as const,
        baseSeq: 1,
        patches: [
          { x: 0, y: 0, width: 32, height: 32, offset: 0, length: 1 },
          { x: 96, y: 32, width: 32, height: 32, offset: 1, length: 1 },
        ],
      },
    },
    image: new Uint8Array([1, 2]),
  };
  return { chain, canvas, drawImage, frame };
}
it("does not partially draw or advance the chain when a later patch fails decoding", async () => {
  const { chain, canvas, drawImage, frame } = fixture();
  const bitmap = { width: 32, height: 32, close: vi.fn() };
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValueOnce(bitmap).mockRejectedValueOnce(new Error("decode failed")),
  );
  await expect(renderDesktopUpdate(canvas, frame, chain, () => true)).rejects.toThrow(
    "decode failed",
  );
  expect(drawImage).not.toHaveBeenCalled();
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(chain.last?.seq).toBe(1);
  expect([canvas.width, canvas.height]).toEqual([128, 64]);
});
it("discards decoded images from an expired connection before touching its canvas", async () => {
  const { chain, canvas, drawImage, frame } = fixture();
  const bitmap = { width: 32, height: 32, close: vi.fn() };
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  expect(await renderDesktopUpdate(canvas, frame, chain, () => false)).toBe(false);
  expect(drawImage).not.toHaveBeenCalled();
  expect(bitmap.close).toHaveBeenCalledTimes(2);
  expect(chain.last?.seq).toBe(1);
});
