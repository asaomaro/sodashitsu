import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { runAsk } from "../support/ask.js";
import { dialog, q, setup } from "../support/askForm.js";
import { EVIL_SVG, makeMediaDir, makePng } from "../support/media.js";

/**
 * 成果物（`view`: text・image・markdown・html）の隔離表示（20261004-ask-media-popup の AC8〜AC11・AC-I1〜AC-I5）の E2E。ビルドした `sodactl` を子プロセスで起動し、
 * 合否はブラウザの側の実測で見る（`e2e-observe-browser`）: iframe の `sandbox` 属性・枠の中のスクリプトの実行結果（`parent.document` の SecurityError・`fetch` の拒否など）・
 * コンソールの CSP 違反・枠の中のキーが親へ届いた結果（`sodactl` の `cancelled`・`answered`）・要素の位置。
 */

const frameOf = (page: Page) => page.frameLocator("iframe[data-ask-view-frame]");
const SPEC = (view: unknown, extra: Record<string, unknown> = {}) => ({
  title: "確認",
  view,
  questions: [q("ok", { label: "進めますか" })],
  ...extra,
});

/**
 * 隔離の実測（枠の中で動かす）。結果は JSON 文字列で返る。`isolated` は「枠の中のスクリプトから、アプリに触れなかった」。
 * 枠の外（アプリのページ）で同じ関数を動かすと全部触れる——その対照で、この検査が「触れない」を測れていることを確かめる。
 */
const PROBE = `(async () => {
  const r = {};
  try { r.parentDocument = String(parent.document.title).slice(0, 5); } catch (e) { r.parentDocument = e.name; }
  try { r.localStorage = String(localStorage.length); } catch (e) { r.localStorage = e.name; }
  try { r.cookie = document.cookie === '' ? 'empty' : 'has'; } catch (e) { r.cookie = e.name; }
  try { r.topLocation = String(top.location.href).slice(0, 4); } catch (e) { r.topLocation = e.name; }
  try { const res = await fetch('/api/session'); r.fetch = 'status' + res.status; } catch (e) { r.fetch = 'blocked'; }
  try { await new Promise((ok, ng) => { const w = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); w.onopen = () => { w.close(); ok(); }; w.onerror = () => ng(new Error('ws')); }); r.websocket = 'opened'; } catch (e) { r.websocket = 'blocked'; }
  try { new Image().src = 'https://tracker.example.invalid/p.png'; r.image = 'requested'; } catch (e) { r.image = 'blocked'; }
  r.scriptRan = true;
  return JSON.stringify(r);
})()`;

const probeHtml = `<!doctype html><html><body><pre id="r">…</pre><script>${PROBE}.then(s => { document.getElementById('r').textContent = s; });</script></body></html>`;

