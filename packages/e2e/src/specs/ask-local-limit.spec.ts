import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { runAsk } from "../support/ask.js";
import { dialog, q, setup } from "../support/askForm.js";
import { makeMediaDir } from "../support/media.js";

/**
 * ローカル起動（`soda serve` が loopback だけで待ち受け、`--origin`・TLS が無い）では、成果物（`view`）の大きさの上限が外れ、大きな html も画面内のダイアログに出る
 * （20261005-ask-local-no-limit）。合否はブラウザの側の実測（枠の中の本文の末尾の要素が実際に描かれたか・枠の中のスクリプトが実行されたか）で見る。
 * 対照: 外向きに公開した構成（`askExposed`）では従来の上限（8 MiB）が効き、同じ定義が終了コード 2 で断られる（`ask-media.spec.ts` の AC4 も同じ構成）。
 */

const MIB = 1024 * 1024;
const frameOf = (page: Page) => page.frameLocator("iframe[data-ask-view-frame]");

/** 指定の大きさ（バイト）の UTF-8 の html。先頭の見出し・末尾の要素・末尾のスクリプトを持つ（全部が届いて描かれたかを末尾で測る）。 */
export function bigHtml(bytes: number): Buffer {
  const head = Buffer.from('<!doctype html><meta charset="utf-8"><title>big</title><h1 id="top">先頭</h1>\n<div hidden>\n');
  const tail = Buffer.from('\n</div><h2 id="tail">末尾</h2><script>document.getElementById("tail").dataset.js="ran";</script>\n');
  const unit = Buffer.from("<p>あいうえお かきくけこ abcdefghij 0123456789 ".repeat(8) + "</p>\n"); // 日本語（3 バイト）と ASCII の混在
  const n = Math.max(0, Math.floor((bytes - head.length - tail.length) / unit.length));
  const body = Buffer.alloc(n * unit.length);
  for (let i = 0; i < n; i++) unit.copy(body, i * unit.length);
  return Buffer.concat([head, body, tail]);
}

function treeRssMiB(rootPid: number): { self: number; children: number } {
  const rows = execFileSync("ps", ["-eo", "pid=,ppid=,rss="], { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((l) => l.trim().split(/\s+/).map(Number) as [number, number, number]);
  const kids = new Set<number>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const [pid, ppid] of rows) if ((ppid === rootPid || kids.has(ppid)) && !kids.has(pid)) (kids.add(pid), (grew = true));
  }
  let self = 0;
  let children = 0;
  for (const [pid, , rss] of rows) {
    if (pid === rootPid) self = rss;
    else if (kids.has(pid)) children += rss;
  }
  return { self: Math.round(self / 1024), children: Math.round(children / 1024) };
}

async function showBig(page: Page, appServer: Parameters<typeof setup>[1], mib: number, label: string) {
  const media = await makeMediaDir();
  try {
    const p1 = await setup(page, appServer);
    const file = media.path("big.html");
    await writeFile(file, bigHtml(mib * MIB));
    const t0 = Date.now();
    const run = await runAsk(appServer, p1, { title: "確認", view: { file, title: "大きな html" }, questions: [q("ok", { label: "進めますか" })] });
    await expect(dialog(page)).toBeVisible({ timeout: 110_000 });
    const frame = frameOf(page);
    await expect(frame.locator("h2#tail")).toHaveText("末尾", { timeout: 110_000 });
    await expect(frame.locator("h2#tail")).toHaveAttribute("data-js", "ran");
    const ms = Date.now() - t0;
    const mem = treeRssMiB(process.pid);
    // eslint-disable-next-line no-console
    console.log(`[measure] ${label} ${mib} MiB html: shown in ${ms} ms; server-process RSS ${mem.self} MiB; browser tree RSS ${mem.children} MiB`);
    await page.keyboard.press("Escape");
    await run.done;
  } finally {
    await media.cleanup();
  }
}

test("ローカル起動: 8 MiB を超える html（20 MiB）の成果物が、画面内のダイアログで末尾まで描かれ、枠の中のスクリプトも動く", async ({ page, appServer }) => {
  test.setTimeout(150_000);
  await showBig(page, appServer, 20, "local");
});

test("ローカル起動: --features は無制限を返し（unlimited・safety）、従来の数も残す（古い読み手のため）", async ({ appServer }) => {
  const pane = (await appServer.openClient()).helloSnapshot()!.panes[0]!.id;
  const r = await (await runAsk(appServer, pane, "", ["--features"])).done;
  expect(r.json).toMatchObject({
    limits: { unlimited: true, fileBytes: 8 * MIB, files: 32, views: 8, safety: { fileBytes: 256 * MIB, totalBytes: 512 * MIB, serverBytes: 1024 * MIB } },
    server: { limits: { unlimited: true, files: 32 } },
  });
});

// 巨大ファイルの実測（遅いので既定では走らせない。`SODA_E2E_HUGE=50,200` のように MiB をコンマで渡す）。
for (const mib of (process.env["SODA_E2E_HUGE"] ?? "").split(",").filter(Boolean).map(Number)) {
  test(`実測: ローカル起動で ${mib} MiB の html`, async ({ page, appServer }) => {
    test.setTimeout(400_000);
    await showBig(page, appServer, mib, "measure");
  });
}

test.describe("外向きに公開した構成（対照）", () => {
  test.use({ askExposed: true });

  test("同じ 20 MiB の html は従来の上限で断られ（終了コード 2）、ダイアログは出ない。--features に unlimited は無い", async ({ page, appServer }) => {
    const media = await makeMediaDir();
    try {
      const p1 = await setup(page, appServer);
      const file = media.path("big.html");
      await writeFile(file, bigHtml(20 * MIB));
      const r = await (await runAsk(appServer, p1, { view: { file }, questions: [q("ok", { label: "進めますか" })] })).done;
      expect([r.code, r.stderr]).toEqual([2, expect.stringMatching(/larger than 8388608/)]);
      await expect(dialog(page)).toHaveCount(0);
      const f = await (await runAsk(appServer, p1, "", ["--features"])).done;
      expect((f.json as { limits: Record<string, unknown> }).limits["unlimited"]).toBeUndefined();
      expect((f.json as { server: { limits: Record<string, unknown> } }).server.limits["unlimited"]).toBeUndefined();
    } finally {
      await media.cleanup();
    }
  });
});
