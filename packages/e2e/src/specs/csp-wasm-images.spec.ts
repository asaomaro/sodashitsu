import { crc32, deflateSync } from "node:zlib";
import type { Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { focusTerminal, typeLine } from "../support/keys.js";

/**
 * アプリ本体の CSP（`HttpServer.ts`）と、端末内の画像（`@xterm/addon-image`。Sixel の復号が WebAssembly を使う）。
 * 判定はブラウザ側の観測: ページのエラー（`pageerror`）と、画像の層（`xterm-image-layer` の canvas）ができたか。
 * 端末の文字は WebGL で描かれて DOM から読めないので、画像は「層の canvas」の有無で見る（固定時間の待ちだけを根拠にしない）。
 */

function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8 bit・RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0)]);
  for (let x = 0; x < width; x++) row[1 + x * 3] = 255; // 赤
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const imageLayers = (page: Page): Promise<number> => page.locator(".xterm canvas.xterm-image-layer").count();

async function open(page: Page, appServer: AppServer): Promise<string[]> {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);
  return pageErrors;
}

/** 端末に出力させる。シェルの printf に任せる（エスケープは printf が解く）。 */
async function emit(page: Page, printfArg: string): Promise<void> {
  await typeLine(page, `printf '${printfArg}'`);
}

test("ページを開いても WebAssembly の例外（CSP 違反）が出ない", async ({ page, appServer }) => {
  const pageErrors = await open(page, appServer);
  // addon は端末ができるときに読み込まれる。端末が使える状態になってから、少し待っても例外が無いことを見る。
  await page.waitForFunction(() => document.querySelectorAll(".xterm canvas").length > 0);
  await page.waitForTimeout(500);
  expect(pageErrors).toEqual([]);
});

/** ページのスクリーンショットの中の、純粋な赤（255, 0, 0）の画素の数。画像の層の canvas は 2D コンテキストから読めない（全画素 0）ので、見えている画面で数える。 */
async function redPixels(page: Page): Promise<number> {
  const shot = await page.screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 0) n++;
    return n;
  }, shot.toString("base64"));
}

test("Sixel を端末に出すと、画像の層ができ、赤の画素が画面に見える（復号の WebAssembly が CSP に拒まれない）", async ({ page, appServer }) => {
  const pageErrors = await open(page, appServer);
  expect(await imageLayers(page), "前提: 出す前は画像の層が無い").toBe(0);
  expect(await redPixels(page), "前提: 出す前は赤の画素が無い").toBe(0);
  // 赤の帯を 5 本（1 本は縦 6 画素。計 30 画素。幅 100 画素）。1 行（セルの高さ）以下の小さな Sixel は、層はできても画素が見えない
  // （test-result.md「見つけたほかの不具合の候補」）ので、1 行より高い画像にする。
  const bands = Array.from({ length: 5 }, () => "#0!100~").join("-");
  await emit(page, String.raw`\033Pq#0;2;100;0;0${bands}\033\\`);
  await expect.poll(() => imageLayers(page), { message: "Sixel の画像の層ができる" }).toBe(1);
  await expect.poll(() => redPixels(page), { message: "赤の画素が画面に見える（1000 超）" }).toBeGreaterThan(1000);
  expect(pageErrors).toEqual([]);
});

test("iTerm2 形式（OSC 1337）の画像を出すと、画像の層ができる", async ({ page, appServer }) => {
  const pageErrors = await open(page, appServer);
  const bytes = png(10, 10);
  await emit(page, String.raw`\033]1337;File=inline=1;size=${bytes.length};width=2;height=1;preserveAspectRatio=0:${bytes.toString("base64")}\a`);
  await expect.poll(() => imageLayers(page), { message: "iTerm2 形式の画像の層ができる" }).toBe(1);
  expect(pageErrors).toEqual([]);
});

test("Kitty graphics（直接転送の PNG）を出すと、サーバが作り直した画像の層ができる", async ({ page, appServer }) => {
  const pageErrors = await open(page, appServer);
  const bytes = png(10, 10);
  await emit(page, String.raw`\033_Ga=T,f=100,t=d,c=2,r=1;${bytes.toString("base64")}\033\\`);
  await expect.poll(() => imageLayers(page), { message: "Kitty graphics の画像の層ができる" }).toBe(1);
  expect(pageErrors).toEqual([]);
});

test("アプリのページでは、JavaScript の eval と new Function は CSP に拒まれたまま（WebAssembly だけが許される）", async ({ page, appServer }) => {
  await open(page, appServer);
  // `page.evaluate` の中身は CDP 経由で動くため、ページの CSP の eval の検査を受けない（実測で eval が通った）。
  // ページ自身のスクリプト（`script-src 'self'` で読み込める同じ origin の JS）として動かして、CSP を受けさせる。
  await page.route(`${appServer.origin}/csp-probe.js`, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
        const attempt = (fn) => { try { fn(); return "許された"; } catch (e) { return e.name; } };
        const out = {
          eval: attempt(() => (0, eval)("1 + 1")),
          newFunction: attempt(() => new Function("return 1")()),
        };
        WebAssembly.compile(new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0])).then(
          () => { out.wasm = "許された"; },
          (e) => { out.wasm = e.name; },
        ).finally(() => { window.__cspProbe = out; });
      `,
    }),
  );
  await page.evaluate(() => {
    const s = document.createElement("script");
    s.src = "/csp-probe.js";
    document.head.appendChild(s);
  });
  await page.waitForFunction(() => (window as unknown as { __cspProbe?: unknown }).__cspProbe !== undefined);
  const result = await page.evaluate(() => (window as unknown as { __cspProbe: { eval: string; newFunction: string; wasm: string } }).__cspProbe);
  expect(result.eval, "eval は拒まれる").toBe("EvalError");
  expect(result.newFunction, "new Function は拒まれる").toBe("EvalError");
  expect(result.wasm, "WebAssembly の組み立ては許される").toBe("許された");
});