test("text・image・markdown（mermaid の図）・html がタブで出て、markdown は整形される（AC8）", async ({
  page,
  appServer,
}) => {
  const media = await makeMediaDir();
  try {
    const p1 = await setup(page, appServer);
    const mdFile = await media.write(
      "design.md",
      "# 設計メモ\n\n| 項目 | 値 |\n|---|---|\n| a | 1 |\n\n- [x] 済み\n\n```mermaid\nflowchart LR\n  A[入力] --> B[出力]\n```\n\n```mermaid\nsequenceDiagram\n  A->>B: こんにちは\n```\n",
    );
    const png = await media.write("fig.png", makePng(50, 40));
    const htmlFile = await media.write(
      "page.html",
      "<!doctype html><title>t</title><h1 id=h>HTML 成果物</h1><script>document.getElementById('h').dataset.js='ran'</script>",
    );
    const txt = await media.write("notes.txt", "<b>タグのまま</b>\n二行目");
    const run = await runAsk(
      appServer,
      p1,
      SPEC([
        { file: mdFile, title: "設計" },
        { file: htmlFile, title: "画面" },
        { file: png, title: "図" },
        { file: txt, title: "メモ" },
      ]),
    );
    await expect(dialog(page)).toBeVisible();
    // markdown: 整形（見出し・表・チェックリスト）され、mermaid が SVG になる。
    const md = frameOf(page);
    await expect(md.locator("h1")).toHaveText("設計メモ");
    await expect(md.locator("table th")).toHaveText(["項目", "値"]);
    await expect(md.locator("input[type=checkbox]")).toHaveCount(1);
    await expect(md.locator(".mermaid svg")).toHaveCount(2);
    await expect(md.locator("html")).toHaveAttribute("data-ready", "1");
    // html: スクリプトも動く。
    await page.locator("[data-ask-view-tab]", { hasText: "画面" }).click();
    await expect(frameOf(page).locator("h1#h")).toHaveText("HTML 成果物");
    await expect(frameOf(page).locator("h1#h")).toHaveAttribute("data-js", "ran");
    // image: <img>（描かれた）。
    await page.locator("[data-ask-view-tab]", { hasText: "図" }).click();
    await expect
      .poll(() =>
        page.locator("[data-ask-view-image]").evaluate((i) => (i as HTMLImageElement).naturalWidth),
      )
      .toBe(50);
    // text: 文字のまま（タグは解釈されない）。
    await page.locator("[data-ask-view-tab]", { hasText: "メモ" }).click();
    await expect(page.locator("[data-ask-view-text]")).toHaveText("<b>タグのまま</b>\n二行目");
    expect(await page.locator("[data-ask-view-text] b").count()).toBe(0);
    // タブは矢印キーで移れる（AC-I3）。
    await page.locator("[data-ask-view-tab]", { hasText: "メモ" }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("[data-ask-view-tab][aria-selected=true]")).toHaveText("図");
    // 質問に答えて決定（AC-I3: マウスなしで通る）。
    await page.keyboard.press("Control+Enter"); // タブにフォーカス＝枠（.ask-viewer）の中のキーを取り次ぐ
    expect((await run.done).json).toEqual({ status: "answered", answers: { ok: "o1" } });
  } finally {
    await media.cleanup();
  }
});

test("隔離: html の枠の中のスクリプトは動くが、parent.document・localStorage・top.location は SecurityError、fetch・WebSocket・外への画像は拒否され、アプリに触れない（AC9）", async ({
  page,
  appServer,
}) => {
  const media = await makeMediaDir();
  try {
    const consoleErrors: string[] = [];
    page.on("console", (m) => void consoleErrors.push(m.text()));
    const p1 = await setup(page, appServer);
    const file = await media.write("probe.html", probeHtml);
    const run = await runAsk(appServer, p1, SPEC({ file }));
    await expect(dialog(page)).toBeVisible();
    // iframe の sandbox 属性（実測）: allow-scripts だけ。
    const sandbox = await page.locator("iframe[data-ask-view-frame]").getAttribute("sandbox");
    expect(sandbox).toBe("allow-scripts");
    expect(sandbox).not.toContain("allow-same-origin");
    await expect(frameOf(page).locator("#r")).not.toHaveText("…");
    const result = JSON.parse((await frameOf(page).locator("#r").textContent()) ?? "{}") as Record<
      string,
      unknown
    >;
    expect(result).toEqual({
      parentDocument: "SecurityError",
      localStorage: "SecurityError",
      cookie: "SecurityError",
      topLocation: "SecurityError",
      fetch: "blocked",
      websocket: "blocked",
      image: "requested", // 画像の読み込みを始めること自体は止まらない（結果は下のリクエストの観測で見る）
      scriptRan: true, // 枠の中のスクリプトは動いた（動かない枠ではこの実測の意味がない）
    });
    // 外へ出たリクエストは無い（img の取得先は CSP の img-src で止まり、コンソールに違反が出る）。アプリのページの変数にも触れていない。
    expect(
      consoleErrors.some((t) => /tracker\.example\.invalid|Content Security Policy/.test(t)),
    ).toBe(true);
    expect(
      await page.evaluate(() => (window as unknown as { __leak?: unknown }).__leak),
    ).toBeUndefined();
    await page.keyboard.press("Escape");
    expect((await run.done).json).toEqual({ status: "cancelled" });
  } finally {
    await media.cleanup();
  }
});

