import { expect, test } from "../support/fixtures.js";

/**
 * T1 の疎通確認——`AppServer`（実サーバ）・`#token=` 自動ログイン・xterm.js への入力の往復が一巡すること。
 * `smoke.ts`（01・03-web-desktop T26）の「ビルドした成果物が最初の使える状態に到達したか」と同じ確認を、
 * この E2E の土台の上で再現できるかのテスト（T2 以降の各 spec はこの土台の上に積む）。
 */
test("ログイン → pane の表示 → 入力が PTY まで届く", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const created = await client.request("workspace.create", { cwd: process.cwd(), label: "e2e-smoke" });
  await client.request("pane.subscribe", { paneId: created.pane.id, scrollbackLines: 200 });

  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await expect(page.locator(".login-view")).toHaveCount(0);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });

  const marker = `soda-e2e-${Date.now()}`;
  await page.locator(".xterm-helper-textarea").click();
  await page.keyboard.type(`echo ${marker}`);
  await page.keyboard.press("Enter");

  await client.waitForOutput(created.pane.id, marker, 8000);

  // 端末の描画用 canvas が `.xterm-screen` の枠の中に重なっていて、入力用 textarea が見えていないこと
  // （xterm.css が効いていること。D96——読み込み漏れで端末の中身が一切見えていなかったのを、バイト列の往復だけを
  // 見る確認はすり抜けた。親の統合 test で追加）。
  const layout = await page.evaluate(() => {
    const screen = document.querySelector(".xterm-screen")!.getBoundingClientRect();
    const canvases = Array.from(document.querySelectorAll(".xterm-screen canvas"))
      .map((c) => c.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0);
    return {
      screen: { top: screen.top, bottom: screen.bottom },
      canvases: canvases.map((r) => ({ top: r.top, bottom: r.bottom })),
      helperOpacity: getComputedStyle(document.querySelector(".xterm-helper-textarea")!).opacity,
    };
  });
  expect(layout.canvases.length).toBeGreaterThan(0);
  for (const c of layout.canvases) {
    expect(c.top).toBeGreaterThanOrEqual(layout.screen.top - 1);
    expect(c.bottom).toBeLessThanOrEqual(layout.screen.bottom + 1);
  }
  expect(layout.helperOpacity).toBe("0");
});
