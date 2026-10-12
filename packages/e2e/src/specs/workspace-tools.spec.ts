import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUILTIN_WORKSPACE_KEY } from "@sodashitsu/protocol";
import { expect, test } from "../support/fixtures.js";
test("standard development tab browses/searches/edits files and shows actual Git diffs without plugins", async ({
  page,
  appServer,
}) => {
  const root = await mkdtemp(join(tmpdir(), "soda-tools-e2e-"));
  try {
    const git = (args: string[]) =>
      execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
    git(["init"]);
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "src", "hello.txt"),
      "original\n" + Array.from({ length: 80 }, () => "filler").join("\n") + "\nfind-me\n",
    );
    git(["add", "."]);
    git([
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-m",
      "initial work",
    ]);
    const commit = git(["rev-parse", "HEAD"]).trim();
    const client = await appServer.openClient();
    const ws = client.helloSnapshot()!.workspaces[0]!;
    await client.request("workspace.set_project_folder", { workspaceId: ws.id, path: root });
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    await page.getByRole("button", { name: "新しいタブ", exact: true }).click();
    const dialog = page.locator(".name-dialog");
    await dialog.getByLabel("タブの種類").selectOption(BUILTIN_WORKSPACE_KEY);
    await dialog.getByRole("button", { name: "OK", exact: true }).click();
    const dev = page.locator('[data-workspace-view="development"]');
    await expect(dev).toBeVisible();
    const tree = dev.locator('[data-workspace-view="files"]');
    const file = dev.locator('[data-workspace-view="file"]');
    await tree.getByRole("button", { name: "▸ src", exact: true }).click();
    await tree.getByRole("button", { name: "· hello.txt", exact: true }).click();
    await expect(file.locator(".workspace-code")).toContainText("original");
    await tree.getByLabel("ファイル検索語").fill("HELLO");
    await tree.getByRole("button", { name: "検索", exact: true }).click();
    await expect(tree.locator(".workspace-list")).toContainText("src/hello.txt");
    await tree.getByLabel("内容をGrep", { exact: true }).check();
    await tree.getByLabel("ファイル検索語").fill("find-me");
    await tree.getByRole("button", { name: "検索", exact: true }).click();
    await expect(tree.locator(".workspace-list")).toContainText("src/hello.txt:82");
    await tree.locator(".workspace-list button").filter({ hasText: "src/hello.txt:82" }).click();
    await expect(file.locator(".selected-line")).toContainText("find-me");
    await expect
      .poll(() => file.locator(".workspace-code").evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    await file.getByLabel("編集", { exact: true }).check();
    await file.getByLabel("ファイル編集").fill("changed\nfind-me\n");
    await file.getByRole("button", { name: "保存", exact: true }).click();
    await expect(file.getByRole("status")).toContainText("保存しました");
    expect(await readFile(join(root, "src", "hello.txt"), "utf8")).toBe("changed\nfind-me\n");
    await dev
      .locator(".development-mobile-nav")
      .getByRole("button", { name: "差分", exact: true })
      .click();
    const diff = dev.locator('[data-workspace-view="git-diff"]');
    await diff.getByRole("button", { name: "再読込", exact: true }).click();
    await expect(diff.locator(".workspace-code")).toContainText("+changed");
    await dev
      .locator(".development-mobile-nav")
      .getByRole("button", { name: "Gitグラフ", exact: true })
      .click();
    const graph = dev.locator('[data-workspace-view="git-graph"]');
    await expect(graph).toContainText("initial work");
    await expect(graph.locator("svg")).toBeVisible();
    await expect(graph.locator("circle")).not.toHaveCount(0);
    await page.screenshot({path:"/tmp/status-native-git-web.png"});
    await graph.locator(`button[title="${commit}"]`).click();
    await expect(diff).toBeVisible();
    await expect(diff.getByLabel("コミットSHA")).toHaveValue(commit);
    await page.setViewportSize({ width: 390, height: 700 });
    await expect(page.locator(".mobile-shell")).toBeVisible();
    await expect(page.locator('[data-workspace-view="development"]')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("tab and pane view entry points fix the target and ask for placement", async ({
  page,
  appServer,
}) => {
  const root = await mkdtemp(join(tmpdir(), "soda-view-target-"));
  try {
    const client = await appServer.openClient();
    const snap = client.helloSnapshot()!,
      ws = snap.workspaces[0]!,
      pane = snap.panes[0]!;
    await client.request("workspace.set_project_folder", { workspaceId: ws.id, path: root });
    await client.request("prefs.set", { patch: { uiStyle: "modern" } });
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    await page.getByRole("button", { name: "ビューを追加", exact: true }).click();
    const picker = page.locator(".view-picker");
    await expect(picker).toContainText("情報の対象: タブ全体");
    await expect(picker.getByLabel("表示対象")).toHaveCount(0);
    await picker
      .getByLabel("ビュー", { exact: true })
      .selectOption(JSON.stringify([BUILTIN_WORKSPACE_KEY, "files"]));
    await picker.getByLabel("配置", { exact: true }).selectOption("left");
    await picker.getByRole("button", { name: "追加", exact: true }).click();
    await expect(page.locator('[data-workspace-view="files"]')).toBeVisible();
    await page
      .locator(`[data-pane-id="${pane.id}"]`)
      .getByRole("button", { name: "このペインにビューを追加", exact: true })
      .first()
      .click();
    await expect(picker).toContainText("情報の対象: このペイン");
    await expect(picker.getByLabel("ビュー", { exact: true }).locator("option")).toHaveCount(2);
    await expect(picker.getByLabel("ビュー", { exact: true })).toContainText("Statusline");
    await expect(picker.getByLabel("ビュー", { exact: true })).not.toContainText("ファイルツリー");
    await picker.getByRole("button", { name: "キャンセル", exact: true }).click();
    await expect(page.locator('[data-workspace-view="files"]')).toBeVisible();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
