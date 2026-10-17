import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { assertPaneResolvesFake } from "@sodashitsu/server";
import { loadStatuslineSettings } from "@sodashitsu/protocol";
import { expect, test } from "../support/fixtures.js";

/**
 * Actual process detection and verified report socket → usage RPC/feed → browser DOM.
 * No real agy command, credentials or paid calls. The test client only prepares the pane;
 * every visible result is asserted in the desktop/mobile browser per e2e-observe-browser.
 */
const dir = await mkdtemp(join(tmpdir(), "soda-e2e-agy-"));
const fakeDir = join(dir, "bin");
await mkdir(fakeDir, { recursive: true });
const fakeScript = join(dir, "fake-agy.mjs");
await writeFile(fakeScript, `
import { connect } from "node:net";
import { randomUUID } from "node:crypto";
const paneId = process.env.SODA_PANE_ID, sessionId = randomUUID();
const socket = process.env.SODA_AGENT_REPORT_SOCKET;
const report = (value) => new Promise(resolve => {
  const c = connect(socket, () => c.end(JSON.stringify(value) + "\\n"));
  c.on("error", resolve); c.on("close", resolve);
});
const base = {paneId, kind:"agy", sessionId, agentPid:process.pid};
async function send() {
  await report(base);
  await report({...base, type:"usage", model:"Gemini E2E", contextUsedPct:42,
    contextWindowSize:200000, contextTokens:84000, inputTokens:80000, outputTokens:1000,
    cacheReadTokens:4000, quota:[{label:"gemini-weekly", usedPct:25, resetsAt:Math.floor(Date.now()/1000)+7200}],
    agentState:"idle", toolConfirmationPending:false});
}
process.stdin.setRawMode(true);
process.stdout.write("\\u001b[2J\\u001b[Hfake Antigravity CLI ready\\r\\n> ");
process.stdin.on("data", d => { if(String(d).includes("\\u0004")) process.exit(0); });
send(); setInterval(send, 1000);
`);
await writeFile(join(fakeDir, "agy"), `#!/bin/bash\nexec -a agy ${JSON.stringify(process.execPath)} ${JSON.stringify(fakeScript)} "$@"\n`);
await chmod(join(fakeDir, "agy"), 0o755);
const originalPath = process.env["PATH"];
test.beforeAll(() => { process.env["PATH"] = `${fakeDir}${delimiter}${originalPath ?? ""}`; });
test.afterAll(async () => {
  if (originalPath === undefined) delete process.env["PATH"];
  else process.env["PATH"] = originalPath;
  await rm(dir, { recursive: true, force: true });
});

for (const mobile of [false, true]) {
  test(`Antigravity ${mobile ? "mobile" : "desktop"}: dashboard, quota and native statusline use verified reports`, async ({ page, appServer }) => {
    test.setTimeout(90000);
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    const client = await appServer.openClient();
    const pane = client.helloSnapshot()!.panes.find(p => !p.virtual)!;
    try {
      await client.request("prefs.set", { patch: { statuslineSettings: loadStatuslineSettings({ rows: 3,
        fields: { input: true, output: true, contextTokens: true } }) } });
      await assertPaneResolvesFake({ write: input => client.sendInput(pane.id, input), name: "agy", fakeDir, scratchDir: dir });
      await client.request("agent.start", { kind: "agy", name: "agy-test-worker", paneId: pane.id, args: [] });
      await page.goto(`${appServer.origin}/#token=${appServer.token}`);
      await expect(page.locator(".xterm-helper-textarea").first()).toBeAttached({ timeout: 15000 });
      const bar = page.locator("[data-pane-statusline]").first();
      await expect(bar).toBeVisible({ timeout: 30000 });
      await expect(bar).toContainText("agy");
      await expect(bar).toContainText("Gemini E2E", { timeout: 30000 });
      await expect(bar).toContainText("42%");
      await expect(bar).toContainText("80000");
      await expect(bar).toContainText("gemini-weekly");
      await expect(bar).toContainText("25%");
      await expect(bar).not.toContainText("$");
      await page.screenshot({ path: `/tmp/antigravity-statusline-${mobile ? "mobile" : "desktop"}.png` });

      if (mobile) {
        await expect(page.locator(".mobile-shell")).toBeVisible();
        await page.locator(".mobile-shell-title").click();
        await page.locator("[data-picker-dashboard]").click();
      } else await page.locator('[data-screen-id="dashboard"]').click();
      const dashboard = mobile ? page.locator("dialog.dashboard-dialog") : page.locator("[data-dashboard]");
      await expect(dashboard).toBeVisible();
      const row = dashboard.locator(`[data-dash-row="${pane.id}"]`);
      await expect(row).toBeVisible({ timeout: 30000 });
      await expect(row).toContainText("Antigravity CLI");
      await expect(row).toContainText("Gemini E2E");
      await expect(row.locator("[data-dash-tokens]")).toContainText("85k");
      await expect(row.locator("[data-dash-tokens]")).toContainText("文脈内");
      await expect(row.locator("[data-dash-context]")).toContainText("42%");
      await expect(row.locator("[data-dash-cost] .dash-num")).toHaveText("—");
      const account = dashboard.locator("[data-dash-account]").filter({ hasText: "Antigravity CLI" });
      await expect(account).toBeVisible();
      const quota = account.locator("[data-dash-window]");
      await expect(quota).toContainText("gemini-weekly");
      await expect(quota.locator('[role="progressbar"]')).toHaveAttribute("aria-valuenow", "25");
      await expect(quota.locator(".dash-window-reset")).toBeVisible();
      await expect(dashboard).not.toContainText("$0");
      expect(await dashboard.evaluate(el => el.getBoundingClientRect().right <= innerWidth)).toBe(true);
      await page.screenshot({ path: `/tmp/antigravity-dashboard-${mobile ? "mobile" : "desktop"}.png` });
    } finally { client.close(); }
  });
}
