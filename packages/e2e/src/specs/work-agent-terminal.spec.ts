import { spawn } from "node:child_process";
import { mkdtemp, mkdir, chmod, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeFrame, FRAME_TYPE } from "@sodashitsu/protocol";
import { expect, test } from "../support/fixtures.js";
import { startAppServer, type AppServer } from "../support/appServer.js";
import { openBrowser, dialog } from "../support/askForm.js";
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
// Real raw CLI/PTYS and browser-received output, fake native agent only.
for (const executionPC of ["A", "B"] as const)
  test(`work agent terminal on requester, execution PC ${executionPC}`, async ({
    page,
    context,
  }) => {
    test.skip(process.platform === "win32", "generated executable fixture uses POSIX shebang");
    test.setTimeout(90000);
    const dir = await mkdtemp(join(tmpdir(), "soda-work-terminal-e2e-")),
      bin = join(dir, "bin");
    await mkdir(bin);
    await writeFile(
      join(bin, "claude"),
      `#!${process.execPath}\nprocess.stdin.setRawMode(true);process.stdout.write('GENERATED_AGENT_READY\\r\\n');let text='';process.stdin.on('data',chunk=>{for(const char of chunk.toString()){if(char==='\\r'||char==='\\n'){if(text==='quit'){process.exit(0);}process.stdout.write('AGENT_RECEIVED:'+text+'\\r\\n');text='';}else text+=char;}});\n`,
    );
    await chmod(join(bin, "claude"), 0o700);
    const oldPath = process.env.PATH;
    process.env.PATH = bin + ":" + oldPath;
    const servers: AppServer[] = [];
    let mcp: ReturnType<typeof spawn> | undefined;
    try {
      const A = await startAppServer(),
        B = await startAppServer();
      servers.push(A, B);
      const executor = executionPC === "A" ? A : B,
        requester = executionPC === "A" ? B : A;
      const a = await executor.openClient(),
        b = await requester.openClient(),
        snapshot = b.helloSnapshot()!,
        pane = snapshot.panes[0]!,
        workspace = snapshot.workspaces[0]!;
      await b.request("workspace.set_project_folder", {
        workspaceId: workspace.id,
        path: requester.stateDir,
      });
      await b.request("prefs.set", { patch: { notifyHintDone: true } });
      await a.request("prefs.set", { patch: { notifyHintDone: true } });
      const invite = await a.request("machine.invite", { label: "Generated requester" });
      await b.request("machine.delegate", {
        url: executor.origin,
        machineId: invite.machineId,
        token: invite.token,
      });
      await expect
        .poll(
          async () =>
            (await a.request("machine.list", {})).machines.find((m) => m.id === invite.machineId)
              ?.state,
        )
        .toBe("online");
      let output = "";
      page.on("websocket", (s) =>
        s.on("framereceived", ({ payload }) => {
          if (typeof payload !== "string") {
            const frame = decodeFrame(new Uint8Array(payload));
            if (frame.type === FRAME_TYPE.OUTPUT && frame.paneId === pane.id)
              output += new TextDecoder().decode(frame.chunk);
          }
        }),
      );
      await openBrowser(page, requester);
      const operator = await context.newPage();
      await openBrowser(operator, executor);
      await operator.locator(`[data-machine-id="${invite.machineId}"] .machine-select`).click();
      const cli = fileURLToPath(new URL("../../../cli/dist/main.js", import.meta.url));
      b.sendInput(
        pane.id,
        [
          process.execPath,
          cli,
          "work",
          "agent",
          "--terminal-here",
          "--url",
          requester.origin,
          "--token",
          requester.token,
          "--pane",
          pane.id,
          "claude",
        ]
          .map(quote)
          .join(" ") + "\r",
      );
      await expect(
        operator.getByText("操作端末と質問フォームを依頼元PCの起動paneへ中継します。"),
      ).toBeVisible();
      await operator.getByRole("button", { name: "起動", exact: true }).click();
      await expect.poll(() => output, { timeout: 20000 }).toContain("GENERATED_AGENT_READY");
      await page.bringToFront();
      await page.locator(".xterm-helper-textarea").first().focus();
      await page.keyboard.type("from-requester");
      await page.keyboard.press("Enter");
      await expect.poll(() => output).toContain("AGENT_RECEIVED:from-requester");
      // No reverse general-machine registration is required by the terminal relay.
      expect((await b.request("machine.list", {})).machines).toHaveLength(0);
      const directory = join(
        executor.stateDir,
        "work-agents",
        "launches",
        (await readdir(join(executor.stateDir, "work-agents", "launches")))[0]!,
      );
      mcp = spawn(process.execPath, [cli, "work-agent-mcp", join(directory, "capability.json")], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      const replies = new Map<number, any>();
      let buffer = "";
      mcp.stdout!.on("data", (bytes) => {
        buffer += String(bytes);
        let end: number;
        while ((end = buffer.indexOf("\n")) >= 0) {
          const r = JSON.parse(buffer.slice(0, end));
          replies.set(r.id, r);
          buffer = buffer.slice(end + 1);
        }
      });
      const call = (id: number, title: string) =>
        mcp!.stdin!.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            method: "tools/call",
            params: {
              name: "ask_user",
              arguments: {
                timeoutMs: 30000,
                spec: {
                  title,
                  note: false,
                  questions: [
                    { id: "ok", label: "進めますか", options: ["yes", "no"], default: "yes" },
                  ],
                },
                documents: [{ title: "生成資料", markdown: "# Requester document" }],
              },
            },
          }) + "\n",
        );
      mcp.stdin!.write(
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) + "\n",
      );
      await expect.poll(() => replies.has(1)).toBe(true);
      call(2, "起動元への承認");
      await expect(dialog(page)).toBeVisible();
      await expect(dialog(operator)).toHaveCount(0);
      await expect(page.frameLocator("iframe[data-ask-view-frame]").locator("h1")).toHaveText(
        "Requester document",
      );
      // An actual user can take longer than the bridge RPC's former 10-second limit.
      await expect
        .poll(() => Date.now(), { timeout: 15000, intervals: [1000] })
        .toBeGreaterThan(Date.now() + 10500);
      await expect(dialog(page)).toBeVisible();
      await page.locator("[data-ask-submit]").click();
      await expect.poll(() => replies.has(2)).toBe(true);
      expect(JSON.parse(replies.get(2).result.content[0].text)).toMatchObject({
        status: "answered",
        answers: { ok: "yes" },
      });
      call(3, "取消の確認");
      await expect(dialog(page)).toBeVisible();
      mcp.stdin!.end();
      await expect(dialog(page)).toHaveCount(0);
      await expect
        .poll(async () => (await readdir(join(requester.stateDir, "work-agent-asks"))).length)
        .toBe(0);
      await page.locator(".xterm-helper-textarea").first().focus();
      await page.keyboard.type("quit");
      await page.keyboard.press("Enter");
      await expect.poll(() => output).toContain("\x1b[?1049l");
      await page.keyboard.type("printf 'REQUESTER_SHELL_BACK\\n'");
      await page.keyboard.press("Enter");
      await expect.poll(() => output).toContain("REQUESTER_SHELL_BACK");
      await operator.close();
    } finally {
      mcp?.kill();
      await Promise.all(servers.map((s) => s.close()));
      if (oldPath === undefined) delete process.env.PATH;
      else process.env.PATH = oldPath;
      await rm(dir, { recursive: true, force: true });
    }
  });
