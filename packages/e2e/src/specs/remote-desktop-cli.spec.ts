import { openNativeTab } from "../support/nativeTab.js";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";

for (const action of ["session", "mcp"] as const) {
  test(`integrated desktop ${action} uses a browser-issued grant and returns synthetic screenshot`, async ({
    page,
    appServer,
  }) => {
    test.setTimeout(45000);
    const saved = process.env.SODA_DESKTOP_COMMAND,
      savedInput = process.env.SODA_DESKTOP_ALLOW_INPUT;
    process.env.SODA_DESKTOP_COMMAND = JSON.stringify([
      process.execPath,
      fileURLToPath(
        new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
      ),
      "--static",
      "--allow-input",
    ]);
    process.env.SODA_DESKTOP_ALLOW_INPUT = "1";
    const provider = await startAppServer().finally(() => {
      if (saved === undefined) delete process.env.SODA_DESKTOP_COMMAND;
      else process.env.SODA_DESKTOP_COMMAND = saved;
      if (savedInput === undefined) delete process.env.SODA_DESKTOP_ALLOW_INPUT;
      else process.env.SODA_DESKTOP_ALLOW_INPUT = savedInput;
    });
    let child: ChildProcessWithoutNullStreams | undefined;
    try {
      const owner = await provider.openClient(),
        a = await appServer.openClient(),
        invite = await a.request("machine.invite", { label: "CLI B" });
      await owner.request("machine.delegate", {
        url: appServer.origin,
        machineId: invite.machineId,
        token: invite.token,
      });
      await page.goto(`${appServer.origin}/#token=${appServer.token}`);
      const header = page.locator(`[data-machine-id="${invite.machineId}"]`);
      await expect(header.locator('[data-state="online"]')).toBeVisible();
      await openNativeTab(page, "desktop", header);
      const view = page.locator("[data-remote-desktop]");
      await expect(view.getByLabel("共有画面")).toHaveAttribute(
        "data-rendered-frames",
        /^[1-9][0-9]*$/,
      );
      await view.locator("[data-agent-access] summary").click();
      await view
        .getByRole("button", { name: "エージェントへの画面提供・操作を許可", exact: true })
        .click();
      const code = view.getByLabel("エージェント接続コード");
      await expect(code).toHaveValue(/^[A-Za-z0-9_-]{43}$/);
      // Real command/parser/auth/lease, with an in-memory session cache so the user's cache is untouched.
      const module = new URL("../../../cli/dist/commands/desktop.js", import.meta.url).href,
        parser = new URL("../../../cli/dist/cliArgs.js", import.meta.url).href;
      const program = `import {runDesktop} from ${JSON.stringify(module)}; import {parseArgs} from ${JSON.stringify(parser)}; const originalWrite=process.stdout.write.bind(process.stdout); process.stdout.write=(chunk,...rest)=>originalWrite(typeof chunk==='string' && chunk.includes('"id":3') ? chunk+' '.repeat(2*1024*1024) : chunk,...rest); await runDesktop(parseArgs(['desktop',${JSON.stringify(action)},'--url',process.env.TEST_DESKTOP_URL]),{get:async()=>process.env.TEST_DESKTOP_COOKIE,set:async()=>{},clear:async()=>{}});`;
      child = spawn(process.execPath, ["--input-type=module", "-e", program], {
        env: {
          ...process.env,
          SODA_DESKTOP_GRANT: await code.inputValue(),
          TEST_DESKTOP_URL: appServer.origin,
          TEST_DESKTOP_COOKIE: appServer.cookie,
        },
        stdio: "pipe",
      });
      let output = "",
        stderr = "";
      child.stdout.on("data", (value) => (output += String(value)));
      child.stderr.on("data", (value) => (stderr += String(value)));
      const messages = () =>
        output
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line));
      if (action === "mcp") {
        child.stdin.write(
          '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25"}}\n',
        );
        await expect.poll(() => messages().some((m) => m.id === 1)).toBe(true);
        child.stdin.write(
          '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"desktop_observe","arguments":{}}}\n',
        );
        await expect.poll(() => messages().some((m) => m.id === 2)).toBe(true);
        expect(messages().find((m) => m.id === 2).result.content[0]).toMatchObject({
          type: "image",
          mimeType: "image/png",
        });
      } else {
        await expect.poll(() => messages().some((m) => m.ready)).toBe(true);
        child.stdin.write('{"id":2,"method":"observe"}\n');
        await expect.poll(() => messages().some((m) => m.id === 2)).toBe(true);
        expect(messages().find((m) => m.id === 2).result).toMatchObject({
          format: "image/png",
          width: 1280,
        });
      }
      await expect(view.locator("[data-desktop-status]")).toHaveText("エージェント操作中");
      // Leave a screenshot write blocked in an unread OS pipe, then cancel the real CLI.
      // The child harness pads response 3 with legal JSON whitespace to force an OS pipe blockage.
      // The terminal command must exit as well as relinquish its lease.
      child.stdout.pause();
      child.stdout.removeAllListeners("data");
      child.stdin.write(
        action === "mcp"
          ? '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"desktop_observe","arguments":{}}}\n'
          : '{"id":3,"method":"observe"}\n',
      );
      await expect.poll(() => child!.stdout.readableLength).toBeGreaterThan(0);
      child.kill("SIGTERM");
      await expect.poll(() => child!.exitCode, { timeout: 6000 }).not.toBeNull();
      expect(stderr).toBe("");
      await expect(view.locator("[data-desktop-status]")).toHaveText("閲覧中");
      await view.getByRole("button", { name: "共有停止", exact: true }).click();
    } finally {
      if (child?.exitCode === null) child.kill("SIGKILL");
      await provider.close();
    }
  });
}
