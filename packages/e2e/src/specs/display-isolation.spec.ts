import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { runDisplay, startSink, watchDisplaySubscriptions } from "../support/display.js";
import { contentFrame, frameEl, openDisplayBrowser, panelFrameLoc, writeTmp } from "../support/displayBrowser.js";
import { watchSentInput } from "../support/frames.js";

/**
 * 表示の面の静的な形式の隔離（20261007-soda-extensions。AC15〜AC19・AC34・AC37）の E2E。合否は、ブラウザの側の実測（枠の `sandbox` 属性・応答ヘッダ・
 * 枠の中で動かした式の結果・`page.on("request")` の記録・テストが立てた待ち受けに届いた要求・ブラウザが送った要求）で見る。
 * 外への通信・移動の宛先は、テストが `127.0.0.1` の別のポートに立てた待ち受け（`startSink`）だけ。
 */

const ok = async (run: Awaited<ReturnType<typeof runDisplay>>) => {
  const r = await run.done;
  expect(r.code, r.stderr).toBe(0);
  return r;
};
const SANDBOX = "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox";
const ran = (page: Page) => panelFrameLoc(page).locator("html");

test("(1) 枠の sandbox 属性と応答ヘッダに allow-same-origin が無く、枠の中から親・cookie・保存領域・アプリへの通信に触れない", async ({ page, appServer }) => {
  const { paneId } = await openDisplayBrowser(page, appServer);
  await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--text", "x"]));
  await expect(frameEl(page)).toHaveAttribute("sandbox", SANDBOX);
  expect(await frameEl(page).getAttribute("sandbox")).not.toContain("allow-same-origin");
  const res = await fetch(`${appServer.origin}/display-view/frame.html`);
  const csp = res.headers.get("content-security-policy")!;
  expect(csp).not.toContain("allow-same-origin");
  expect(csp).toContain("script-src 'self';");
  const f = await contentFrame(page);
  const probe = await f.evaluate(async () => {
    const r: Record<string, string> = {};
    try { r.parentDocument = String(parent.document.title).slice(0, 5); } catch (e) { r.parentDocument = (e as Error).name; }
    try { r.localStorage = String(localStorage.length); } catch (e) { r.localStorage = (e as Error).name; }
    try { r.cookie = document.cookie === "" ? "empty" : "has"; } catch (e) { r.cookie = (e as Error).name; }
    try { r.topLocation = String(top!.location.href).slice(0, 4); } catch (e) { r.topLocation = (e as Error).name; }
    try { const res2 = await fetch("/api/session"); r.fetch = `status${res2.status}`; } catch { r.fetch = "blocked"; }
    try {
      await new Promise<void>((resolve, reject) => {
        const w = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
        w.onopen = () => { w.close(); resolve(); };
        w.onerror = () => reject(new Error("ws"));
      });
      r.websocket = "opened";
    } catch { r.websocket = "blocked"; }
    return r;
  });
  expect(probe.parentDocument).toBe("SecurityError");
  expect(probe.localStorage).toBe("SecurityError");
  expect(probe.cookie).toBe("SecurityError");
  expect(probe.topLocation).toBe("SecurityError");
  expect(probe.fetch).toBe("blocked");
  expect(probe.websocket).toBe("blocked");
  // 対照: 同じ式を枠の外（アプリのページ）で動かすと、全部触れる（この検査が「触れない」を測れている証拠）。
  const outside = await page.evaluate(async () => {
    let parentDoc = "blocked";
    try { parentDoc = String(parent.document.title).slice(0, 1) === "" ? "ok" : "ok"; } catch { /* */ }
    let ls = "blocked";
    try { ls = String(localStorage.length); } catch { /* */ }
    const res2 = await fetch("/api/session").catch(() => null);
    return { parentDoc, lsIsNumber: /^\d+$/.test(ls), fetched: res2 !== null };
  });
  expect(outside).toEqual({ parentDoc: "ok", lsIsNumber: true, fetched: true });
});

const EVIL = `
<script>document.documentElement.dataset.ran = 'script'</script>
<img id="im" src="data:image/png;base64,broken" onerror="document.documentElement.dataset.ran = 'onerror'">
<button id="b" onclick="document.documentElement.dataset.ran = 'onclick'">btn</button>
<a id="j" href="javascript:document.documentElement.dataset.ran='href'">js</a>
<svg onload="document.documentElement.dataset.ran = 'svgload'"></svg>
<p id="done">done</p>`;

