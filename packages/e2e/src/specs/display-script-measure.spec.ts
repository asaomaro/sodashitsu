import { createSocket } from "node:dgram";
import { createServer as createTcp } from "node:net";
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { runDisplay } from "../support/display.js";
import { writeTmp } from "../support/displayBrowser.js";
import { getFreePort } from "../support/freePort.js";
import { activeTag, browserVersion, engageBtn, focusTerminal, ok, openScriptBrowser, scriptFrame, scriptFrameEl, scriptFrameLoc, setScript, setScriptOk } from "../support/displayScript.js";
import { mountProbeFrame } from "../support/scriptFrame.js";

/**
 * 「確かでない」の項目の実測（T28 の (4) の実測の一覧・(5)(6) の実測。**合否にしない**）。結果は `MEASURE …` の行に出し、`test-result.md` に
 * ブラウザの名前と版つきで書く。docs は、ここで「止まった」と確かめたものだけを「止まる」と書く。
 */
const wrap = (body: string, ms = 1500) => `<!doctype html><body><pre id=res>pending</pre><script>
var R = {};
function t(name, fn) { try { var v = fn(); R[name] = 'ok:' + String(v).slice(0, 60); } catch (e) { R[name] = 'throw:' + (e && e.name); } }
${body}
setTimeout(function () { document.getElementById('res').textContent = JSON.stringify(R); document.title = 'done'; }, ${ms});
</script></body>`;

async function result(page: Page): Promise<Record<string, string>> {
  const f = await scriptFrame(page);
  await expect.poll(() => f.evaluate(() => document.title), { timeout: 20_000 }).toBe("done");
  return JSON.parse(await f.evaluate(() => document.getElementById("res")!.textContent!)) as Record<string, string>;
}

test("実測 WebRTC: STUN の宛先を待ち受け（UDP）にしたとき、要求が届くか", async ({ page, appServer }) => {
  const { paneId } = await openScriptBrowser(page, appServer);
  const port = await getFreePort();
  let packets = 0;
  const udp = createSocket("udp4");
  udp.on("message", () => packets++);
  await new Promise<void>((r) => udp.bind(port, "127.0.0.1", r));
  try {
    await setScriptOk(
      appServer,
      paneId,
      "g",
      wrap(`
t('RTCPeerConnection', function () {
  var pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:127.0.0.1:${port}' }] });
  pc.createDataChannel('x');
  pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).then(function () { R.offer = 'set'; }, function (e) { R.offer = 'rejected:' + e.name; });
  return 'created';
});`, 4000),
    );
    const r = await result(page);
    await page.waitForTimeout(1500);
    console.log(`MEASURE webrtc: browser=${browserVersion(page)} script=${JSON.stringify(r)} udp-packets-reached=${packets}`);
  } finally {
    udp.close();
  }
});

test("実測 history: history.back()・history.go(-1)・pushState でアプリのページの URL・履歴が動くか", async ({ page, appServer }) => {
  const { paneId } = await openScriptBrowser(page, appServer);
  await page.evaluate(() => {
    history.pushState({}, "", "#a");
    history.pushState({}, "", "#b");
  });
  const url0 = page.url();
  const len0 = await page.evaluate(() => history.length);
  await setScriptOk(
    appServer,
    paneId,
    "g",
    wrap(`
t('history.length-before', function () { return history.length; });
t('pushState', function () { history.pushState({}, '', '/x'); return 'ok'; });
t('back', function () { history.back(); return 'called'; });
t('go(-1)', function () { history.go(-1); return 'called'; });
t('go(-2)', function () { history.go(-2); return 'called'; });`, 2500),
  );
  // history.back() は枠自身の履歴を動かす（枠が別の文書へ戻る）ので、枠の結果は読めないことがある。アプリのページの側だけで見る。
  await page.waitForTimeout(3500);
  const faceAlive = (await scriptFrameEl(page).count()) > 0;
  console.log(`MEASURE history: browser=${browserVersion(page)} app-url-before=${url0} app-url-after=${page.url()} history.length ${len0}->${await page.evaluate(() => history.length)} face-alive=${faceAlive}`);
});