test("負の対照: 同じ実測を枠の外（アプリのページ）で動かすと全部触れる。枠の sandbox 属性に allow-same-origin を足して読み込み直しても、応答ヘッダの sandbox で隔離は保たれる", async ({
  page,
  appServer,
}) => {
  const media = await makeMediaDir();
  try {
    const p1 = await setup(page, appServer);
    // (1) 対照: アプリのページで同じ関数を動かすと、隔離されていない結果になる（実測が「触れない」を測れている証拠）。
    const outside = JSON.parse(await page.evaluate(PROBE)) as Record<string, string>;
    expect(outside["parentDocument"]).not.toBe("SecurityError");
    expect(outside["localStorage"]).not.toBe("SecurityError");
    expect(outside["fetch"]).toBe("status204"); // ログイン済みの Cookie でアプリの API に届く
    expect(outside["websocket"]).toBe("opened");
    // (2) allow-same-origin を足した枠: 属性だけが緩んだ場合でも、/ask-view/html.html の応答の `sandbox` ヘッダが隔離を保つ（多重の防御）。
    const file = await media.write("probe.html", probeHtml);
    const run = await runAsk(appServer, p1, SPEC({ file }));
    await expect(dialog(page)).toBeVisible();
    await expect(frameOf(page).locator("#r")).not.toHaveText("…");
    await page.locator("iframe[data-ask-view-frame]").evaluate((f) => {
      f.setAttribute("sandbox", "allow-scripts allow-same-origin");
      f.setAttribute("src", f.getAttribute("src") + "?again"); // 読み込み直す（postMessage の ready から本文を渡す）
    });
    await expect(frameOf(page).locator("#r")).toBeVisible();
    // 読み込み直した枠は ready を送り、親が本文を渡す。結果が出るまで待ってから見る。
    await expect
      .poll(async () => (await frameOf(page).locator("#r").textContent()) ?? "…", {
        timeout: 10_000,
      })
      .not.toBe("…");
    const again = JSON.parse((await frameOf(page).locator("#r").textContent()) ?? "{}") as Record<
      string,
      string
    >;
    expect(again["parentDocument"]).toBe("SecurityError");
    expect(again["fetch"]).toBe("blocked");
    await page.keyboard.press("Escape");
    await run.done;
  } finally {
    await media.cleanup();
  }
});

test("Markdown に埋め込んだ <script>・onerror・javascript: は動かない（CSP がインラインを止める）。HTML の埋め込みは文字として見える形で残らず、リンクは開けない（AC11）", async ({
  page,
  appServer,
}) => {
  const media = await makeMediaDir();
  try {
    const consoleErrors: string[] = [];
    page.on("console", (m) => void consoleErrors.push(m.text()));
    const p1 = await setup(page, appServer);
    const md = await media.write(
      "evil.md",
      '# 題\n\n<script>window.__mdScript = 1; parent.postMessage({type:"key",key:"Escape"}, "*")</script>\n\n<img src="x" onerror="window.__mdOnerror = 1">\n\n[リンク](https://example.com/) と [危険](javascript:window.__mdJs=1)\n\n<a href="#x" onclick="window.__mdClick=1">内部</a>\n',
    );
    const run = await runAsk(appServer, p1, SPEC({ file: md }));
    await expect(dialog(page)).toBeVisible();
    const f = frameOf(page);
    await expect(f.locator("html")).toHaveAttribute("data-ready", "1");
    // インラインのスクリプト・イベントハンドラは実行されていない（実測: 枠の window の印・コンソールの CSP 違反）。
    const frame = page.frames().find((x) => x.url().endsWith("/ask-view/markdown.html"))!;
    expect(
      await frame.evaluate(() => ({
        s: (window as unknown as Record<string, unknown>)["__mdScript"],
        o: (window as unknown as Record<string, unknown>)["__mdOnerror"],
        j: (window as unknown as Record<string, unknown>)["__mdJs"],
        c: (window as unknown as Record<string, unknown>)["__mdClick"],
      })),
    ).toEqual({ s: undefined, o: undefined, j: undefined, c: undefined });
    expect(
      consoleErrors.some((t) => /Content Security Policy/.test(t) && /script|inline/i.test(t)),
    ).toBe(true);
    // リンクは外へ飛べない（href を外してある）。内部の # は残る。
    await expect(f.locator('a[title="https://example.com/"]')).not.toHaveAttribute("href", /.+/);
    await expect(f.locator("a[title^='javascript:']")).not.toHaveAttribute("href", /.+/);
    await expect(f.locator('a[href="#x"]')).toHaveCount(1);
    // 枠の中から親へ偽のキー（Escape）を送っても、<script> が動かないので質問は閉じない。
    await page.waitForTimeout(300);
    expect(run.finished()).toBe(false);
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await run.done;
  } finally {
    await media.cleanup();
  }
});