for (const fmt of ["html", "markdown"] as const) {
  test(`(2) 中身の <script>・onerror・onclick・javascript: が動かない（${fmt}）`, async ({ page, appServer }) => {
    const { paneId } = await openDisplayBrowser(page, appServer);
    const file = await writeTmp(EVIL, fmt === "html" ? "c.html" : "c.md");
    await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", fmt === "html" ? "--html-file" : "--markdown-file", file]));
    const f = panelFrameLoc(page);
    await expect(f.locator("#done")).toBeAttached();
    await f.locator("#b").click({ trial: false }).catch(() => undefined);
    await f.locator("#j").click().catch(() => undefined);
    await page.waitForTimeout(400);
    expect(await ran(page).getAttribute("data-ran")).toBeNull();
  });
}

// 取り除きそのもの（二重の守りの片方）。実行の筋 (2) は CSP だけでも通るので、取り除きを外した版を見分けるのはこちらと sanitize.js の単体テスト。
for (const fmt of ["html", "markdown"] as const) {
  test(`(2b) 取り除き: 危険な要素・属性が文書に入っていない（${fmt}）`, async ({ page, appServer }) => {
    const { paneId } = await openDisplayBrowser(page, appServer);
    const file = await writeTmp(EVIL, fmt === "html" ? "c.html" : "c.md");
    await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", fmt === "html" ? "--html-file" : "--markdown-file", file]));
    const f = panelFrameLoc(page);
    await expect(f.locator("#done")).toBeAttached();
    expect(await f.locator("#soda-display-root script").count()).toBe(0);
    expect(await f.locator("#soda-display-root [onerror], #soda-display-root [onclick], #soda-display-root [onload]").count()).toBe(0);
  });
}

test("(3) 外の画像・stylesheet・@import・背景・フォントへの要求が 0（ブラウザの要求の記録と、待ち受けに届いた要求）", async ({ page, appServer }) => {
  const sink = await startSink();
  try {
    // 「要求を出そうとした」のうち CSP が止めたものは `request` に出るが `response` は来ない。届いたか（応答が返ったか）は、`response` と待ち受けで見る。
    const requests: string[] = [];
    page.on("response", (r) => {
      if (r.url().startsWith(sink.origin)) requests.push(r.url());
    });
    const { paneId } = await openDisplayBrowser(page, appServer);
    const html = `<link rel="stylesheet" href="${sink.origin}/a.css"><style>@import url(${sink.origin}/b.css); @font-face{font-family:x;src:url(${sink.origin}/f.woff2)} body{background:url(${sink.origin}/bg.png);font-family:x}</style><img src="${sink.origin}/i.png"><div style="background:url(${sink.origin}/d.png)">d</div><p id="done">done</p>`;
    await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--html-file", await writeTmp(html)]));
    await expect(panelFrameLoc(page).locator("#done")).toBeAttached();
    await page.waitForTimeout(500);
    expect(requests).toEqual([]);
    expect(sink.requests()).toEqual([]);
  } finally {
    await sink.close();
  }
});