test("実測 先読み: <link rel=dns-prefetch|preconnect|prefetch> で待ち受けに接続が来るか", async ({ page, appServer }) => {
  const { paneId } = await openScriptBrowser(page, appServer);
  const port = await getFreePort();
  let conns = 0;
  const tcp = createTcp((s) => {
    conns++;
    s.destroy();
  });
  await new Promise<void>((r) => tcp.listen(port, "127.0.0.1", r));
  try {
    await setScriptOk(
      appServer,
      paneId,
      "g",
      wrap(`['dns-prefetch', 'preconnect', 'prefetch', 'prerender', 'modulepreload'].forEach(function (rel) { t(rel, function () { var l = document.createElement('link'); l.rel = rel; l.href = 'http://127.0.0.1:${port}/' + rel; document.head.appendChild(l); return 'added'; }); });`, 3000),
    );
    const r = await result(page);
    await page.waitForTimeout(1500);
    console.log(`MEASURE prefetch: browser=${browserVersion(page)} script=${JSON.stringify(r)} tcp-connections-reached=${conns}`);
  } finally {
    tcp.close();
  }
});

test("実測 クリップボード・音・全画面・PiP: 操作の前と、利用者が操作を始めてクリックした後", async ({ page, appServer, context }) => {
  const { paneId } = await openScriptBrowser(page, appServer);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
  const ACTIONS = `
function probeAll(tag) {
  var out = {};
  function p(name, fn) { try { var v = fn(); out[name] = 'ok:' + String(v).slice(0, 40); } catch (e) { out[name] = 'throw:' + (e && e.name); } }
  p('execCommand-copy', function () { var ta = document.getElementById('ta'); ta.focus(); ta.select(); return document.execCommand('copy'); });
  p('clipboard.writeText', function () { navigator.clipboard.writeText('from-frame-' + tag).then(function () { out['clipboard.writeText-result'] = 'resolved'; R[tag] = out; }, function (e) { out['clipboard.writeText-result'] = 'rejected:' + e.name; R[tag] = out; }); return 'called'; });
  p('AudioContext', function () { var a = new AudioContext(); out.audioState = a.state; a.resume().then(function () { out.audioResumed = a.state; R[tag] = out; }, function () { out.audioResumed = 'rejected'; R[tag] = out; }); return a.state; });
  p('audio-play', function () { var el = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAABErAAABAAgAZGF0YQAAAAA='); el.play().then(function () { out.audioPlay = 'resolved'; R[tag] = out; }, function (e) { out.audioPlay = 'rejected:' + e.name; R[tag] = out; }); return 'called'; });
  p('requestFullscreen', function () { document.documentElement.requestFullscreen().then(function () { out.fullscreen = 'resolved'; R[tag] = out; }, function (e) { out.fullscreen = 'rejected:' + e.name; R[tag] = out; }); return 'called'; });
  p('pictureInPictureEnabled', function () { return document.pictureInPictureEnabled; });
  R[tag] = out;
}
window.__probeAll = probeAll;
`;
  await setScriptOk(appServer, paneId, "g", wrap(`document.body.insertAdjacentHTML('beforeend', '<textarea id=ta>copy-me</textarea><button id=b>click</button>'); ${ACTIONS} probeAll('before');`, 2500));
  await result(page).catch(() => undefined);
  const f = await scriptFrame(page);
  await page.waitForTimeout(800); // ［操作する］は、出た・動いた直後の 500ms は押しを受けない（engageGuard）
  await engageBtn(page).click();
  await scriptFrameLoc(page).locator("#b").click();
  await f.evaluate(() => (window as unknown as { __probeAll(t: string): void }).__probeAll("after-click"));
  await page.waitForTimeout(2500);
  const all = await f.evaluate(() => (window as unknown as { R: Record<string, unknown> }).R);
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch((e: Error) => `read-failed:${e.name}`));
  console.log(`MEASURE gestures: browser=${browserVersion(page)} ${JSON.stringify(all)} clipboard-after=${JSON.stringify(clip)}`);
});