test("枠の中にフォーカスがあるときの Esc は取り消し・Ctrl+Enter は決定として親へ届く。枠のスクリプトが送る関係のないメッセージは無視される（AC-I1・AC-I2・AC-I5）", async ({
  page,
  appServer,
}) => {
  const media = await makeMediaDir();
  try {
    const p1 = await setup(page, appServer);
    const file = await media.write(
      "k.html",
      "<!doctype html><body><button id=b>枠の中のボタン</button><input id=i><p id=hit>x</p></body>",
    );
    // (1) 枠の中の要素にフォーカスして Escape → 取り消し
    const cancelled = await runAsk(appServer, p1, SPEC({ file }));
    await expect(dialog(page)).toBeVisible();
    await frameOf(page).locator("#i").click();
    expect(await page.evaluate(() => document.activeElement?.localName)).toBe("iframe"); // フォーカスは枠の中（親のキーイベントは届かない）
    await page.keyboard.press("Escape");
    expect((await cancelled.done).json).toEqual({ status: "cancelled" });
    await expect(dialog(page)).toHaveCount(0);
    // (2) 枠の中で Ctrl+Enter → 決定（既定の回答で answered）
    const answered = await runAsk(appServer, p1, SPEC({ file }));
    await expect(dialog(page)).toBeVisible();
    await frameOf(page).locator("#b").click();
    await page.keyboard.press("Control+Enter");
    expect((await answered.done).json).toEqual({ status: "answered", answers: { ok: "o1" } });
    // (3) 枠の中のスクリプトが、取り次ぎの形でないメッセージ（形違い・別のキー）を送っても何も起きない。
    const quiet = await runAsk(appServer, p1, SPEC({ file }));
    await expect(dialog(page)).toBeVisible();
    const frame = page.frames().find((x) => x.url().endsWith("/ask-view/html.html"))!;
    await frame.evaluate(() => {
      for (const data of [
        { type: "key", key: "Enter" },
        { type: "key", key: "a", ctrl: true },
        { type: "keys", key: "Escape" },
        "Escape",
        { type: "ready" },
      ])
        parent.postMessage(data, "*");
    });
    await page.waitForTimeout(300);
    expect(quiet.finished()).toBe(false);
    await expect(dialog(page)).toBeVisible();
    // 質問の固定の行にフォーカスがある間の Ctrl+Enter も効く（今までどおり）。
    await page.keyboard.press("Escape");
    await quiet.done;
  } finally {
    await media.cleanup();
  }
});

