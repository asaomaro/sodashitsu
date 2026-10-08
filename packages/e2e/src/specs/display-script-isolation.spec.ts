import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { runDisplay, startSink } from "../support/display.js";
import { writeTmp } from "../support/displayBrowser.js";
import { browserVersion, ok, openScriptBrowser, scriptFrame, scriptFrameEl, setScriptOk } from "../support/displayScript.js";

/**
 * スクリプトが動く形式の隔離（AC30。T28 の (4)）。中身のスクリプトに探りを書き、結果を枠の DOM に書かせて読む。
 * 外への通信の宛先は、テストが `127.0.0.1` の別のポートに立てた待ち受け（`startSink`）だけ（本物の外のホストへは出さない）。
 * 「止まる」と言えるのは、ここで 1 つずつ確かめた項目だけ。「確かでない」の項目の実測は、次の test（合否にしない）。
 */

const probe = (body: string) => `<!doctype html><body><pre id=res>pending</pre><script>
var R = {};
function t(name, fn) { try { var v = fn(); R[name] = 'ok:' + String(v).slice(0, 40); } catch (e) { R[name] = 'throw:' + (e && e.name); } }
${body}
setTimeout(function () { document.getElementById('res').textContent = JSON.stringify(R); document.title = 'done'; }, 1200);
</script></body>`;

async function readResult(page: Page): Promise<Record<string, string>> {
  const f = await scriptFrame(page);
  await expect.poll(() => f.evaluate(() => document.title), { timeout: 15_000 }).toBe("done");
  return JSON.parse(await f.evaluate(() => document.getElementById("res")!.textContent!)) as Record<string, string>;
}

