import { afterEach, describe, expect, it, vi } from "vitest";
import { Ocr, type OcrOptions } from "./ocr.js";
import { authorizeLocalSender } from "./security.js";
const png = () =>
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuoAAAAASUVORK5CYII=",
    "base64",
  );
const services: Ocr[] = [];
function fixture(extra: Partial<OcrOptions> = {}) {
  const options: OcrOptions = {
    changed: vi.fn(),
    input: vi.fn(async () => png()),
    crop: vi.fn(() => png()),
    run: vi.fn(async () => "日本語の文字"),
    ...extra,
  };
  const service = new Ocr(options);
  services.push(service);
  service.configure(true, "/usr/bin/tesseract", "jpn+eng");
  return { service, options };
}
afterEach(() => {
  for (const service of services.splice(0)) service.discard();
  vi.useRealTimers();
});
describe("ephemeral OCR", () => {
  it("requires enable, previews before explicit recognition and keeps pixels out of state", async () => {
    const { service, options } = fixture();
    service.configure(false, "", "jpn");
    await expect(service.input(1, "file")).rejects.toThrow("有効");
    service.configure(true, "/usr/bin/tesseract", "jpn+eng");
    const image = await service.input(1, "file");
    expect(image?.uri).toMatch(/^data:image\/png;base64,/);
    expect(options.run).not.toHaveBeenCalled();
    expect(service.snapshot()).not.toHaveProperty("uri");
    await service.run(1, image!.state.imageId!);
    expect(service.snapshot().text).toBe("日本語の文字");
    expect(options.run).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      "/usr/bin/tesseract",
      "jpn+eng",
      expect.any(AbortSignal),
    );
  });
  it("pins image and owner for recognition and crop", async () => {
    const { service, options } = fixture();
    const image = (await service.input(1, "clipboard"))!;
    await expect(service.run(2, image.state.imageId!)).rejects.toThrow("対象");
    expect(() =>
      service.crop(2, image.state.imageId!, { x: 0, y: 0, width: 1, height: 1 }),
    ).toThrow("対象");
    expect(() =>
      service.crop(1, image.state.imageId!, { x: 0, y: 0, width: 2, height: 1 }),
    ).toThrow("範囲");
    const next = service.crop(1, image.state.imageId!, { x: 0, y: 0, width: 1, height: 1 });
    expect(next.state.imageId).not.toBe(image.state.imageId);
    await expect(service.run(1, image.state.imageId!)).rejects.toThrow("対象");
    expect(options.run).not.toHaveBeenCalled();
  });
  it("retains the physical input slot and ignores completion after discard", async () => {
    let finish!: (value: Uint8Array) => void;
    const { service, options } = fixture({
      input: vi.fn(
        () =>
          new Promise<Uint8Array>((resolve) => {
            finish = resolve;
          }),
      ),
    });
    vi.mocked(options.input)
      .mockImplementationOnce(
        () =>
          new Promise<Uint8Array>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(png());
    const request = service.input(1, "clipboard");
    service.discard(1);
    await expect(service.input(2, "file")).rejects.toThrow("完了");
    finish(png());
    expect(await request).toBeNull();
    expect(service.snapshot().imageId).toBeNull();
    expect(options.input).toHaveBeenCalledTimes(1);
    expect(service.snapshot().status).toBe("idle");
  });
  it("aborts recognition and cannot publish old text or overlap a retiring child", async () => {
    let finish!: (value: string) => void;
    let signal!: AbortSignal;
    const { service } = fixture({
      run: vi.fn((_b, _e, _l, s) => {
        signal = s;
        return new Promise<string>((resolve) => {
          finish = resolve;
        });
      }),
    });
    const image = (await service.input(1, "file"))!;
    const request = service.run(1, image.state.imageId!);
    service.discard(1);
    expect(signal.aborted).toBe(true);
    await expect(service.input(1, "file")).rejects.toThrow("完了");
    finish("stale secret");
    await request;
    expect(service.snapshot().text).toBe("");
    expect(service.snapshot().status).toBe("idle");
  });
  it("expires absolute image lifetime even when timer has not run", async () => {
    let now = 0;
    const { service, options } = fixture({ now: () => now });
    const image = (await service.input(1, "file"))!;
    now = 300_000;
    await expect(service.run(1, image.state.imageId!)).rejects.toThrow("期限");
    expect(options.run).not.toHaveBeenCalled();
    expect(service.snapshot().imageId).toBeNull();
  });
  it("settings changes discard pixels and abort pending input", async () => {
    let finish!: (value: Uint8Array) => void;
    const { service } = fixture({
      input: () =>
        new Promise<Uint8Array>((resolve) => {
          finish = resolve;
        }),
    });
    const request = service.input(1, "file");
    service.configure(true, "/another/tesseract", "jpn");
    finish(png());
    await request;
    expect(service.snapshot().imageId).toBeNull();
  });
  it("clears expired result without user action", async () => {
    vi.useFakeTimers();
    const { service } = fixture();
    const image = (await service.input(1, "file"))!;
    await service.run(1, image.state.imageId!);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(service.snapshot().text).toBe("");
    expect(service.snapshot().imageId).toBeNull();
  });
  it("does not permit OCR from settings, character, remote or subframe", () => {
    for (const action of [
      "ocr-state",
      "ocr-file",
      "ocr-clipboard",
      "ocr-crop",
      "ocr-run",
      "ocr-discard",
    ]) {
      const sender = {
        frameUrl: "soda-assistant://app/bubble.html",
        role: "bubble" as const,
        mainFrame: true,
        current: true,
      };
      expect(authorizeLocalSender(sender, action)).toBe(true);
      expect(authorizeLocalSender({ ...sender, mainFrame: false }, action)).toBe(false);
      expect(authorizeLocalSender({ ...sender, current: false }, action)).toBe(false);
      expect(authorizeLocalSender({ ...sender, frameUrl: "https://example.com" }, action)).toBe(
        false,
      );
      for (const role of ["settings", "character"] as const)
        expect(
          authorizeLocalSender(
            { ...sender, role, frameUrl: `soda-assistant://app/${role}.html` },
            action,
          ),
        ).toBe(false);
    }
  });
});

it("cannot revive an expired or discarded image after native crop returns", async () => {
  let now = 0;
  const { service } = fixture({
    now: () => now,
    crop: () => {
      now = 300_000;
      return png();
    },
  });
  const image = (await service.input(1, "file"))!;
  expect(() => service.crop(1, image.state.imageId!, { x: 0, y: 0, width: 1, height: 1 })).toThrow(
    "期限",
  );
  expect(service.snapshot().imageId).toBeNull();
  const other = fixture({
    crop: () => {
      other.discard();
      return png();
    },
  }).service;
  const next = (await other.input(1, "file"))!;
  expect(() => other.crop(1, next.state.imageId!, { x: 0, y: 0, width: 1, height: 1 })).toThrow(
    "対象",
  );
  expect(other.snapshot().imageId).toBeNull();
});
