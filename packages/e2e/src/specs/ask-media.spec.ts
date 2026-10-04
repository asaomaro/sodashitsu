import { createServer } from "node:net";
import { symlink, truncate } from "node:fs/promises";
import type { ImageFetcher } from "@sodashitsu/server";
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { runAsk } from "../support/ask.js";
import { dialog, setup } from "../support/askForm.js";
import { EVIL_SVG, makePng, makeMediaDir, makeWav } from "../support/media.js";

/**
 * 画像・音・コードのプレビュー（20261004-ask-media-popup の AC1〜AC5・AC12〜AC14・AC18）の E2E。ビルドした `sodactl` を子プロセスで起動し、合否はブラウザの側で見る
 * （`e2e-observe-browser`）: 部品の Shadow DOM の `img` の `naturalWidth`・`currentSrc`、ブラウザの `securitypolicyviolation`、ブラウザが出したリクエスト、
 * `window` の印、`sodactl` の標準出力と終了コード。
 *
 * 音は聞けないので、代わりに `window.Audio` を包んで、部品が渡した `src`（`data:` で始まるか）と `play()` の呼び出しを観測する（`media-src` の違反も数える）。
 */

/** ページの CSP 違反（`securitypolicyviolation`）を数える。アプリ自身が出す違反（端末の描画の `eval`）は最初からあるので、増えた分を見る。 */
async function watchViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => void w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  return () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
}

const imgs = (page: Page) =>
  page.locator("ask-form").evaluate((f) =>
    Array.from(f.shadowRoot!.querySelectorAll("img")).map((i) => ({ src: i.getAttribute("src") ?? "", currentSrc: i.currentSrc, naturalWidth: i.naturalWidth, complete: i.complete })),
  );

test("ローカルの画像・コード（diff）・分類・thumb・preview が、画面内のダイアログで描かれる。CSP の違反は増えない（AC1・AC2）", async ({ page, appServer }) => {
  const media = await makeMediaDir();
  try {
    const violations = await watchViolations(page);
    const p1 = await setup(page, appServer);
    const baseline = (await violations()).length;
    const a = await media.write("a.png", makePng(48, 32, [200, 60, 60]));
    const b = await media.write("b.png", makePng(64, 40, [60, 60, 200]));
    const run = await runAsk(appServer, p1, {
      title: "画面案",
      questions: [
        {
          id: "layout",
          label: "画面の案",
          default: "a",
          thumb: 90,
          preview: "inline",
          options: [
            { value: "a", label: "案A", image: a, group: "縦" },
            { value: "b", label: "案B", image: b, group: "横" },
          ],
        },
        {
          id: "impl",
          label: "実装",
          default: "x",
          options: [
            { value: "x", label: "X", lang: "diff", code: "@@ -1 +1 @@\n-old\n+new\n" },
            { value: "y", label: "Y", code: "plain" },
          ],
        },
      ],
    });
    await expect(dialog(page)).toBeVisible();
    // 画像が実際に描かれた（デコードできて幅がある）。参照は data:（サーバから受けたバイト列）で、外のリクエストではない。
    await expect.poll(async () => (await imgs(page)).filter((i) => i.naturalWidth > 0).length).toBeGreaterThanOrEqual(2);
    const shown = (await imgs(page)).filter((i) => i.src !== "");
    expect(shown.every((i) => i.src.startsWith("data:image/png;base64,") && i.currentSrc.startsWith("data:image/png;base64,"))).toBe(true);
    expect(shown.map((i) => i.naturalWidth).sort()).toEqual(expect.arrayContaining([48, 64]));
    // コード（diff）は textContent で出て、+ - の行が色分けされる（部品の機能）。分類の見出し・thumb の変数が効いている。
    await expect(page.locator("ask-form")).toContainText("案A");
    expect(await page.locator("ask-form").evaluate((f) => f.shadowRoot!.querySelectorAll(".grp").length)).toBeGreaterThanOrEqual(2);
    expect(await page.locator("ask-form").evaluate((f) => (f.shadowRoot!.querySelector(".opts") as HTMLElement).style.getPropertyValue("--thumb"))).toBe("90px");
    expect((await violations()).slice(baseline)).toEqual([]);
    await page.keyboard.press("Control+Enter");
    expect((await run.done).json).toEqual({ status: "answered", answers: { layout: "a", impl: "x" } });
  } finally {
    await media.cleanup();
  }
});