test("実測 window.name を移った先へ運べるか（同じ origin の静的ページへ）", async ({ page, appServer }) => {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await mountProbeFrame(page, { source: `<!doctype html><body><script>window.name = 'carried-secret'; setTimeout(function () { location.href = '/display-view/frame.html?moved'; }, 300);</script></body>` });
  await page.waitForTimeout(2500);
  const h = await page.locator("iframe[data-probe-frame]").elementHandle();
  const f = await h!.contentFrame();
  const info = await f!.evaluate(() => ({ name: window.name, href: location.href })).catch((e: Error) => ({ name: `eval-failed:${e.message.slice(0, 50)}`, href: "" }));
  console.log(`MEASURE window.name: browser=${browserVersion(page)} ${JSON.stringify(info)}`);
});

test("実測 兄弟の枠（ほかの面）: postMessage・MessagePort の受け渡し・location の書き換え・focus()", async ({ page, appServer }) => {
  test.setTimeout(60_000);
  const { paneId, sent } = await openScriptBrowser(page, appServer);
  // 兄弟 B（スクリプトの面）: message を記録する。
  await setScriptOk(
    appServer,
    paneId,
    "b",
    `<!doctype html><body><input id=i><script>
window.__got = [];
window.addEventListener('message', function (e) { window.__got.push({ t: (e.data && e.data.type) || typeof e.data, ports: (e.ports || []).length }); if (e.ports && e.ports[0]) { e.ports[0].onmessage = function (m) { window.__got.push({ viaPort: m.data }); }; } });
</script></body>`,
    { kind: "band" },
  );
  await expect(page.locator("[data-pane-bands] iframe[data-display-script]")).toHaveCount(1);
  // A（スクリプトの面）が B へ送る。
  await setScriptOk(
    appServer,
    paneId,
    "a",
    wrap(`
t('frames-length', function () { return parent.frames.length; });
t('postMessage', function () { var n = 0; for (var i = 0; i < parent.frames.length; i++) { if (parent.frames[i] !== window) { parent.frames[i].postMessage({ type: 'hello-from-a' }, '*'); n++; } } return n; });
t('port-transfer', function () { var ch = new MessageChannel(); var n = 0; for (var i = 0; i < parent.frames.length; i++) { if (parent.frames[i] !== window) { parent.frames[i].postMessage({ type: 'port' }, '*', [ch.port2]); n++; } } ch.port1.postMessage('over-port'); return n; });
t('sibling.location-read', function () { for (var i = 0; i < parent.frames.length; i++) { if (parent.frames[i] !== window) return parent.frames[i].location.href; } });
`, 2500),
  );
  const r = await result(page);
  await page.waitForTimeout(500);
  const bFrame = await (await page.locator("[data-pane-bands] iframe[data-display-script]").elementHandle())!.contentFrame();
  const got = bFrame ? await bFrame.evaluate(() => (window as unknown as { __got: unknown[] }).__got).catch(() => "eval-failed") : "no-frame";
  console.log(`MEASURE siblings-post: browser=${browserVersion(page)} a=${JSON.stringify(r)} b-received=${JSON.stringify(got)}`);
  void sent;
});

