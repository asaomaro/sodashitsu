import { describe, expect, it, vi } from "vitest";
import {
  canReadClipboardByKey,
  imageFromDataTransfer,
  readClipboardForPaste,
  readClipboardImage,
  type ClipboardNavigator,
} from "./clipboard.js";

/** `ClipboardItem` の代わり（types と getType だけ）。 */
function item(entries: Record<string, Blob | string>): ClipboardItem {
  return {
    types: Object.keys(entries),
    presentationStyle: "unspecified",
    getType: vi.fn(async (t: string) => {
      const v = entries[t];
      if (v === undefined) throw new Error("NotFoundError");
      return typeof v === "string" ? new Blob([v], { type: t }) : v;
    }),
  } as unknown as ClipboardItem;
}

function navWith(opts: {
  read?: () => Promise<ClipboardItems>;
  readText?: () => Promise<string>;
  state?: PermissionState | "throw";
  noPermissions?: boolean;
}): ClipboardNavigator {
  return {
    clipboard: {
      ...(opts.read ? { read: opts.read } : {}),
      ...(opts.readText ? { readText: opts.readText } : {}),
    },
    ...(opts.noPermissions
      ? {}
      : {
          permissions: {
            query: vi.fn(async () => {
              if (opts.state === "throw")
                throw new TypeError(
                  "'clipboard-read' is not a valid value for enumeration PermissionName.",
                );
              return { state: opts.state ?? "granted" } as PermissionStatus;
            }),
          },
        }),
  };
}

const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" });

describe("canReadClipboardByKey（decisions D6）", () => {
  const read = async (): Promise<ClipboardItems> => [];
  it("Chromium で granted・prompt なら真", async () => {
    await expect(canReadClipboardByKey(navWith({ read, state: "granted" }))).resolves.toBe(true);
    await expect(canReadClipboardByKey(navWith({ read, state: "prompt" }))).resolves.toBe(true);
  });
  it("denied なら偽", async () => {
    await expect(canReadClipboardByKey(navWith({ read, state: "denied" }))).resolves.toBe(false);
  });
  it("clipboard-read を問い合わせられない（Firefox・Safari は投げる）なら偽", async () => {
    await expect(canReadClipboardByKey(navWith({ read, state: "throw" }))).resolves.toBe(false);
  });
  it("read が無い（HTTP）・permissions が無いなら偽", async () => {
    await expect(canReadClipboardByKey(navWith({ state: "granted" }))).resolves.toBe(false);
    await expect(canReadClipboardByKey(navWith({ read, noPermissions: true }))).resolves.toBe(
      false,
    );
    await expect(canReadClipboardByKey({})).resolves.toBe(false);
  });
});

describe("readClipboardImage", () => {
  it("画像とテキストがあっても画像を返す（PNG を優先）", async () => {
    const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });
    const n = navWith({
      read: async () => [
        item({ "text/plain": "hello", "image/jpeg": jpeg }),
        item({ "image/png": png }),
      ],
    });
    await expect(readClipboardImage(n)).resolves.toBe(png);
  });
  it("種類が空の Blob は宣言された種類で包み直す", async () => {
    const untyped = new Blob([new Uint8Array([1])]);
    const got = await readClipboardImage(
      navWith({ read: async () => [item({ "image/png": untyped })] }),
    );
    expect(got?.type).toBe("image/png");
  });
  it("画像が無い・read が投げる・read が無いなら null", async () => {
    await expect(
      readClipboardImage(navWith({ read: async () => [item({ "text/plain": "x" })] })),
    ).resolves.toBeNull();
    await expect(
      readClipboardImage(
        navWith({ read: async () => Promise.reject(new Error("NotAllowedError")) }),
      ),
    ).resolves.toBeNull();
    await expect(readClipboardImage(navWith({}))).resolves.toBeNull();
  });
  it("BMP 等の 4 種類以外は読まない", async () => {
    const bmp = new Blob([new Uint8Array([0x42, 0x4d])], { type: "image/bmp" });
    await expect(
      readClipboardImage(navWith({ read: async () => [item({ "image/bmp": bmp })] })),
    ).resolves.toBeNull();
  });
});

describe("readClipboardForPaste（Ctrl+Shift+V・メニュー）", () => {
  it("テキストがあればテキスト（画像より優先）", async () => {
    const n = navWith({ read: async () => [item({ "image/png": png, "text/plain": "hello" })] });
    await expect(readClipboardForPaste(n)).resolves.toEqual({ kind: "text", text: "hello" });
  });
  it("テキストが無く（空を含む）画像があれば画像", async () => {
    const n = navWith({ read: async () => [item({ "text/plain": "", "image/png": png })] });
    await expect(readClipboardForPaste(n)).resolves.toEqual({ kind: "image", blob: png });
  });
  it("read が無ければ今までどおり readText（空なら null）", async () => {
    await expect(readClipboardForPaste(navWith({ readText: async () => "t" }))).resolves.toEqual({
      kind: "text",
      text: "t",
    });
    await expect(readClipboardForPaste(navWith({ readText: async () => "" }))).resolves.toBeNull();
    await expect(
      readClipboardForPaste(navWith({ readText: async () => Promise.reject(new Error("x")) })),
    ).resolves.toBeNull();
    await expect(readClipboardForPaste({})).resolves.toBeNull();
  });
  it("read が投げれば null（readText へは落ちない＝Firefox で 2 度「ペースト」を出さない）", async () => {
    const readText = vi.fn(async () => "t");
    await expect(
      readClipboardForPaste(
        navWith({ read: async () => Promise.reject(new Error("x")), readText }),
      ),
    ).resolves.toBeNull();
    expect(readText).not.toHaveBeenCalled();
  });
});

/** `DataTransfer` の代わり。 */
function dt(text: string, files: File[], opts: { itemsless?: boolean } = {}): DataTransfer {
  return {
    getData: (t: string) => (t === "text/plain" ? text : ""),
    items: opts.itemsless
      ? undefined
      : files.map((f) => ({ kind: "file", type: f.type, getAsFile: () => f })),
    files,
  } as unknown as DataTransfer;
}

describe("imageFromDataTransfer（paste イベント）", () => {
  const pngFile = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
  const gifFile = new File([new Uint8Array([1])], "a.gif", { type: "image/gif" });
  it("テキストが無く画像があれば画像（PNG を優先）", () => {
    expect(imageFromDataTransfer(dt("", [gifFile, pngFile]))).toBe(pngFile);
    expect(imageFromDataTransfer(dt("", [gifFile]))).toBe(gifFile);
  });
  it("テキストがあれば null（xterm.js に任せる）", () => {
    expect(imageFromDataTransfer(dt("hello", [pngFile]))).toBeNull();
  });
  it("画像が無い・4 種類以外・clipboardData が無いなら null", () => {
    expect(imageFromDataTransfer(dt("", []))).toBeNull();
    expect(
      imageFromDataTransfer(dt("", [new File(["x"], "a.txt", { type: "text/plain" })])),
    ).toBeNull();
    expect(imageFromDataTransfer(null)).toBeNull();
  });
  it("items が無いブラウザでは files を見る", () => {
    expect(imageFromDataTransfer(dt("", [pngFile], { itemsless: true }))).toBe(pngFile);
  });
});