test("音: 試聴を押すと data: の音源が Audio に渡り play() が呼ばれる。media-src の違反は出ない（AC2。音は聞けないので Audio を包んで観測する）", async ({ page, appServer }) => {
  const media = await makeMediaDir();
  try {
    await page.addInitScript(() => {
      const w = window as unknown as { __audio: { src: string; plays: number }[] };
      w.__audio = [];
      const Real = window.Audio;
      // 実際の再生は聞けない・環境依存なので、`src` と `play()` の呼び出しだけを記録して、再生は成功したことにする。
      window.Audio = function (src?: string) {
        const rec = { src: String(src ?? ""), plays: 0 };
        w.__audio.push(rec);
        const a = new Real(src);
        a.play = () => {
          rec.plays++;
          return Promise.resolve();
        };
        return a;
      } as unknown as typeof Audio;
    });
    const violations = await watchViolations(page);
    const p1 = await setup(page, appServer);
    const baseline = (await violations()).length;
    const wav = await media.write("a.wav", makeWav());
    const run = await runAsk(appServer, p1, { questions: [{ id: "s", label: "音", default: "a", options: [{ value: "a", label: "A", audio: wav }, { value: "b", label: "B" }] }] });
    await expect(dialog(page)).toBeVisible();
    await page.locator("ask-form button.play").first().click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __audio: { src: string; plays: number }[] }).__audio)).toEqual([{ src: expect.stringMatching(/^data:audio\/wav;base64,/), plays: 1 }]);
    expect((await violations()).slice(baseline)).toEqual([]);
    await page.keyboard.press("Control+Enter");
    expect((await run.done).json).toMatchObject({ status: "answered" });
  } finally {
    await media.cleanup();
  }
});

test("SVG は <img> で描かれ、中のスクリプトは動かない（AC5）。SVG を開く経路（iframe・a・window.open）を画面は作らない", async ({ page, appServer }) => {
  const media = await makeMediaDir();
  try {
    const violations = await watchViolations(page);
    const p1 = await setup(page, appServer);
    const baseline = (await violations()).length;
    const svg = await media.write("evil.svg", EVIL_SVG);
    const run = await runAsk(appServer, p1, { questions: [{ id: "s", label: "S", default: "a", options: [{ value: "a", label: "A", image: svg }, { value: "b", label: "B" }] }] });
    await expect(dialog(page)).toBeVisible();
    await expect.poll(async () => (await imgs(page)).filter((i) => i.naturalWidth === 40).length).toBeGreaterThanOrEqual(1);
    expect((await imgs(page)).find((i) => i.naturalWidth === 40)!.src).toMatch(/^data:image\/svg\+xml;base64,/);
    // スクリプトは動いていない（動けば window.__svgScript が立つ）。iframe・object・embed・a は無い（SVG を文書として開く経路が無い）。
    expect(await page.evaluate(() => (window as unknown as { __svgScript?: number }).__svgScript)).toBeUndefined();
    expect(await page.locator("dialog#soda-ask-dialog iframe, dialog#soda-ask-dialog object, dialog#soda-ask-dialog embed").count()).toBe(0);
    expect(await page.locator("ask-form").evaluate((f) => f.shadowRoot!.querySelectorAll("iframe, object, embed, a[href]").length)).toBe(0);
    expect((await violations()).slice(baseline)).toEqual([]);
    await page.keyboard.press("Control+Enter");
    await run.done;
  } finally {
    await media.cleanup();
  }
});