test("実測 兄弟の枠の location の書き換え → 書き換えられた側の面が navigated で閉じるか（合否: 書き換えられるなら閉じる）", async ({ page, appServer }) => {
  test.setTimeout(60_000);
  const { paneId } = await openScriptBrowser(page, appServer);
  await ok(await runDisplay(appServer, paneId, ["set", "victim", "--kind", "band", "--html-file", await writeTmp("<p>victim</p>")]));
  await expect(page.locator("[data-pane-bands] iframe[data-display-frame]")).toHaveCount(1);
  const ev = await runDisplay(appServer, paneId, ["events", "victim"]);
  await ev.nextLine();
  await setScriptOk(appServer, paneId, "a", wrap(`t('sibling.location=', function () { for (var i = 0; i < parent.frames.length; i++) { if (parent.frames[i] !== window) { parent.frames[i].location = '/display-view/frame.html?moved'; return 'set'; } } return 'no-sibling'; });`, 1500));
  const r = await result(page);
  await page.waitForTimeout(3500);
  const closed = (await page.locator("[data-pane-bands] iframe[data-display-frame]").count()) === 0;
  console.log(`MEASURE sibling-location: browser=${browserVersion(page)} a=${JSON.stringify(r)} victim-face-closed=${closed}`);
  if (r["sibling.location="] === "ok:set") {
    // 書き換えられたなら、静的な面は navigated で閉じる（合否）
    expect(closed).toBe(true);
    expect(await ev.nextLine(8000)).toMatchObject({ type: "display.closed", name: "victim", reason: "navigated" });
  }
  ev.kill();
});

test("実測 兄弟の枠へ focus(): 同じ pane の静的な面へ移す → 元の場所へ戻り、続けて打ったキーが pane に届く（合否: 移せるなら）", async ({ page, appServer }) => {
  test.setTimeout(60_000);
  const { paneId, input } = await openScriptBrowser(page, appServer);
  await ok(await runDisplay(appServer, paneId, ["set", "victim", "--kind", "band", "--html-file", await writeTmp("<input id=v><button>b</button>")]));
  await expect(page.locator("[data-pane-bands] iframe[data-display-frame]")).toHaveCount(1);
  await setScriptOk(appServer, paneId, "a", `<!doctype html><body><script>
window.__go = function () { var r = []; for (var i = 0; i < parent.frames.length; i++) { if (parent.frames[i] !== window) { try { parent.frames[i].focus(); r.push('focus-called'); } catch (e) { r.push('throw:' + e.name); } } } document.title = r.join(','); };
</script></body>`);
  await expect(page.locator("[data-pane-panel] iframe[data-display-script]")).toHaveCount(1);
  await focusTerminal(page);
  const f = await scriptFrame(page);
  // 親の activeElement を 5ms ごとに記録しておき、スクリプトが兄弟へ focus() を呼んだあと、フォーカスが本当に兄弟の枠へ移ったか（一瞬でも）を見る。
  await page.evaluate(() => {
    const seen = new Set<string>();
    (window as unknown as { __seen: Set<string> }).__seen = seen;
    setInterval(() => {
      const el = document.activeElement as HTMLElement | null;
      seen.add(`${el?.tagName ?? ""}${el?.hasAttribute?.("data-display-script") ? "[script]" : el?.hasAttribute?.("data-display-frame") ? "[static]" : ""}`);
    }, 5);
  });
  await f.evaluate(() => (window as unknown as { __go(): void }).__go());
  const res = await f.evaluate(() => document.title);
  await page.waitForTimeout(1500);
  const active = await activeTag(page);
  const seen = await page.evaluate(() => [...(window as unknown as { __seen: Set<string> }).__seen]);
  const n = input().length;
  await page.keyboard.type("q");
  await page.waitForTimeout(500);
  const toPane = input().slice(n).map((i) => i.text).join("");
  console.log(`MEASURE sibling-focus: browser=${browserVersion(page)} script=${res} active-elements-seen=${JSON.stringify(seen)} active-after=${active} typed-reached-pane=${JSON.stringify(toPane)}`);
  expect(active).not.toContain("IFRAME"); // 戻される（静的な枠の foreign-focus）
  expect(toPane).toContain("q");
  // フォーカスが本当に兄弟の静的な枠へ移ったなら、親の activeElement に静的な枠が現れる（移らなかったなら、この実測は「止まった」）。
  if (seen.includes("IFRAME[static]")) console.log("MEASURE sibling-focus-moved: true");
  else console.log("MEASURE sibling-focus-moved: false");
});

