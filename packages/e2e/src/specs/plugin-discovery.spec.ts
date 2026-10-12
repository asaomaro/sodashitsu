import { mkdtemp, mkdir, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "../support/fixtures.js";
import { focusTerminal, prefixKey } from "../support/keys.js";
test("placed project package remains inert until reviewed in settings, then runs with project scope", async ({
  page,
  appServer,
}) => {
  const root = await mkdtemp(join(tmpdir(), "soda-package-ui-"));
  try {
    const source = join(root, "plugins", "discovery-demo"),
      marker = join(root, "started");
    await mkdir(source, { recursive: true });
    await writeFile(
      join(source, "soda-plugin.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "discovery-demo",
        version: "1.0.0",
        name: "Discovery Demo",
        description: "placed project package",
        entry: "main.mjs",
        files: ["main.mjs"],
        allow: [],
      }),
    );
    await writeFile(
      join(source, "main.mjs"),
      `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},'started');process.stdin.resume();setInterval(()=>{},1000);`,
    );
    const client = await appServer.openClient(),
      workspace = client.helloSnapshot()!.workspaces[0]!;
    await client.request("workspace.set_project_folder", { workspaceId: workspace.id, path: root });
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    await page.waitForSelector(".xterm-helper-textarea");
    await focusTerminal(page);
    await prefixKey(page, "s");
    const settings = page.locator(".settings-dialog");
    await expect(settings).toHaveAttribute("open", "");
    const packages = settings.locator(".plugin-packages");
    const article = packages.locator("article").filter({ hasText: "Discovery Demo" });
    await expect(article).toBeVisible();
    await expect(access(marker)).rejects.toThrow();
    await article.getByRole("button", { name: "確認して登録", exact: true }).click();
    const review = packages.getByRole("region", { name: "パッケージ登録の確認" });
    await expect(review).toContainText(root);
    await review.getByRole("button", { name: "許可して登録・有効化", exact: true }).click();
    await expect(article).toHaveCount(0);
    await expect
      .poll(async () => {
        try {
          await access(marker);
          return true;
        } catch {
          return false;
        }
      })
      .toBe(true);
    await expect(
      settings.locator('[data-ext-id="discovery-demo"]').filter({ hasText: "discovery-demo" }),
    ).toContainText("動作中");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