test("負の対照: 存在しない・.png の名のテキスト・/etc/passwd へのリンク・許可外の拡張子・相対でない参照以外は、窓にも画面にも出さず終了コード 2（AC3）", async ({ page, appServer }) => {
  const media = await makeMediaDir();
  try {
    const p1 = await setup(page, appServer);
    const fake = await media.write("fake.png", "root:x:0:0:root:/root:/bin/bash\n");
    const note = await media.write("note.txt", "x");
    await symlink("/etc/passwd", media.path("passwd.png"));
    const cases: [string, string, RegExp][] = [
      ["存在しない", media.path("missing.png"), /file not found/],
      ["偽装", fake, /does not match/],
      ["passwd へのリンク", media.path("passwd.png"), /does not match/],
      ["許可外の拡張子", note, /extension/],
      ["http", "http://example.com/a.png", /image must be/],
      ["file:", "file:///etc/passwd", /image must be/],
    ];
    for (const [name, image, re] of cases) {
      const r = await (await runAsk(appServer, p1, { questions: [{ id: "q", label: "Q", options: [{ value: "a", image }] }] })).done;
      expect(r.code, name).toBe(2);
      expect(r.stderr, name).toMatch(re);
      expect(r.stdout, name).toBe("");
    }
    await expect(dialog(page)).toHaveCount(0);
    // サーバ側の検査も対象（sodactl の事前確認を通るもの）: passwd へのリンクは stat では通常ファイル。出ない・誤りで返ることを上で見た。
  } finally {
    await media.cleanup();
  }
});

test("負の対照: 上限を超える定義は、窓へ落ちず理由つきのエラー（終了コード 2）になり、ダイアログは出ない。上限ちょうどは通る（AC4）", async ({ page, appServer }) => {
  const media = await makeMediaDir();
  try {
    const p1 = await setup(page, appServer);
    // 大きいファイルは sparse（truncate）で作る。種類の確認の前に、大きさで断られる。
    const big = media.path("big.png");
    await media.write("big.png", makePng(2, 2));
    await truncate(big, 8 * 1024 * 1024 + 1);
    const r1 = await (await runAsk(appServer, p1, { questions: [{ id: "q", label: "Q", options: [{ value: "a", image: big }] }] })).done;
    expect([r1.code, r1.stderr]).toEqual([2, expect.stringMatching(/larger than 8388608/)]);
    // 合計 24 MiB 超（8 MiB を 4 つ）
    const files: string[] = [];
    for (const n of ["1", "2", "3", "4"]) {
      const f = media.path(`m${n}.png`);
      await media.write(`m${n}.png`, makePng(2, 2));
      await truncate(f, 8 * 1024 * 1024);
      files.push(f);
    }
    const r2 = await (await runAsk(appServer, p1, { questions: [{ id: "q", label: "Q", options: files.map((f, i) => ({ value: String(i), image: f })) }] })).done;
    expect([r2.code, r2.stderr]).toEqual([2, expect.stringMatching(/in total/)]);
    // 33 個（サーバが上限ちょうどの 32 個を通すことは AskMedia の単体テストが見ている）
    const many: string[] = [];
    for (let i = 0; i < 33; i++) many.push(await media.write(`n${i}.png`, makePng(1 + i, 1)));
    const r3 = await (await runAsk(appServer, p1, { questions: [{ id: "q", label: "Q", options: many.map((f, i) => ({ value: String(i), image: f })) }] })).done;
    expect([r3.code, r3.stderr]).toEqual([2, expect.stringMatching(/more than 32/)]);
    await expect(dialog(page)).toHaveCount(0);
  } finally {
    await media.cleanup();
  }
});