// meta は、html では head に書かれると文書に入れる前の断片に届かない（取り除き以前に捨てられる）ので、body の中に書いた場合と markdown の中に書いた場合も見る。
const META = (origin: string) => `<meta http-equiv="refresh" content="0;url=/display-view/frame.html?moved"><base href="${origin}/">`;
for (const variant of ["html-head", "html-body", "markdown"] as const) {
  test(`(4) meta refresh・form の送信・base・iframe・object・embed で枠が移らず、外を読まない（${variant}）`, async ({ page, appServer }) => {
    const sink = await startSink();
    try {
      const { paneId, sent } = await openDisplayBrowser(page, appServer);
      const rest = `<iframe src="${sink.origin}/if"></iframe><object data="${sink.origin}/ob"></object><embed src="${sink.origin}/em"><form id="f" action="${sink.origin}/post" method="post"><input name="a" value="1"><button id="s">go</button></form><p id="done">done</p>`;
      const html = variant === "html-head" ? META(sink.origin) + rest : `<p>先頭</p>${META(sink.origin)}${rest}`;
      const file = await writeTmp(html, variant === "markdown" ? "c.md" : "c.html");
      await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", variant === "markdown" ? "--markdown-file" : "--html-file", file]));
      await expect(panelFrameLoc(page).locator("#done")).toBeAttached();
      await panelFrameLoc(page).locator("#s").click();
      await page.waitForTimeout(800);
      await expect(frameEl(page)).toHaveAttribute("data-display-loads", "1");
      expect(sent.reports()).toEqual([]);
      expect(sink.requests()).toEqual([]);
      expect(await panelFrameLoc(page).locator("#soda-display-root").locator("iframe, object, embed, meta, base").count()).toBe(0);
      // 面は閉じられていない。
      const list = await ok(await runDisplay(appServer, paneId, ["list"]));
      expect((list.json as { displays: unknown[] }).displays).toHaveLength(1);
    } finally {
      await sink.close();
    }
  });
}

test("(5) 親のページの別の iframe から同じ形の message（display-ready・action）を送っても、ブラウザは display.action を送らない", async ({ page, appServer }) => {
  const { paneId, sent } = await openDisplayBrowser(page, appServer);
  await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--html-file", await writeTmp(`<button data-soda-action="x">x</button>`)]));
  await expect(panelFrameLoc(page).locator("button")).toBeVisible();
  // 別の iframe（アプリ本体の CSP がインラインのスクリプトを止めるので、Playwright が枠の中から式を動かす）から、同じ形の message を送る。
  await page.evaluate(() => {
    const ifr = document.createElement("iframe");
    ifr.id = "foreign";
    ifr.setAttribute("sandbox", "allow-scripts");
    ifr.srcdoc = "<p>foreign</p>";
    document.body.appendChild(ifr);
  });
  const foreign = (await (await page.locator("#foreign").elementHandle())!.contentFrame())!;
  await expect.poll(() => foreign.evaluate(() => document.body?.textContent)).toBe("foreign");
  await foreign.evaluate(() => {
    for (const m of [{ type: "display-ready", t: "0" }, { type: "action", rev: 1, action: "evil" }, { type: "key", key: "escape" }, { type: "pong", n: 1 }]) parent.postMessage(m, "*");
  });
  await page.waitForTimeout(600);
  expect(sent.actions()).toEqual([]);
  await expect(frameEl(page)).toHaveAttribute("data-display-loads", "1");
});

test("(6) 枠が移った場合: 面が閉じ、トーストが出て、display.report(navigated) が送られ、events に display.closed(navigated)。直後の html の set は通る", async ({ page, appServer }) => {
  const { paneId, sent } = await openDisplayBrowser(page, appServer);
  await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--html-file", await writeTmp(`<button data-soda-action="x">x</button>`)]));
  await expect(panelFrameLoc(page).locator("button")).toBeVisible();
  const events = await runDisplay(appServer, paneId, ["events"]);
  expect((await events.nextLine()).type).toBe("display.ready");
  const f = await contentFrame(page);
  // 同じ origin の宛先（必ず移れる）。移った先の静的ページは、読み込みの最後に自分で display-ready を送る。
  // 移った瞬間に親が iframe を外すので、goto の待ちは「枠が外れた」で終わる。
  await f.goto(`${appServer.origin}/display-view/frame.html?moved`).catch(() => undefined);
  await expect(frameEl(page)).toHaveCount(0);
  await expect(page.locator(".toast", { hasText: "別のページへ移ろうとしたので閉じました" })).toBeVisible();
  await expect.poll(() => sent.reports().length).toBeGreaterThan(0);
  expect(sent.reports()[0]).toMatchObject({ problem: "navigated", paneId, format: "html" });
  expect(await events.nextLine()).toMatchObject({ type: "display.closed", name: "m", reason: "navigated" });
  events.kill();
  expect(sent.actions()).toEqual([]);
  // 静的な形式は冷却に入らない。
  await ok(await runDisplay(appServer, paneId, ["set", "m2", "--kind", "panel", "--html-file", await writeTmp(`<p id="again">again</p>`)]));
  await expect(panelFrameLoc(page).locator("#again")).toBeAttached();
});

