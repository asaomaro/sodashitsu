import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { assertPaneResolvesFake } from "@sodashitsu/server";
import { test, expect } from "../support/fixtures.js";
import { prefixKey, focusTerminal } from "../support/keys.js";
const exec = promisify(execFile),
  dir = await mkdtemp(join(tmpdir(), "soda-e2e-conversation-"));
const saved = { PATH: process.env["PATH"], CLAUDE_CONFIG_DIR: process.env["CLAUDE_CONFIG_DIR"] };
const sid = "99999999-9999-4999-8999-999999999999";
const CLI = resolve("../cli/dist/main.js");
test.beforeAll(async () => {
  await mkdir(join(dir, "bin"));
  await mkdir(join(dir, "config", "projects", "test"), { recursive: true });
  await writeFile(
    join(dir, "config", "projects", "test", sid + ".jsonl"),
    Array.from({ length: 12 }, (_, i) =>
      JSON.stringify({
        cwd: dir,
        timestamp: "2026-10-11T00:00:00Z",
        message: {
          role: i % 2 ? "assistant" : "user",
          content: [{ type: "text", text: i % 2 ? "回答" + i : "会話E2E質問" + i }],
        },
      }),
    ).join("\n") + "\n",
  );
  const fake = join(dir, "agent.mjs");
  await writeFile(
    fake,
    `import {connect} from 'node:net';const args=process.argv.slice(2);if(args.includes('-p')){process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({result:'目的: 会話E2Eの要約',session_id:args[args.indexOf('--session-id')+1]})));}else{process.stdin.setRawMode(true);process.stdin.resume();process.stdout.write('\\x1b[2J\\x1b[H\\x1b]0;✳ fake\\x07fake ready\\r\\n'+'─'.repeat(40)+'\\r\\n❯ \\r\\n'+'─'.repeat(40)+'\\r\\n  ? for shortcuts\\r\\n');const c=connect(process.env.SODA_AGENT_REPORT_SOCKET,()=>c.end(JSON.stringify({paneId:process.env.SODA_PANE_ID,kind:'claude',sessionId:'${sid}'})+'\\n'));c.on('error',()=>{});setInterval(()=>{},1000);}`,
  );
  await writeFile(
    join(dir, "bin", "claude"),
    `#!/bin/bash\nexec -a claude ${JSON.stringify(process.execPath)} ${JSON.stringify(fake)} "$@"\n`,
  );
  await chmod(join(dir, "bin", "claude"), 0o755);
  process.env["PATH"] = join(dir, "bin") + delimiter + (saved.PATH ?? "");
  process.env["CLAUDE_CONFIG_DIR"] = join(dir, "config");
});
test.afterAll(async () => {
  for (const [k, v] of Object.entries(saved))
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  await rm(dir, { recursive: true, force: true });
});
test.setTimeout(90000);
test("会話窓へフォーカス、メッセージ選択、要約、過去一覧を画面で確認する", async ({
  page,
  appServer,
}) => {
  const client = await appServer.openClient(),
    pane = client.helloSnapshot()!.panes[0]!;
  await client.request("prefs.set", {
    patch: { uiStyle: "modern", agentHeaderActions: ["messages", "summary"] },
  });
  await assertPaneResolvesFake({
    write: (input) => client.sendInput(pane.id, input),
    name: "claude",
    fakeDir: join(dir, "bin"),
    scratchDir: dir,
  });
  await client.request("agent.start", {
    paneId: pane.id,
    name: "conversation-test",
    kind: "claude",
    args: [],
  });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  const window = page.locator(".conversation-window");
  await page.getByRole("button", { name: "送信メッセージ", exact: true }).click();
  await expect(window).toBeVisible();
  await expect(window).toBeFocused();
  await expect(
    window.getByRole("navigation").getByRole("button").filter({ hasText: "会話E2E質問" }),
  ).toHaveCount(6);
  await window
    .getByRole("navigation")
    .getByRole("button")
    .filter({ hasText: "会話E2E質問10" })
    .click();
  await expect(window.locator("article.message-selected")).toContainText("会話E2E質問10");
  await page.keyboard.press("Escape");
  await expect(window).toBeHidden();
  await page.getByRole("button", { name: "会話の要約", exact: true }).click();
  await window.getByRole("button", { name: "要約を生成", exact: true }).click();
  await expect(window.locator(".summary-result")).toContainText("会話E2Eの要約");
  await window.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.locator("[data-screen-id=dashboard]").first().click();
  const past = page.locator(".past-sessions");
  await expect(past).toBeVisible();
  await past.getByLabel("過去セッションを検索").fill("会話E2E");
  await past.getByRole("button", { name: "検索・更新", exact: true }).click();
  await expect(past).toContainText("会話E2E質問0");
  client.close();
});
test("現役エージェントがなくても過去セッション一覧を開ける", async ({ page, appServer }) => {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.locator("[data-screen-id=dashboard]").first().click();
  await expect(page.locator(".past-sessions")).toBeVisible();
});
test("配布プラグインをCLIから操作し、JSON結果と画面の内容を確認する", async ({
  page,
  appServer,
}) => {
  const root = join(dir, "repo");
  await mkdir(root, { recursive: true });
  await exec("git", ["init", root]);
  await writeFile(join(root, "file"), "test");
  await exec("git", ["-C", root, "add", "file"]);
  await exec("git", [
    "-C",
    root,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "-m",
    "cli-plugin-history",
  ]);
  const bundle = join(dir, "graph.sodaplugin");
  for (const args of [
    ["plugin", "pack", resolve("../../plugins/commit-graph"), "--out", bundle],
    ["plugin", "install", bundle, "--state-dir", appServer.stateDir],
    ["plugin", "enable", "commit-graph", "--state-dir", appServer.stateDir],
  ])
    await exec(process.execPath, [CLI, ...args]);
  const c = await appServer.openClient();
  await c.request("extension.reload", {});
  const ws = await c.request("workspace.create", { cwd: root, label: "CLI plugin" });
  await c.request("workspace.set_project_folder", { workspaceId: ws.workspace.id, path: root });
  const tab = await c.request("tab.create", {
    workspaceId: ws.workspace.id,
    label: "Graph",
    plugin: { extensionKey: "user:commit-graph", display: "commit-graph" },
  });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await expect(
    page.frameLocator("[data-plugin-view] iframe[data-display-frame]").locator("pre"),
  ).toContainText("cli-plugin-history");
  const opts = ["--url", appServer.origin, "--token", appServer.token];
  const operations = JSON.parse(
    (
      await exec(process.execPath, [
        CLI,
        "plugin",
        "operations",
        "commit-graph",
        "--tab",
        tab.tab.id,
        ...opts,
      ])
    ).stdout,
  );
  expect(operations.operations.map((o: { name: string }) => o.name)).toContain("history");
  const result = JSON.parse(
    (
      await exec(process.execPath, [
        CLI,
        "plugin",
        "call",
        "commit-graph",
        "history",
        "--workspace",
        ws.workspace.id,
        "--params",
        '{"limit":1}',
        ...opts,
      ])
    ).stdout,
  );
  expect(result.result.history).toContain("cli-plugin-history");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page
      .frameLocator(".mobile-app-view iframe[data-display-frame]")
      .getByRole("heading", { name: "コミット履歴（モバイル）", exact: true }),
  ).toBeVisible();
  await expect(
    page.frameLocator(".mobile-app-view iframe[data-display-frame]").locator("pre"),
  ).toContainText("cli-plugin-history");
  await expect(page.locator(".mobile-app-view")).toHaveCount(1);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(
    page
      .frameLocator("[data-plugin-view] iframe[data-display-frame]")
      .getByRole("heading", { name: "コミットグラフ", exact: true }),
  ).toBeVisible();
  c.close();
});
