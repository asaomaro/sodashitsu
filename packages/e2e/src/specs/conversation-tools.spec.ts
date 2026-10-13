import { connect } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, appendFile, chmod, rm } from "node:fs/promises";
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
    ).join("\n") +
      "\n" +
      JSON.stringify({ message: { role: "system", content: "x".repeat(1500000) } }) +
      "\n",
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
  await writeFile(
    join(dir, "bin", "codex"),
    `#!${process.execPath}\nconsole.log(JSON.stringify({type:'turn.failed',error:{message:"The 'gpt-6-luna' model is not supported when using Codex with a ChatGPT account. private-diagnostic"}}));process.exitCode=1;`,
  );
  await chmod(join(dir, "bin", "codex"), 0o755);
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
test("Codexの要約モデルが使えない理由を画面に表示し、生の診断を公開しない", async ({
  page,
  appServer,
}) => {
  const client = await appServer.openClient(),
    pane = client.helloSnapshot()!.panes[0]!;
  await client.request("prefs.set", {
    patch: {
      agentHeaderActions: ["summary"],
      summarySettings: { kind: "codex", model: "GPT-6-Luna", sessionId: "" },
    },
  });
  await assertPaneResolvesFake({
    write: (input) => client.sendInput(pane.id, input),
    name: "claude",
    fakeDir: join(dir, "bin"),
    scratchDir: dir,
  });
  await client.request("agent.start", {
    paneId: pane.id,
    name: "summary-model-error",
    kind: "claude",
    args: [],
  });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  // 初期案内の消えない通知を利用者と同じ閉じるボタンで片付ける。
  await expect(page.locator('.pane-frame').first()).toBeVisible();
  for(const close of await page.locator('.toast-sticky .toast-close').all())await close.click();
  await page.getByRole("button", { name: "会話の要約", exact: true }).click();
  const window = page.locator(".conversation-window");
  await expect(window).toContainText("codex · GPT-6-Luna");
  await window.getByRole("button", { name: "要約を生成", exact: true }).click();
  await expect(window.getByRole("alert")).toContainText("指定した要約モデルを利用できません");
  await expect(window).not.toContainText("private-diagnostic");
  client.close();
});
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
  // 初期案内の消えない通知を利用者と同じ閉じるボタンで片付ける。
  await expect(page.locator('.pane-frame').first()).toBeVisible();
  for(const close of await page.locator('.toast-sticky .toast-close').all())await close.click();
  const window = page.locator(".conversation-window");
  await page.getByRole("button", { name: "送信メッセージ", exact: true }).click();
  await expect(window).toBeVisible();
  await expect(window).toBeFocused();
  const sent=window.getByRole('navigation',{name:'送信メッセージ一覧'});
  const sentMessages=sent.getByRole('button',{name:/会話E2E質問/});
  await expect(sentMessages.first()).toContainText('会話E2E質問0');
  await window.getByRole('combobox',{name:'送信メッセージの表示順'}).selectOption('newest');
  await expect(sentMessages.first()).toContainText('会話E2E質問10');
  await window.getByRole('combobox',{name:'送信メッセージの表示順'}).selectOption('oldest');
  await expect(sentMessages.first()).toContainText('会話E2E質問0');
  await expect
    .poll(async () => (await window.locator("header").boundingBox())!.height)
    .toBeLessThanOrEqual(28);
  const beforeResize = await window.boundingBox();
  expect(beforeResize).not.toBeNull();
  await page.mouse.move(
    beforeResize!.x + beforeResize!.width - 3,
    beforeResize!.y + beforeResize!.height - 3,
  );
  await page.mouse.down();
  await page.mouse.move(
    beforeResize!.x + beforeResize!.width - 123,
    beforeResize!.y + beforeResize!.height - 83,
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await window.boundingBox())!.width)
    .toBeLessThan(beforeResize!.width - 50);
  await expect
    .poll(async () => (await window.boundingBox())!.height)
    .toBeLessThan(beforeResize!.height - 30);

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
  await expect(window).toContainText("記録の一部を省略して要約しています。");
  await window.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "会話の要約", exact: true }).click();
  await expect(window.locator(".summary-result")).toContainText("会話E2Eの要約");
  await expect(window.getByRole("button", { name: "要約を更新", exact: true })).toBeVisible();
  await window.getByRole("button", { name: "履歴から作り直す", exact: true }).click();
  await expect(window.getByRole("button", { name: "要約を更新", exact: true })).toBeEnabled();
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
  // 初期案内の消えない通知を利用者と同じ閉じるボタンで片付ける。
  await expect(page.locator('.pane-frame').first()).toBeVisible();
  for(const close of await page.locator('.toast-sticky .toast-close').all())await close.click();
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
  // 初期案内の消えない通知を利用者と同じ閉じるボタンで片付ける。
  await expect(page.locator('.pane-frame').first()).toBeVisible();
  for(const close of await page.locator('.toast-sticky .toast-close').all())await close.click();
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