test("実測 兄弟の枠へ focus()（利用者が操作を始めて枠の中をクリックした後＝ユーザー操作の後）: 静的な面へフォーカスが移るか、移ったらアプリが戻すか", async ({ page, appServer }) => {
  test.setTimeout(60_000);
  const { paneId, input } = await openScriptBrowser(page, appServer);
  await ok(await runDisplay(appServer, paneId, ["set", "victim", "--kind", "band", "--html-file", await writeTmp("<input id=v><button>b</button>")]));
  await expect(page.locator("[data-pane-bands] iframe[data-display-frame]")).toHaveCount(1);
  await setScriptOk(appServer, paneId, "a", `<!doctype html><body><button id=go>go</button><script>
document.getElementById('go').addEventListener('click', function () { for (var i = 0; i < parent.frames.length; i++) { if (parent.frames[i] !== window) { try { parent.frames[i].focus(); } catch (e) {} } } });
</script></body>`);
  await expect(scriptFrameLoc(page).locator("#go")).toBeAttached();
  await page.evaluate(() => {
    const seen = new Set<string>();
    (window as unknown as { __seen: Set<string> }).__seen = seen;
    setInterval(() => {
      const el = document.activeElement as HTMLElement | null;
      seen.add(`${el?.tagName ?? ""}${el?.hasAttribute?.("data-display-script") ? "[script]" : el?.hasAttribute?.("data-display-frame") ? "[static]" : ""}`);
    }, 5);
  });
  await page.waitForTimeout(800); // ［操作する］は、出た・動いた直後の 500ms は押しを受けない（engageGuard）
  await engageBtn(page).click();
  await scriptFrameLoc(page).locator("#go").click(); // 本物のクリック（ユーザー操作）の中で、兄弟へ focus()
  await page.waitForTimeout(1500);
  const seen = await page.evaluate(() => [...(window as unknown as { __seen: Set<string> }).__seen]);
  const active = await activeTag(page);
  const n = input().length;
  await page.keyboard.type("q");
  await page.waitForTimeout(500);
  console.log(`MEASURE sibling-focus-after-gesture: browser=${browserVersion(page)} active-elements-seen=${JSON.stringify(seen)} active-after=${active} typed-reached-pane=${JSON.stringify(input().slice(n).map((i) => i.text).join(""))} engaged-after=${await page.locator("[data-pane-panel]").getAttribute("data-display-engaged")}`);
});

test("実測 閉じるまでに枠へ入ったキーの数（限界 1。軽いときの下限）", async ({ page, appServer }) => {
  test.setTimeout(60_000);
  const { paneId, input } = await openScriptBrowser(page, appServer);
  await focusTerminal(page);
  const ev = await runDisplay(appServer, paneId, ["events", "g"]);
  await ev.nextLine();
  // 一定の間隔（15ms）でキーを打ち続けながら、フォーカスを取り続ける中身を出す。中身は枠へ入った keydown を数えて soda.action で報告する（閉じた後でも届く）。
  let typed = 0;
  let stop = false;
  const before = input().length;
  const typing = (async () => {
    while (!stop) {
      await page.keyboard.press("x");
      typed++;
      await page.waitForTimeout(15);
    }
  })();
  await setScriptOk(appServer, paneId, "g", `<!doctype html><body><input id=i><script>
window.__keys = 0;
window.addEventListener('keydown', function () { window.__keys++; soda.action('keys', { n: String(window.__keys) }); }, true);
setInterval(function () { window.focus(); document.getElementById('i').focus(); }, 20);
</script></body>`);
  await expect(scriptFrameEl(page)).toHaveCount(0, { timeout: 15_000 }); // 3 回で閉じる
  await page.waitForTimeout(800);
  stop = true;
  await typing;
  ev.kill();
  const r = await ev.done;
  const keyLines = r.lines.filter((l) => (l as { action?: string }).action === "keys") as { data: { n: string } }[];
  const intoFrame = keyLines.length ? Math.max(...keyLines.map((l) => Number(l.data.n))) : 0;
  const toPane = input().slice(before).filter((i) => i.paneId === paneId).map((i) => i.text).join("").length;
  console.log(`MEASURE keys-before-close: browser=${browserVersion(page)} typed-while-open-and-after=${typed} into-frame=${intoFrame} reached-pane=${toPane} (15ms 間隔・軽い負荷・下限)`);
});