test.describe("外部 URL の画像（偽の取得を差し替え）", () => {
  const fetched: string[] = [];
  const png = makePng(30, 20, [20, 160, 80]);
  const fetcher: ImageFetcher = {
    fetchImage: async (url) => {
      fetched.push(url);
      if (url.includes("gone")) throw new Error("404");
      return { bytes: png, contentType: "image/png" };
    },
  };
  test.use({ askImageFetcher: fetcher });

  test("サーバが取った画像が data: で出て、ブラウザは画像の取得先へリクエストしない。失敗した画像は画像なしで出て件数が固定の行に出る（AC12・AC13）", async ({ page, appServer }) => {
    fetched.length = 0;
    const requested: string[] = [];
    page.on("request", (r) => void requested.push(r.url()));
    const violations = await watchViolations(page);
    const p1 = await setup(page, appServer);
    const baseline = (await violations()).length;
    const run = await runAsk(appServer, p1, {
      questions: [{ id: "q", label: "Q", default: "a", options: [{ value: "a", label: "A", image: "https://img.example.test/a.png" }, { value: "b", label: "B", image: "https://img.example.test/gone.png" }] }],
    });
    await expect(dialog(page)).toBeVisible();
    await expect.poll(async () => (await imgs(page)).filter((i) => i.naturalWidth === 30).length).toBeGreaterThanOrEqual(1);
    expect((await imgs(page)).find((i) => i.naturalWidth === 30)!.currentSrc).toMatch(/^data:image\/png;base64,/);
    await expect(page.locator("[data-ask-warnings]")).toHaveText("画像 1 件を取得できませんでした（プレビューなしで出しています）");
    // サーバ（soda）が取りに行った。ブラウザは取得先へ何も出していない。
    expect(fetched.sort()).toEqual(["https://img.example.test/a.png", "https://img.example.test/gone.png"]);
    expect(requested.filter((u) => u.includes("img.example.test"))).toEqual([]);
    expect((await violations()).slice(baseline)).toEqual([]);
    await page.keyboard.press("Control+Enter");
    expect((await run.done).json).toMatchObject({ status: "answered", answers: { q: "a" } });
  });
});

test("SSRF: 内部・メタデータ・ループバックの宛先の画像は、実物の取得が接続せずに拒否し、画像なしで出る（AC14）", async ({ page, appServer }) => {
  const p1 = await setup(page, appServer);
  const targets = ["https://127.0.0.1/a.png", "https://169.254.169.254/latest/meta-data/x.png", "https://10.0.0.1/a.png", "https://[::1]/a.png", "https://localhost/a.png", "http://example.com/a.png"];
  const https = targets.filter((t) => t.startsWith("https:"));
  const run = await runAsk(appServer, p1, { questions: [{ id: "q", label: "Q", default: "o0", options: https.map((u, i) => ({ value: `o${i}`, label: `O${i}`, image: u })) }] });
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator("[data-ask-warnings]")).toHaveText(`画像 ${https.length} 件を取得できませんでした（プレビューなしで出しています）`);
  expect((await imgs(page)).filter((i) => i.src !== "")).toEqual([]);
  await page.keyboard.press("Control+Enter");
  expect((await run.done).json).toMatchObject({ status: "answered" });
  // 対照（接続が届かない）: 実際に待ち受けているローカルの port へ向けても、サーバは接続しない（IP の検査と 443 以外の拒否）。
  let connections = 0;
  const listener = createServer((sock) => {
    connections++;
    sock.destroy();
  });
  await new Promise<void>((r) => listener.listen(0, "127.0.0.1", r));
  try {
    const port = (listener.address() as { port: number }).port;
    const run2 = await runAsk(appServer, p1, { questions: [{ id: "q", label: "Q", default: "a", options: [{ value: "a", image: `https://127.0.0.1:${port}/a.png` }, { value: "b", image: `https://localhost:${port}/a.png` }] }] });
    // 443 以外のポートは定義の検査で断られる（終了コード 2）＝接続の前
    expect((await run2.done).code).toBe(2);
    await new Promise((r) => setTimeout(r, 300));
    expect(connections).toBe(0);
  } finally {
    listener.close();
  }
  // http:// は定義の誤り（終了コード 2）
  const bad = await (await runAsk(appServer, p1, { questions: [{ id: "q", label: "Q", options: [{ value: "a", image: "http://example.com/a.png" }] }] })).done;
  expect(bad.code).toBe(2);
});

test("sodactl ask --features は、sodactl とサーバの機能と上限を 1 行の JSON で返す（AC18）", async ({ appServer }) => {
  const r = await (await runAsk(appServer, (await appServer.openClient()).helloSnapshot()!.panes[0]!.id, "", ["--features"])).done;
  expect(r.code).toBe(0);
  expect(r.json).toMatchObject({
    sodactl: expect.arrayContaining(["media", "view", "types:edit", "types:rank", "types:table", "remote-image"]),
    limits: { fileBytes: 8 * 1024 * 1024, totalBytes: 24 * 1024 * 1024, files: 32, serverBytes: 128 * 1024 * 1024 },
    server: { features: expect.arrayContaining(["media", "view"]), limits: { files: 32 } },
  });
});
