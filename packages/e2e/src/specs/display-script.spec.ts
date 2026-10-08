import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Frame, Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { mountProbeFrame } from "../support/scriptFrame.js";

/**
 * スクリプトが動く形式（`script-html`。20261007-soda-extensions の T28）の E2E。合否はブラウザの側の実測で見る（`e2e-observe-browser`）。
 * この節は、土台の頁（`/display-view/script.html`）に中身を DOM として差し込む作りの前提（不確かな点 7・8）の実測。親になるのはテスト自身
 * （`support/scriptFrame.ts`）で、アプリの部品（`DisplayFrame`）を通さない。後の節が、アプリの部品を通した筋を足す。
 */

async function probeFrame(page: Page): Promise<Frame> {
  const h = await page.locator("iframe[data-probe-frame]").elementHandle();
  const f = await h!.contentFrame();
  if (!f) throw new Error("no content frame");
  return f;
}
const MARKED = fileURLToPath(new URL("../../../web/public/ask-view/vendor/marked.umd.js", import.meta.url));

test.describe("土台の頁への差し込み（不確かな点 7・8）", () => {
  test("差し込みの後も、親から見た iframe の load は 1 回のまま（合否）。インラインのスクリプトは文書の順に動き、DOMContentLoaded・load・<body onload> が動く", async ({ page, appServer }) => {
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    const probe = await mountProbeFrame(page, {
      source: `<!doctype html><html><head><style>#box{width:40px;height:10px;background:rgb(1,2,3)}</style></head>
<body onload="log('body-onload')"><div id="box"></div>
<script>window.__log = []; function log(x) { window.__log.push(x); } log('s1');</script>
<script>log('s2:' + (document.getElementById('late') ? 'late-present' : 'late-absent'));</script>
<div id="late"></div>
<script>document.addEventListener('DOMContentLoaded', function () { log('dcl'); }); addEventListener('load', function () { log('load'); }); log('s3:' + document.readyState);</script>
<script>log('eval:' + eval('1 + 2')); log('fn:' + new Function('return 7')());</script>
<script type="module">log('module');</script>
</body></html>`,
    });
    const f = await probeFrame(page);
    await expect.poll(async () => (await probe.messages()).some((m) => m["type"] === "rendered")).toBe(true);
    await page.waitForTimeout(1500); // 後から 2 回目の load が起きないことを見る
    expect(await probe.loads()).toBe(1);
    const log = await f.evaluate(() => (window as unknown as { __log: string[] }).__log);
    // 文書の順（s1 → s2 → s3 → eval）。そのあとで DOMContentLoaded と load（<body onload> を含む）。module は非同期でその前後どちらでもよい。
    expect(log.slice(0, 4)).toEqual(["s1", "s2:late-absent", "s3:complete", "eval:3"]);
    expect(log).toEqual(expect.arrayContaining(["fn:7", "dcl", "load", "body-onload", "module"]));
    expect(log.filter((x) => x === "dcl")).toHaveLength(1);
    expect(log.filter((x) => x === "load")).toHaveLength(1);
    expect(log.filter((x) => x === "body-onload")).toHaveLength(1);
    // head の <style> が効く
    expect(await f.evaluate(() => getComputedStyle(document.getElementById("box")!).backgroundColor)).toBe("rgb(1, 2, 3)");
    // 親から見た文書の origin は不透明（allow-same-origin なし）
    expect(await page.locator("iframe[data-probe-frame]").evaluate((el) => (el as HTMLIFrameElement).contentDocument === null)).toBe(true);
  });

  test("埋め込んだライブラリが動く（marked の UMD・単純な Canvas のグラフ）", async ({ page, appServer }) => {
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    const marked = await readFile(MARKED, "utf8");
    const probe = await mountProbeFrame(page, {
      source: `<!doctype html><html><body><div id="md"></div><canvas id="c" width="200" height="100"></canvas>
<script>${marked.replace(/<\/script/gi, "<\\/script")}</script>
<script>
document.getElementById('md').innerHTML = marked.parse('# 見出し\\n\\n- a\\n- b');
var ctx = document.getElementById('c').getContext('2d'); ctx.fillStyle = 'rgb(200,10,10)';
[30, 80, 55].forEach(function (h, i) { ctx.fillRect(10 + i * 60, 100 - h, 40, h); });
</script></body></html>`,
    });
    const f = await probeFrame(page);
    await expect.poll(async () => (await probe.messages()).some((m) => m["type"] === "rendered")).toBe(true);
    await expect(f.locator("#md h1")).toHaveText("見出し");
    await expect(f.locator("#md li")).toHaveCount(2);
    const px = await f.evaluate(() => {
      const d = (document.getElementById("c") as HTMLCanvasElement).getContext("2d")!.getImageData(30, 90, 1, 1).data;
      return Array.from(d);
    });
    expect(px.slice(0, 3)).toEqual([200, 10, 10]);
    expect(await probe.loads()).toBe(1);
  });

  test("グラフのライブラリ（Chart.js）が動く。ライブラリのファイルが無ければ飛ばす（実測。合否は上の 2 つ）", async ({ page, appServer }) => {
    const path = process.env["SODA_E2E_CHARTJS"];
    test.skip(path === undefined, "SODA_E2E_CHARTJS（Chart.js の UMD のファイル）を渡したときだけ");
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    const chart = await readFile(path!, "utf8");
    const probe = await mountProbeFrame(page, {
      source: `<!doctype html><html><body style="margin:0"><div style="width:400px;height:240px"><canvas id="c"></canvas></div>
<script>${chart.replace(/<\/script/gi, "<\\/script")}</script>
<script>
window.__chart = new Chart(document.getElementById('c'), { type: 'bar', data: { labels: ['月', '火', '水'], datasets: [{ label: '件数', data: [3, 7, 4], backgroundColor: 'rgb(200,10,10)' }] }, options: { animation: false, responsive: true, maintainAspectRatio: false } });
</script></body></html>`,
    });
    const f = await probeFrame(page);
    await expect.poll(async () => (await probe.messages()).some((m) => m["type"] === "rendered")).toBe(true);
    await expect.poll(() => f.evaluate(() => typeof (window as unknown as { Chart?: unknown }).Chart)).toBe("function");
    const painted = await f.evaluate(() => {
      const c = document.getElementById("c") as HTMLCanvasElement;
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true;
      return false;
    });
    expect(painted).toBe(true);
    expect(await probe.loads()).toBe(1);
  });
});