test("(7)(8) 端末にフォーカスがあるとき、面の出現・更新・置き換えで、アプリはフォーカスを動かさない（autofocus・tabindex・input を含む中身でも）。打った文字は全部 pane に届き、activeElement は iframe にならない", async ({ page, appServer }) => {
  // 静的な形式では作者のスクリプトが動かないので、「フォーカスを奪い続ける中身」は作れない（奪取そのものへの備えは、スクリプトが動く形式〔PR3〕の範囲）。
  // ここで測るのは、アプリ自身が、面の出現・更新で `focus()` を呼ばないこと。ブラウザ自身が別 origin の枠の autofocus を止めることは観測した事実で、守りには数えない（test-result.md）。
  const { paneId } = await openDisplayBrowser(page, appServer);
  const input = await watchSentInput(page);
  await page.locator(".xterm-helper-textarea").focus();
  const activeBefore = await page.evaluate(() => document.activeElement?.className);
  expect(activeBefore).toContain("xterm-helper-textarea");
  const content = (n: string) => `<input id="i" autofocus><button id="b" tabindex="1" autofocus>b</button><div tabindex="0" id="t">t</div><textarea autofocus></textarea><p id="${n}">${n}</p>`;
  const f = panelFrameLoc(page);
  const active = () => page.evaluate(() => document.activeElement?.className ?? document.activeElement?.tagName);
  await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--html-file", await writeTmp(content("v1"))]));
  await expect(f.locator("#v1")).toBeAttached();
  expect(await active()).toContain("xterm-helper-textarea");
  await page.keyboard.type("aaa");
  // 更新（同じ名前の置き換え）・形式を替える置き換え・帯の追加。
  await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--html-file", await writeTmp(content("v2"))]));
  await expect(f.locator("#v2")).toBeAttached();
  expect(await active()).toContain("xterm-helper-textarea");
  await page.keyboard.type("bbb");
  await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--format", "markdown"], { stdin: "# md\n\n<input autofocus id=\"j\">" }));
  await expect(f.locator("#j")).toBeAttached();
  expect(await active()).toContain("xterm-helper-textarea");
  await page.keyboard.type("ccc");
  await ok(await runDisplay(appServer, paneId, ["set", "band", "--kind", "band", "--html-file", await writeTmp(content("b1"))]));
  await expect(page.frameLocator("[data-pane-bands] iframe").locator("#b1")).toBeAttached();
  expect(await active()).toContain("xterm-helper-textarea");
  await page.keyboard.type("ddd");
  await expect.poll(() => input().map((i) => i.text).join("")).toContain("aaabbbcccddd");
  expect(await active()).not.toBe("IFRAME");
  await expect(page.locator("[data-pane-panel]")).toHaveAttribute("data-display-engaged", "0");
  // 観測した事実（守りには数えない）: 別 origin の枠の autofocus は、ブラウザが親の文書のフォーカスを動かさない。
  const frame = (await (await page.locator("[data-pane-panel] iframe").elementHandle())!.contentFrame())!;
  console.log("OBSERVED frame.hasFocus=", await frame.evaluate(() => document.hasFocus()));
});

// 名前の上書き（DOM clobbering）。form の子の `name` が `form.attributes` などを差し替えても、取り除きが form の属性を全部消す（実ブラウザで）。
for (const name of ["attributes", "getAttribute", "removeAttribute", "setAttribute", "hasAttribute", "tagName", "localName", "children", "parentNode", "firstChild", "remove", "querySelectorAll"]) {
  test(`(11) 取り除き: form の子が name=${name} でも、form の on*・formaction・srcdoc・autofocus が消える`, async ({ page, appServer }) => {
    const { paneId } = await openDisplayBrowser(page, appServer);
    const html = `<form id="f" onclick="x()" onsubmit="y()" formaction="/x" srcdoc="x" autofocus><input name="${name}"><button>b</button></form><p id="done">done</p>`;
    await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--html-file", await writeTmp(html)]));
    await expect(panelFrameLoc(page).locator("#done")).toBeAttached();
    const f = await contentFrame(page);
    const names = await f.evaluate(() => {
      const form = Element.prototype.querySelector.call(document.body, "#f")!;
      return Element.prototype.getAttributeNames.call(form) as string[];
    });
    expect(names.filter((n) => /^on|^formaction$|^srcdoc$|^autofocus$/.test(n))).toEqual([]);
    expect(names).toContain("id");
  });
}