test("セッションメモを複数保存・検索・再読込し、ToDoと3段階のメニュー設定を表示する", async ({page,appServer}) => {
  const record=(status:string)=>JSON.stringify({message:{role:"assistant",content:[{type:"tool_use",name:"TodoWrite",input:{todos:[{content:"台本チェック",status},{content:"構成整理",status:"completed"},{content:"書き出し",status:"pending"}]}}]}})+"\n";
  await appendFile(join(dir,"config","projects","test",sid+".jsonl"),record("in_progress"));
  const client=await appServer.openClient(), pane=client.helloSnapshot()!.panes[0]!;
  await client.request("prefs.set",{patch:{uiStyle:"modern",agentHeaderActions:["notes","todos"],agentActionSettings:{notes:"display",todos:"menu"}}});
  await assertPaneResolvesFake({write:input=>client.sendInput(pane.id,input),name:"claude",fakeDir:join(dir,"bin"),scratchDir:dir});
  await client.request("agent.start",{paneId:pane.id,name:"session-tools-test",kind:"claude",args:[]});
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await expect(page.locator('.pane-frame').first()).toBeVisible();
  for(const close of await page.locator('.toast-sticky .toast-close').all()) await close.click();
  await page.getByRole("button",{name:"セッションのメモ",exact:true}).click();
  const win=page.getByRole("dialog",{name:"セッションのメモ",exact:true});
  await expect(win).toBeVisible();
  await win.getByLabel("タイトル",{exact:true}).fill("設計の記録");
  await win.getByLabel("グループ",{exact:true}).fill("仕様");
  await win.getByLabel("タグ（カンマ区切り）").fill("確認, 設計");
  await win.getByLabel("メモ",{exact:true}).fill("決定事項\n次回の検討");
  // A hook can report the same session again during editing. Wait on the browser's received update.
  const cdp=await page.context().newCDPSession(page); await cdp.send("Network.enable");
  const reported=new Promise<void>(resolve=>cdp.on("Network.webSocketFrameReceived",event=>{
    if(event.response.payloadData.includes('agentSession') && event.response.payloadData.includes('99999999-9999-4999-8999-999999999999'))resolve();
  }));
  await new Promise<void>((resolve,reject)=>{const socket=connect(join(appServer.stateDir,"agent-report.sock"),()=>socket.end(JSON.stringify({paneId:pane.id,kind:"claude",sessionId:sid})+"\n"));socket.on("error",reject);socket.on("close",()=>resolve());});
  await client.request("pane.rename",{paneId:pane.id,label:"same-session-refresh"});
  await reported; await cdp.detach();
  await expect(win.getByLabel("メモ",{exact:true})).toBeEnabled();
  await expect(win.getByLabel("メモ",{exact:true})).toHaveValue("決定事項\n次回の検討");

  await win.getByRole("button",{name:"保存",exact:true}).click();
  await expect(win.getByRole("button",{name:/設計の記録/})).toBeVisible();
  await win.getByRole("button",{name:"新しいメモ"}).click();
  await win.getByLabel("タイトル",{exact:true}).fill("レビュー結果");
  await win.getByLabel("メモ",{exact:true}).fill("修正を確認");
  await win.getByRole("button",{name:"保存",exact:true}).click();
  await expect(win.getByRole("button",{name:/レビュー結果/})).toBeVisible();
  await win.getByLabel("タグで絞り込み").selectOption("設計");
  await expect(win.getByRole("button",{name:/レビュー結果/})).toHaveCount(0);
  await win.getByRole("button",{name:/設計の記録/}).click();
  await expect(win.getByLabel("メモ",{exact:true})).toHaveValue("決定事項\n次回の検討");
  await page.screenshot({path:"/tmp/session-notes-desktop.png"});
  await page.setViewportSize({width:390,height:844});
  const bounds=await win.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.width).toBeLessThanOrEqual(390); expect(bounds!.height).toBeLessThanOrEqual(844);
  await page.screenshot({path:"/tmp/session-notes-mobile.png"});
  await page.setViewportSize({width:1280,height:720});
  await win.getByRole("button",{name:"閉じる",exact:true}).click();
  await page.reload();
  await page.getByRole("button",{name:"セッションのメモ",exact:true}).click();
  await expect(win.getByRole("button",{name:/設計の記録/})).toBeVisible();
  await win.getByRole("button",{name:"閉じる",exact:true}).click();
  // Menu-only remains callable, with no ToDo header button.
  await expect(page.locator('[data-pane-action="todos"]')).toHaveCount(0);
  await page.locator('.pane-frame').first().getByRole("button",{name:"このペインのメニュー",exact:true}).click();
  await page.getByRole("menuitem",{name:"エージェントのToDo",exact:true}).click();
  const todo=page.getByRole("dialog",{name:"エージェントのToDo",exact:true});
  await expect(todo).toContainText("参照専用");
  await expect(todo).toContainText("台本チェック");
  await expect(todo).toContainText("完了 1 / 3");
  await appendFile(join(dir,"config","projects","test",sid+".jsonl"),record("completed"));
  await expect(todo).toContainText("完了 2 / 3");
  await page.keyboard.press("Escape");
  await client.request("prefs.set",{patch:{agentActionSettings:{notes:"hidden",todos:"hidden"}}});
  await expect(page.locator('[data-pane-action="notes"]')).toHaveCount(0);
  await page.locator('.pane-frame').first().getByRole("button",{name:"このペインのメニュー",exact:true}).click();
  await expect(page.getByRole("menuitem",{name:"セッションのメモ",exact:true})).toHaveCount(0);
  const read=await exec(process.execPath,[CLI,"agent","notes",pane.id,"--url",appServer.origin,"--token",appServer.token]);
  expect(JSON.parse(read.stdout).notes).toHaveLength(2);
  const ownEnv:NodeJS.ProcessEnv={...process.env,SODA_PANE_ID:pane.id,SODA_SERVER_URL:appServer.origin,SODA_PANE_SOCKET:join(appServer.stateDir,"pane.sock")};
  delete ownEnv.SODACTL_URL; delete ownEnv.SODACTL_TOKEN;
  const own=await exec(process.execPath,[CLI,"agent","notes"],{env:ownEnv});
  expect(JSON.parse(own.stdout).notes).toHaveLength(2);
  const ownTasks=await exec(process.execPath,[CLI,"agent","todos"],{env:ownEnv});
  expect(JSON.parse(ownTasks.stdout).items.filter((task:{status:string})=>task.status==="completed")).toHaveLength(2);
  client.close();
});
