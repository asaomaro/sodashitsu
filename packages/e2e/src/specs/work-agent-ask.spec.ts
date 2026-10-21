import { spawn } from "node:child_process";
import { chmod, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openBrowser, dialog } from "../support/askForm.js";

test("remote-work agent asks on A; Markdown renders, answers return, and MCP exit cancels the form", async ({ page, appServer }) => {
  test.skip(process.platform === "win32", "fixture native CLI is a POSIX executable");
  test.setTimeout(90000);
  const bin = join(appServer.stateDir, "fixture-bin"), project = join(appServer.stateDir, "remote-project");
  await mkdir(bin); await mkdir(project);
  await writeFile(join(project, "design.md"), "# Remote project plan\n\n接続先で読んだ本文です。");
  const originalPath = process.env.PATH;
  await writeFile(join(bin, "claude"), `#!${process.execPath}\nsetInterval(()=>{},1000);\n`);
  await chmod(join(bin, "claude"), 0o700);
  process.env.PATH = bin + ":" + originalPath;
  const b = await startAppServer();
  let mcp: ReturnType<typeof spawn> | undefined;
  try {
    const aClient = await appServer.openClient(), bClient = await b.openClient();
    const target = await bClient.request("workspace.create", { cwd: project });
    await bClient.request("workspace.set_project_folder", { workspaceId: target.workspace.id, path: project });
    await bClient.request("ask.subscribe", {});
    const invitation = await aClient.request("machine.invite", { label: "remote-work-B" });
    await bClient.request("machine.delegate", { url: appServer.origin, machineId: invitation.machineId, token: invitation.token });
    await expect.poll(async () => (await aClient.request("machine.list", {})).machines.find(m => m.id === invitation.machineId)?.state).toBe("online");
    const request = await bClient.request("work.agent_request", { paneId: target.pane.id, agentKind: "claude", args: [] });
    await aClient.request("work.agent_launch", { machineId: invitation.machineId, requestId: request.id });
    const directory = join(appServer.stateDir, "work-agents", "launches", (await readdir(join(appServer.stateDir, "work-agents", "launches")))[0]!);
    const cli = fileURLToPath(new URL("../../../cli/dist/main.js", import.meta.url));
    mcp = spawn(process.execPath, [cli, "work-agent-mcp", join(directory, "capability.json")], { stdio: ["pipe", "pipe", "pipe"] });
    const replies = new Map<number, any>(); let buffer = "";
    mcp.stdout!.on("data", bytes => {
      buffer += String(bytes); let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) { const r = JSON.parse(buffer.slice(0, end)); replies.set(r.id, r); buffer = buffer.slice(end + 1); }
    });
    const send = (id: number, method: string, params?: object) => mcp!.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    send(1, "initialize", {});
    await expect.poll(() => replies.has(1)).toBe(true);
    send(9, "tools/call", { name: "remote_work", arguments: { operation: "file", action: "read", path: "design.md" } });
    await expect.poll(() => replies.has(9)).toBe(true);
    const remoteText = JSON.parse(replies.get(9).result.content[0].text).text;
    const ask = (id: number, title: string) => send(id, "tools/call", { name: "ask_user", arguments: {
      spec: { title, note: false, questions: [{ id: "ok", label: "接続先の案で進めますか", options: ["yes", "no"], default: "yes" }] },
      documents: [{ title: "接続先の設計", markdown: remoteText }],
    } });
    ask(10, "表示するブラウザがない");
    await expect.poll(() => replies.has(10)).toBe(true);
    expect(JSON.parse(replies.get(10).result.content[0].text)).toMatchObject({ status: "unavailable" });
    await openBrowser(page, appServer);
    ask(2, "操作元への確認");
    // UI is observed on A's browser; this is not inferred from the test client's ask event.
    await expect(dialog(page)).toBeVisible();
    await expect(page.locator("[data-ask-title]")).toHaveText("操作元への確認");
    await expect(page.frameLocator("iframe[data-ask-view-frame]").locator("h1")).toHaveText("Remote project plan");
    expect((await bClient.request("ask.subscribe", {})).asks).toEqual([]);
    await page.locator("[data-ask-submit]").click();
    await expect(dialog(page)).toHaveCount(0);
    await expect.poll(() => replies.has(2)).toBe(true);
    expect(JSON.parse(replies.get(2).result.content[0].text)).toMatchObject({ status: "answered", answers: { ok: "yes" } });
    ask(3, "閉じて取り消す");
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect.poll(() => replies.has(3)).toBe(true);
    expect(JSON.parse(replies.get(3).result.content[0].text)).toEqual({ status: "cancelled" });
    ask(4, "接続終了で取り消す");
    await expect(dialog(page)).toBeVisible();
    mcp.stdin!.end();
    await expect(dialog(page)).toHaveCount(0);
    await expect.poll(async () => (await readdir(directory)).filter(f => f.startsWith("ask-")).length).toBe(0);
  } finally {
    mcp?.kill(); await b.close();
    if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
    await rm(bin, { recursive: true, force: true });
  }
});
