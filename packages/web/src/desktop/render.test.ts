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

it("decodes patches concurrently while retaining atomic drawing and patch order", async()=>{
  const {chain,canvas,drawImage,frame}=fixture();
  const first={width:32,height:32,close:vi.fn()},second={width:32,height:32,close:vi.fn()};
  let resolveFirst!:(value:typeof first)=>void,resolveSecond!:(value:typeof second)=>void;
  const decode=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{resolveFirst=resolve;})).mockImplementationOnce(()=>new Promise(resolve=>{resolveSecond=resolve;}));
  vi.stubGlobal("createImageBitmap",decode);
  const rendering=renderDesktopUpdate(canvas,frame,chain,()=>true);
  expect(decode).toHaveBeenCalledTimes(2);
  resolveSecond(second);await Promise.resolve();expect(drawImage).not.toHaveBeenCalled();
  resolveFirst(first);await expect(rendering).resolves.toBe(true);
  expect(drawImage.mock.calls).toEqual([[first,0,0],[second,96,32]]);
  expect(first.close).toHaveBeenCalledOnce();expect(second.close).toHaveBeenCalledOnce();
});
it("closes late successful bitmaps after an earlier concurrent decoder rejects",async()=>{
  const {chain,canvas,drawImage,frame}=fixture();const bitmap={width:32,height:32,close:vi.fn()};
  let finish!:(value:typeof bitmap)=>void;
  vi.stubGlobal("createImageBitmap",vi.fn().mockRejectedValueOnce(new Error("first failed")).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})));
  const rendering=renderDesktopUpdate(canvas,frame,chain,()=>true);
  const rejected=expect(rendering).rejects.toThrow("first failed");
  await Promise.resolve();expect(bitmap.close).not.toHaveBeenCalled();finish(bitmap);await rejected;
  expect(bitmap.close).toHaveBeenCalledOnce();expect(drawImage).not.toHaveBeenCalled();expect(chain.last?.seq).toBe(1);
});
