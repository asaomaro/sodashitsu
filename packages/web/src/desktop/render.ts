import { DesktopFrameChain, type decodeDesktopFrame } from "@sodashitsu/protocol";

/** Validate and decode all patches before touching the displayed canvas. Never resize for a delta. */
export async function renderDesktopUpdate(
  canvas: HTMLCanvasElement,
  frame: ReturnType<typeof decodeDesktopFrame>,
  chain: DesktopFrameChain,
  current: () => boolean,
): Promise<boolean> {
  const { info, image } = frame,
    update = info.update;
  const bitmaps: { bitmap: ImageBitmap; x: number; y: number }[] = [];
  try {
    if (update?.kind !== "unchanged") {
      const patches =
        update?.kind === "patch"
          ? update.patches
          : [
              {
                x: 0,
                y: 0,
                width: info.width,
                height: info.height,
                offset: 0,
                length: image.length,
              },
            ];
      // The protocol caps this batch at eight patches. Wait for every decoder
      // before drawing or closing resources, including when an earlier one fails.
      const decoded = await Promise.allSettled(patches.map(async (p) => ({
        bitmap: await createImageBitmap(
          new Blob([image.slice(p.offset, p.offset + p.length).buffer as ArrayBuffer], {
            type: info.format,
          }),
        ),
        patch: p,
      })));
      let failure: unknown;
      let failed = false;
      for (const result of decoded) {
        if (result.status === "rejected") {
          if (!failed) failure = result.reason;
          failed = true;
          continue;
        }
        const {bitmap, patch: p} = result.value;
        bitmaps.push({bitmap, x:p.x, y:p.y});
        if (bitmap.width !== p.width || bitmap.height !== p.height) {
          if (!failed) failure = new Error("画像の大きさが不正です");
          failed = true;
        }
      }
      if (failed) throw failure;
    }
    if (!current()) return false;
    if (update && (canvas.width !== info.width || canvas.height !== info.height))
      throw new Error("差分画像の基準サイズが一致しません");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("描画できません");
    chain.accept(info);
    if (!update) {
      canvas.width = info.width;
      canvas.height = info.height;
    }
    for (const p of bitmaps) ctx.drawImage(p.bitmap, p.x, p.y);
    return true;
  } finally {
    for (const p of bitmaps) p.bitmap.close();
  }
}