test("枠の中のスクリプトが、利用者の操作なしに決定のメッセージを送っても、質問は確定しない（既定のままの承認を成果物の側から起こせない。AC-I5）", async ({
  page,
  appServer,
}) => {
  const media = await makeMediaDir();
  test.setTimeout(60_000);
  try {
    const p1 = await setup(page, appServer);
    // 枠のスクリプトが読み込み後に、決定（Ctrl+Enter）と取り消しでない取り次ぎを自分で送る。利用者の操作は 1 つも無い。
    const file = await media.write(
      "auto.html",
      `<!doctype html><body><p>自動</p><script>setTimeout(() => { parent.postMessage({ type: "key", key: "Enter", ctrl: true }, "*"); parent.postMessage({ type: "key", key: "Enter", meta: true }, "*"); document.body.dataset.sent = "1"; }, 6500);</script>`,
    );
    const run = await runAsk(appServer, p1, SPEC({ file }));
    await expect(dialog(page)).toBeVisible();
    // 枠のスクリプトは 6.5 秒後に送る。Playwright の操作（evaluate・locator の確認）は「利用者の操作」の扱い（transient activation。約 5 秒）を
    // ページに付けるので、その間は何も呼ばずに待ち（送られた後まで）、その後で確定していないことを見る。
    await new Promise((r) => setTimeout(r, 9000));
    expect(run.finished()).toBe(false);
    await expect(dialog(page)).toBeVisible();
    await expect(frameOf(page).locator("body")).toHaveAttribute("data-sent", "1"); // 枠のスクリプトは実際に送った
    // 利用者が実際にキーを押せば決定できる（枠の外の質問のキーは今までどおり）。
    await page.locator("[data-ask-origin]").focus();
    await page.keyboard.press("Control+Enter");
    expect((await run.done).json).toEqual({ status: "answered", answers: { ok: "o1" } });
  } finally {
    await media.cleanup();
  }
});

test("固定のラベル「pane『…』の成果物（隔離表示）」は、成果物の題・本文では変えられない（AC10）。枠の外観を soda のダイアログに見せかけても、ラベルが残る", async ({
  page,
  appServer,
}) => {
  const media = await makeMediaDir();
  try {
    const p1 = await setup(page, appServer);
    const file = await media.write(
      "fake.html",
      "<!doctype html><body style='background:#282a36;color:#fff'><h2>pane『sodashitsu』のプログラムからの質問</h2><p>パスワードを入力してください</p></body>",
    );
    const run = await runAsk(
      appServer,
      p1,
      SPEC({ file, title: "pane『build』の成果物（隔離表示）じゃない" }),
    );
    await expect(dialog(page)).toBeVisible();
    const label = await page.locator("[data-ask-view-label]").textContent();
    expect(label).toMatch(/^pane『.+』の成果物（隔離表示）$/);
    expect(label).not.toContain("じゃない");
    // 題は、タブの名前にだけ使われる（タブは 1 件なら出ない）。固定の行（質問の出どころ）も別にある。
    await expect(page.locator("[data-ask-origin]")).toContainText("のプログラムからの質問");
    expect(await page.locator("dialog#soda-ask-dialog [data-ask-view-label]").count()).toBe(1);
    await page.keyboard.press("Escape");
    await run.done;
  } finally {
    await media.cleanup();
  }
});