test("実測 戻し先が body のとき: 何もフォーカスしていない状態で取られると、利用者が選んでいる pane の端末へ戻る", async ({ page, appServer }) => {
  const { paneId, input, sent } = await openScriptBrowser(page, appServer);
  await setScriptOk(appServer, paneId, "g", `<!doctype html><body><input id=i></body>`);
  await expect(scriptFrameLoc(page).locator("#i")).toBeAttached();
  // フォーカスを body に（端末でない場所を押す）
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const before = await activeTag(page);
  const f = await scriptFrame(page);
  await f.evaluate(() => { window.focus(); document.getElementById("i")!.focus(); });
  await expect.poll(() => sent.reports().filter((r) => r.problem === "focus_steal").length).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(300);
  const after = await activeTag(page);
  const n = input().length;
  await page.keyboard.type("w");
  await page.waitForTimeout(400);
  console.log(`MEASURE body-origin: before=${before} after=${after} typed-reached-pane=${JSON.stringify(input().slice(n).map((i) => i.text).join(""))}`);
});

test("実測 重いスクリプト（15 秒の同期ループ）: 枠だけが固まるか、アプリの画面ごとか", async ({ page, appServer }) => {
  test.setTimeout(90_000);
  const { paneId } = await openScriptBrowser(page, appServer);
  const ev = await runDisplay(appServer, paneId, ["events", "g"]);
  await ev.nextLine();
  await setScriptOk(appServer, paneId, "g", `<!doctype html><body><p>heavy</p><script>setTimeout(function () { var t = Date.now(); while (Date.now() < t + 15000) {} }, 1000);</script></body>`);
  const lat: number[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 14000) {
    const s = Date.now();
    await page.evaluate(() => 1);
    lat.push(Date.now() - s);
    await page.waitForTimeout(250);
  }
  const max = Math.max(...lat);
  const lines: string[] = [];
  try {
    for (let i = 0; i < 2; i++) lines.push(JSON.stringify(await ev.nextLine(8000)));
  } catch {
    /* 閉じなかった */
  }
  const closed = (await scriptFrameEl(page).count()) === 0;
  console.log(`MEASURE heavy-script: browser=${browserVersion(page)} app-page-max-eval-latency-ms=${max} samples=${lat.length} face-closed=${closed} events=${lines.join(" ")}`);
  ev.kill();
});

test("実測 コンソールの記録: Permissions-Policy の focus-without-user-activation と CSP の webrtc を、このブラウザが解釈するか", async ({ page, appServer }) => {
  const logs: string[] = [];
  page.on("console", (m) => logs.push(m.text()));
  const { paneId } = await openScriptBrowser(page, appServer);
  await setScriptOk(appServer, paneId, "g", "<p>x</p>");
  await expect(scriptFrameEl(page)).toHaveCount(1);
  await page.waitForTimeout(500);
  console.log(`MEASURE headers-parsed: browser=${browserVersion(page)} console=${JSON.stringify(logs.filter((l) => /Permissions-Policy|Content-Security-Policy|webrtc|focus-without/i.test(l)))}`);
  // setScript を使う関数の参照（未使用の警告よけ）
  void setScript;
});