test("(4) 隔離（合否）: アプリの DOM・cookie・保存領域・/ws・外への通信・同じ origin の <script src>・フォーム・window.open・ダイアログ・ダウンロード・Worker・top.location が止まる", async ({ page, appServer }) => {
  const { paneId } = await openScriptBrowser(page, appServer);
  const sink = await startSink();
  const requests: string[] = [];
  const failed: string[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith(sink.origin)) requests.push(r.url());
  });
  page.on("requestfailed", (r) => {
    if (r.url().startsWith(sink.origin)) failed.push(`${r.url()} ${r.failure()?.errorText ?? ""}`);
  });
  const popups: string[] = [];
  page.on("popup", (p) => popups.push(p.url()));
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.type());
    void d.dismiss();
  });
  const downloads: string[] = [];
  page.on("download", (d) => downloads.push(d.url()));
  const appUrl = page.url();
  try {
    const S = sink.origin;
    // 同じ pane の別の面（静的な形式）。スクリプトの面から、その枠の中は読めない。
    await ok(await runDisplay(appServer, paneId, ["set", "other", "--kind", "band", "--html-file", await writeTmp("<p>other</p>")]));
    await expect(page.locator("[data-pane-bands] iframe[data-display-frame]")).toHaveCount(1);
    await setScriptOk(
      appServer,
      paneId,
      "g",
      probe(`
t('parent.document', function () { return parent.document.title; });
t('top.document', function () { return top.document.title; });
t('cookie', function () { return document.cookie; });
t('localStorage', function () { return localStorage.length; });
t('sessionStorage', function () { return sessionStorage.length; });
t('indexedDB', function () { return indexedDB.open('x'); });
t('frames[i].document', function () { var seen = 0; for (var i = 0; i < parent.frames.length; i++) { if (parent.frames[i] === window) continue; seen++; parent.frames[i].document.title; } if (!seen) return 'no-sibling'; return 'read'; });
t('fetch-sink', function () { fetch('${S}/fetch'); return 'sent'; });
t('fetch-app', function () { fetch('/api/session').then(function (r) { R['fetch-app-status'] = 'status' + r.status; }, function () { R['fetch-app-status'] = 'rejected'; }); return 'sent'; });
t('xhr-sink', function () { var x = new XMLHttpRequest(); x.open('GET', '${S}/xhr'); x.send(); return 'sent'; });
t('ws-app', function () { var w = new WebSocket('ws://' + location.host + '/ws'); w.onopen = function () { R['ws-app-open'] = 'opened'; }; return 'sent'; });
t('ws-sink', function () { var w = new WebSocket('${S.replace("http", "ws")}/ws'); w.onopen = function () { R['ws-sink-open'] = 'opened'; }; return 'sent'; });
t('image', function () { new Image().src = '${S}/img'; return 'sent'; });
t('link-css', function () { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '${S}/css'; document.head.appendChild(l); return 'sent'; });
t('script-src-sink', function () { var s = document.createElement('script'); s.src = '${S}/script'; document.head.appendChild(s); return 'sent'; });
t('script-src-self', function () { var s = document.createElement('script'); s.src = '/display-view/frame.js'; s.onload = function () { R['script-self-loaded'] = 'loaded'; }; s.onerror = function () { R['script-self-loaded'] = 'blocked'; }; document.head.appendChild(s); return 'sent'; });
t('font-face', function () { var st = document.createElement('style'); st.textContent = "@font-face{font-family:x;src:url('${S}/font')} body{font-family:x}"; document.head.appendChild(st); return 'sent'; });
t('eventsource', function () { new EventSource('${S}/es'); return 'sent'; });
t('form-submit', function () { var f = document.createElement('form'); f.action = '${S}/form'; f.method = 'POST'; document.body.appendChild(f); f.submit(); return 'sent'; });
t('window.open', function () { return window.open('${S}/open'); });
t('a-target-blank', function () { var a = document.createElement('a'); a.href = '${S}/a'; a.target = '_blank'; document.body.appendChild(a); a.click(); return 'clicked'; });
t('alert', function () { return alert('x'); });
t('confirm', function () { return confirm('x'); });
t('prompt', function () { return prompt('x'); });
t('a-download', function () { var a = document.createElement('a'); a.href = 'data:text/plain,hi'; a.download = 'x.txt'; document.body.appendChild(a); a.click(); return 'clicked'; });
t('worker-blob', function () { return new Worker(URL.createObjectURL(new Blob(['1']))); });
t('serviceWorker', function () { return navigator.serviceWorker.register('/sw.js'); });
t('top.location', function () { top.location = '${S}/top'; return 'set'; });
t('parent.location', function () { parent.location = '${S}/parent'; return 'set'; });
t('top.location.href-read', function () { return top.location.href; });
t('postMessage-parent', function () { parent.postMessage({ type: 'display-ready', t: 'x' }, '*'); return 'sent'; });
`),
    );
    const r = await readResult(page);
    await page.waitForTimeout(800);
    console.log(`MEASURE isolation: browser=${browserVersion(page)} ${JSON.stringify(r)}`);
    for (const k of ["parent.document", "top.document", "cookie", "localStorage", "sessionStorage", "indexedDB", "frames[i].document", "top.location.href-read"]) expect(r[k], k).toMatch(/^throw:/);
    for (const k of ["worker-blob", "serviceWorker"]) expect(r[k], k).toMatch(/^throw:|^ok:/); // 作れても、下の「外への要求 0」で見る
    expect(r["alert"]).toBe("ok:undefined"); // 例外にならずに何も起きない（ダイアログは出ない）
    expect(dialogs).toEqual([]);
    expect(downloads).toEqual([]);
    expect(popups).toEqual([]);
    expect(r["window.open"]).toMatch(/^ok:null|^throw:/);
    expect(r["script-self-loaded"]).toBe("blocked"); // 同じ origin の <script src> も読めない（script-src に 'self' が無い）
    expect(r["fetch-app-status"]).toBe("rejected");
    expect(r["ws-app-open"]).toBeUndefined();
    expect(r["ws-sink-open"]).toBeUndefined();
    // 外への要求は 0（待ち受けに届かず、ブラウザの要求の記録にも無い）
    expect(sink.requests()).toEqual([]);
    // ブラウザが要求を出そうとした記録（Playwright の request）は、CSP が止めたものも含む。全部が失敗で終わり（応答なし）、待ち受けには何も届いていない。
    console.log(`MEASURE isolation-requests: attempted=${requests.length} failed=${failed.length} ${JSON.stringify(failed)}`);
    expect(failed.length).toBe(requests.length);
    // アプリのページ全体は移らない
    expect(page.url()).toBe(appUrl);
    expect(await page.evaluate(() => document.querySelector(".xterm-helper-textarea") !== null)).toBe(true);
  } finally {
    await sink.close();
  }
});

test("(4) 別の面の枠へ postMessage しても、その面の display.action にならない。他の pane の操作にもならない", async ({ page, appServer }) => {
  const { paneId } = await openScriptBrowser(page, appServer);
  await ok(await runDisplay(appServer, paneId, ["set", "victim", "--kind", "panel", "--html-file", await writeTmp(`<button data-soda-action="victim-act">v</button>`)]));
  await setScriptOk(
    appServer,
    paneId,
    "att",
    `<!doctype html><body><script>
for (var i = 0; i < parent.frames.length; i++) { try { parent.frames[i].postMessage({ type: 'action', rev: 1, action: 'victim-act' }, '*'); } catch (e) {} }
document.title = 'sent';
</script></body>`,
    { kind: "band" },
  );
  const w = await runDisplay(appServer, paneId, ["events"]);
  await w.nextLine();
  await page.waitForTimeout(1500);
  await expect(page.locator("iframe[data-display-frame]")).toHaveCount(2);
  const lines: unknown[] = [];
  w.kill();
  const r = await w.done;
  for (const l of r.lines) lines.push(l);
  expect(lines.filter((l) => (l as { type?: string }).type === "display.action")).toEqual([]);
});