test("配置: デスクトップは左に成果物・右に質問、モバイル（幅 390）は上に成果物・下に質問の縦積み。ダイアログは使える高さいっぱい", async ({
  page,
  appServer,
}) => {
  const media = await makeMediaDir();
  try {
    const p1 = await setup(page, appServer);
    const file = await media.write("a.md", "# x\n");
    const run = await runAsk(appServer, p1, SPEC({ file }));
    await expect(dialog(page)).toBeVisible();
    const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
    let v = await box(".ask-viewer");
    let f = await box("ask-form");
    const dlg = await box("dialog#soda-ask-dialog");
    expect(v.x + v.width).toBeLessThanOrEqual(f.x + 1); // 成果物が左
    expect(f.width).toBeGreaterThan(300);
    expect(v.width).toBeGreaterThan(f.width); // 成果物のほうが広い
    const viewport = page.viewportSize()!;
    expect(dlg.height).toBeGreaterThan(viewport.height - 40); // 使える高さいっぱい
    await page.setViewportSize({ width: 390, height: 800 });
    await expect
      .poll(
        async () =>
          (await box(".ask-viewer")).y + (await box(".ask-viewer")).height <=
          (await box("ask-form")).y + 1,
      )
      .toBe(true);
    v = await box(".ask-viewer");
    f = await box("ask-form");
    expect(v.width).toBeGreaterThan(300); // どちらも幅いっぱい（縦積み）
    expect(f.width).toBeGreaterThan(300);
    expect(f.y).toBeGreaterThan(v.y);
    await page.keyboard.press("Escape");
    await run.done;
  } finally {
    await media.cleanup();
  }
});

test("成果物が読めない（存在しない・UTF-8 でないバイナリ・8 件超）定義は、ダイアログを出さず理由つきのエラー（終了コード 2）（AC3・AC4）", async ({
  page,
  appServer,
}) => {
  const media = await makeMediaDir();
  try {
    const p1 = await setup(page, appServer);
    const bin = await media.write("bin.txt", Buffer.from([0x41, 0, 0x42, 0xff]));
    const cases: [string, unknown, RegExp][] = [
      ["存在しない", { file: media.path("missing.md") }, /file not found/],
      ["バイナリ", { file: bin }, /UTF-8/],
      ["8 件超", Array.from({ length: 9 }, (_, i) => ({ text: `t${i}` })), /more than 8/],
      ["file と text の両方", { file: media.path("a.md"), text: "x" }, /exactly one of/],
    ];
    for (const [name, view, re] of cases) {
      const r = await (await runAsk(appServer, p1, SPEC(view))).done;
      expect([name, r.code, r.stdout]).toEqual([name, 2, ""]);
      expect(r.stderr, name).toMatch(re);
    }
    await expect(dialog(page)).toHaveCount(0);
  } finally {
    await media.cleanup();
  }
});

test("成果物の SVG は <img> だけで描かれ、スクリプトは動かない。iframe・object・embed では開かない（AC5・AC22 の対照）", async ({
  page,
  appServer,
}) => {
  const media = await makeMediaDir();
  try {
    const logs: string[] = [];
    page.on("console", (m) => logs.push(m.text())); // 枠（iframe）の中のコンソールも page に届く
    const p1 = await setup(page, appServer);
    const svg = await media.write("evil.svg", EVIL_SVG);
    const run = await runAsk(appServer, p1, SPEC([{ file: svg, title: "図" }]));
    await expect(dialog(page)).toBeVisible();
    await expect
      .poll(() =>
        page.locator("[data-ask-view-image]").evaluate((i) => (i as HTMLImageElement).naturalWidth),
      )
      .toBe(40);
    expect(await page.locator("[data-ask-view-image]").evaluate((i) => i.tagName)).toBe("IMG");
    expect(await page.locator("[data-ask-view-image]").getAttribute("src")).toMatch(
      /^(data:image\/svg\+xml|blob:)/,
    );
    // SVG を文書として開く経路（iframe・object・embed）が成果物の枠に無く、スクリプトも動いていない（動けば印かコンソールに出る）。
    expect(
      await page
        .locator(
          "[data-ask-view-stage] iframe, [data-ask-view-stage] object, [data-ask-view-stage] embed",
        )
        .count(),
    ).toBe(0);
    await page.waitForTimeout(500); // 開いてしまっていれば、スクリプトが動く時間
    expect(
      await page.evaluate(() => (window as unknown as { __svgScript?: number }).__svgScript),
    ).toBeUndefined();
    expect(logs.filter((l) => l.includes("svg-script-ran"))).toEqual([]);
    await page.keyboard.press("Control+Enter");
    await run.done;
  } finally {
    await media.cleanup();
  }
});