test("(12) 生きた document が中身の name・id で上書きされても、次の render が描かれる（createElement・importNode・body・querySelector など）", async ({ page, appServer }) => {
  const { paneId } = await openDisplayBrowser(page, appServer);
  const clob = ["createElement", "createTextNode", "importNode", "body", "documentElement", "getElementById", "querySelector", "querySelectorAll", "activeElement", "hasFocus", "addEventListener", "scrollingElement", "head", "readyState"]
    .map((n) => `<img name="${n}" id="${n}">`)
    .join("");
  await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--html-file", await writeTmp(`${clob}<p id="first">1</p>`)]));
  await expect(panelFrameLoc(page).locator("#first")).toBeAttached();
  for (const [i, fmt] of [["second", "html"], ["third", "markdown"], ["fourth", "text"]] as const) {
    const body = fmt === "html" ? `<p id="${i}">x</p>` : fmt === "markdown" ? `# ${i}` : i;
    await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--format", fmt], { stdin: body }));
    await expect(panelFrameLoc(page).locator(fmt === "html" ? `#${i}` : fmt === "markdown" ? "h1" : "pre")).toContainText(fmt === "html" ? "x" : i);
  }
  await expect(page.locator("[data-display-render-failed]")).toHaveCount(0);
  // 上書きしたまま、操作も届く。
  await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--html-file", await writeTmp(`${clob}<button id="b" data-soda-action="go">go</button>`)]));
  const w = await runDisplay(appServer, paneId, ["wait", "m"]);
  const deadline = Date.now() + 15_000;
  while (!w.finished() && Date.now() < deadline) {
    await panelFrameLoc(page).locator("#b").click();
    await new Promise((r) => setTimeout(r, 250));
  }
  expect((await w.done).lines[0]).toMatchObject({ action: "go" });
});

test("(10) 知らない形式（script-html・未知）: 枠が作られず固定の文言。形式が替わると iframe が別の要素になる", async ({ page, appServer }) => {
  let format = "html";
  await page.routeWebSocket(/\/ws$/, (ws) => {
    const server = ws.connectToServer();
    server.onMessage((m) => ws.send(typeof m === "string" && format !== "html" ? m.replaceAll('"format":"html"', `"format":"${format}"`) : m));
    ws.onMessage((m) => server.send(m));
  });
  const client = await appServer.openClient();
  const paneId = client.helloSnapshot()!.panes[0]!.id;
  const subs = await watchDisplaySubscriptions(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await subs.waitFor(1);
  await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--html-file", await writeTmp(`<p id="a">a</p>`)]));
  await expect(panelFrameLoc(page).locator("#a")).toBeAttached();
  const first = await frameEl(page).elementHandle();
  // 知らない形式の間は、枠（iframe）が一度も作られない（作ってから外すのではなく、作らない）。
  let attached = 0;
  page.on("frameattached", () => attached++);
  // 形式を書き換える（テストの接続は台帳に形式の違う面を作れないので、ブラウザが受ける display.updated を差し替える）。
  format = "script-html";
  await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--html-file", await writeTmp(`<p id="b">b</p>`)]));
  await expect(page.locator("[data-pane-panel] [data-display-note]")).toHaveText("この画面では、この形式の表示を出せません");
  await expect(frameEl(page)).toHaveCount(0);
  expect(attached).toBe(0);
  format = "future-x";
  await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--html-file", await writeTmp(`<p id="c">c</p>`)]));
  await expect(page.locator("[data-pane-panel] [data-display-note]")).toBeVisible();
  await expect(frameEl(page)).toHaveCount(0);
  expect(attached).toBe(0);
  format = "html";
  await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--html-file", await writeTmp(`<p id="d">d</p>`)]));
  await expect(panelFrameLoc(page).locator("#d")).toBeAttached();
  const second = await frameEl(page).elementHandle();
  expect(await second!.evaluate((a, b) => a === b, first)).toBe(false);
  await expect(frameEl(page)).toHaveAttribute("data-display-loads", "1");
});
