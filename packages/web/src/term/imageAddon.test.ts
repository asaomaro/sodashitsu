import { ImageAddon } from "@xterm/addon-image";
import { describe, expect, it } from "vitest";
import { IMAGE_ADDON_OPTIONS, createImageAddon } from "./imageAddon.js";

describe("imageAddon（20260926-kitty-graphics の AC6・AC10・decisions D5）", () => {
  it("応答を出す画素の報告を切り、上限を置いた設定", () => {
    expect(IMAGE_ADDON_OPTIONS).toEqual({
      enableSizeReports: false,
      storageLimit: 16,
      pixelLimit: 16_777_216,
      sixelSupport: true,
      sixelSizeLimit: 12_000_000,
      iipSupport: true,
      iipSizeLimit: 20_000_000,
    });
  });

  it("サーバが送る画像の上限より、ブラウザの 1 枚の上限が大きい（サーバが送ったものを捨てない）", () => {
    expect(IMAGE_ADDON_OPTIONS.iipSizeLimit).toBeGreaterThan(16 * 1024 * 1024); // サーバの PNG は 16 MiB 以下
    expect(IMAGE_ADDON_OPTIONS.pixelLimit).toBeGreaterThan(4 * 4_194_304 - 1); // 表示の箱 4,194,304 画素の 4 倍
  });

  it("実物の ImageAddon を、設定を渡して作る", () => {
    const addon = createImageAddon();
    expect(addon).toBeInstanceOf(ImageAddon);
    const opts = (addon as unknown as { _opts: Record<string, unknown> })._opts;
    expect(opts).toMatchObject({ ...IMAGE_ADDON_OPTIONS });
  });
});
