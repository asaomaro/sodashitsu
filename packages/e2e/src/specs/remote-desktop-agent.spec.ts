import { openNativeTab } from "../support/nativeTab.js";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";

test("viewer grants one agent access; observe/action and human takeover stay isolated", async ({
  page,
  appServer,
  browser,
}) => {
  test.setTimeout(60000);
  const dir = await mkdtemp(join(tmpdir(), "soda-desktop-agent-")),
    record = join(dir, "input.jsonl");
  const helper = fileURLToPath(
    new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
  );
  const saved = process.env.SODA_DESKTOP_COMMAND,
    savedInput = process.env.SODA_DESKTOP_ALLOW_INPUT;
  process.env.SODA_DESKTOP_COMMAND = JSON.stringify([
    process.execPath,
    helper,
    "--allow-input",
    "--static",
    "--record",
    record,
  ]);
  process.env.SODA_DESKTOP_ALLOW_INPUT = "1";
  const provider = await startAppServer().finally(() => {
    if (saved === undefined) delete process.env.SODA_DESKTOP_COMMAND;
    else process.env.SODA_DESKTOP_COMMAND = saved;
    if (savedInput === undefined) delete process.env.SODA_DESKTOP_ALLOW_INPUT;
    else process.env.SODA_DESKTOP_ALLOW_INPUT = savedInput;
  });
  const owner = await provider.openClient(),
    agent = await appServer.openClient(),
    intruder = await appServer.openClient();
  const second = await browser.newContext();
  let reference: ChildProcessWithoutNullStreams | undefined;
  try {
    const invite = await agent.request("machine.invite", { label: "Agent desktop B" });
    await owner.request("machine.delegate", {
      url: appServer.origin,
      machineId: invite.machineId,
      token: invite.token,
    });
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const header = page.locator(`[data-machine-id="${invite.machineId}"]`);
    await expect(header.locator('[data-state="online"]')).toBeVisible({ timeout: 15000 });
    await openNativeTab(page, "desktop", header);
    const view = page.locator("[data-remote-desktop]"),
      canvas = view.getByLabel("共有画面");
    await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9][0-9]*$/);
    await expect(
      agent.request("desktop.agent.attach", { ticket: "x".repeat(43) }),
    ).rejects.toThrow();
    await view.locator("[data-agent-access] summary").click();
    await view
      .getByRole("button", { name: "エージェントへの画面提供・操作を許可", exact: true })
      .click();
    const code = view.getByLabel("エージェント接続コード");
    await expect(code).toHaveValue(/^[A-Za-z0-9_-]{43}$/);
    const ticket = await code.inputValue();
    const otherPage = await second.newPage();
    await otherPage.goto(`${appServer.origin}/#token=${appServer.token}`);
    await expect(otherPage.getByRole("button", { name: "新しいタブ", exact: true })).toBeVisible();
    await expect(otherPage.getByLabel("エージェント接続コード")).toHaveCount(0);
    await page.bringToFront();
    const lease = await agent.request("desktop.agent.attach", { ticket });
    await expect(view.locator("[data-desktop-status]")).toHaveText("エージェント操作中");
    await expect(code).toHaveCount(0);
    await expect(
      intruder.request("desktop.agent.observe", { leaseId: lease.leaseId }),
    ).rejects.toThrow();
    await expect(agent.request("desktop.agent.attach", { ticket })).rejects.toThrow();
    const observation = await agent.request("desktop.agent.observe", { leaseId: lease.leaseId });
    // The API image must decode to the pixels actually rendered in the viewer.
    expect(
      await canvas.evaluate(async (el, frame) => {
        const image = await createImageBitmap(
          new Blob([Uint8Array.from(atob(frame.imageBase64), (c) => c.charCodeAt(0))], {
            type: frame.format,
          }),
        );
        const off = new OffscreenCanvas(image.width, image.height),
          ctx = off.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        image.close();
        const c = el as HTMLCanvasElement;
        return (
          frame.width === c.width &&
          Array.from(ctx.getImageData(30, 30, 1, 1).data).join() ===
            Array.from(c.getContext("2d")!.getImageData(30, 30, 1, 1).data).join()
        );
      }, observation),
    ).toBe(true);
    const params = {
      leaseId: lease.leaseId,
      observationId: observation.observationId,
      inputs: [{ kind: "text" as const, text: "エージェント入力😀" }],
    };
    expect(await agent.request("desktop.agent.act", params)).toMatchObject({ acknowledged: 1 });
    await expect
      .poll(async () => readFile(record, "utf8").catch(() => ""))
      .toContain("エージェント入力😀");
    await expect(agent.request("desktop.agent.act", params)).rejects.toThrow();
    await view.getByRole("button", { name: "操作を引き取る", exact: true }).click();
    await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");
    await expect(
      agent.request("desktop.agent.observe", { leaseId: lease.leaseId }),
    ).rejects.toThrow();
    // Viewer sequence restarts independently of the agent/provider sequence.
    await canvas.click();
    await page.keyboard.press("b");
    await expect
      .poll(async () => readFile(record, "utf8").catch(() => ""))
      .toContain('"code":"KeyB"');
    await view
      .getByRole("button", { name: "エージェントへの画面提供・操作を許可", exact: true })
      .click();
    await expect(code).toBeVisible();
    const next = await agent.request("desktop.agent.attach", { ticket: await code.inputValue() });
    agent.close();
    await expect(view.locator("[data-desktop-status]")).toHaveText("閲覧中");
    await expect(
      intruder.request("desktop.agent.observe", { leaseId: next.leaseId }),
    ).rejects.toThrow();
    await view
      .getByRole("button", { name: "エージェントへの画面提供・操作を許可", exact: true })
      .click();
    await expect(code).toBeVisible();
    reference = spawn(
      process.execPath,
      [
        fileURLToPath(
          new URL("../../../../scripts/remote-desktop/agent-client.mjs", import.meta.url),
        ),
      ],
      {
        env: {
          ...process.env,
          SODACTL_URL: appServer.origin,
          SODACTL_COOKIE: appServer.cookie,
          SODA_DESKTOP_GRANT: await code.inputValue(),
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    reference.stderr.resume();
    const replies: {
      ready?: boolean;
      id?: string;
      result?: { observationId?: string; acknowledged?: number; released?: boolean };
    }[] = [];
    const lines = createInterface({ input: reference.stdout });
    lines.on("line", (line) => replies.push(JSON.parse(line)));
    await expect.poll(() => replies.some((r) => r.ready)).toBe(true);
    await expect(view.locator("[data-desktop-status]")).toHaveText("エージェント操作中");
    reference.stdin.write(JSON.stringify({ id: "observe", method: "observe" }) + "\n");
    await expect
      .poll(() => replies.find((r) => r.id === "observe")?.result?.observationId)
      .toMatch(/^[A-Za-z0-9_-]{43}$/);
    reference.stdin.write(
      JSON.stringify({
        id: "act",
        method: "act",
        observationId: replies.find((r) => r.id === "observe")!.result!.observationId,
        inputs: [{ kind: "text", text: "reference client" }],
      }) + "\n",
    );
    await expect.poll(() => replies.find((r) => r.id === "act")?.result?.acknowledged).toBe(1);
    await expect
      .poll(async () => readFile(record, "utf8").catch(() => ""))
      .toContain("reference client");
    reference.stdin.write(JSON.stringify({ id: "release", method: "release" }) + "\n");
    await expect.poll(() => replies.find((r) => r.id === "release")?.result?.released).toBe(true);
    await expect.poll(() => reference?.exitCode).toBe(0);
    await expect(view.locator("[data-desktop-status]")).toHaveText("閲覧中");
    await view.getByRole("button", { name: "共有停止", exact: true }).click();
    await expect(view).toHaveCount(0);
  } finally {
    reference?.stdin.end();
    reference?.kill();
    await second.close();
    await provider.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("reference client interrupts an unacknowledged action and relinquishes control on SIGTERM", async ({
  page,
  appServer,
}) => {
  test.setTimeout(45000);
  const dir = await mkdtemp(join(tmpdir(), "soda-desktop-agent-abort-")),
    record = join(dir, "input.jsonl");
  const helper = fileURLToPath(
    new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
  );
  const saved = process.env.SODA_DESKTOP_COMMAND,
    savedInput = process.env.SODA_DESKTOP_ALLOW_INPUT;
  process.env.SODA_DESKTOP_COMMAND = JSON.stringify([
    process.execPath,
    helper,
    "--allow-input",
    "--static",
    "--stall-input",
    "--record",
    record,
  ]);
  process.env.SODA_DESKTOP_ALLOW_INPUT = "1";
  const provider = await startAppServer().finally(() => {
    if (saved === undefined) delete process.env.SODA_DESKTOP_COMMAND;
    else process.env.SODA_DESKTOP_COMMAND = saved;
    if (savedInput === undefined) delete process.env.SODA_DESKTOP_ALLOW_INPUT;
    else process.env.SODA_DESKTOP_ALLOW_INPUT = savedInput;
  });
  let reference: ChildProcessWithoutNullStreams | undefined;
  try {
    const owner = await provider.openClient(),
      operator = await appServer.openClient();
    const invite = await operator.request("machine.invite", { label: "Agent abort B" });
    await owner.request("machine.delegate", {
      url: appServer.origin,
      machineId: invite.machineId,
      token: invite.token,
    });
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const header = page.locator(`[data-machine-id="${invite.machineId}"]`);
    await expect(header.locator('[data-state="online"]')).toBeVisible({ timeout: 15000 });
    await openNativeTab(page, "desktop", header);
    const view = page.locator("[data-remote-desktop]");
    await expect(view.locator("canvas")).toHaveAttribute("data-rendered-frames", /^[1-9][0-9]*$/);
    await view.locator("[data-agent-access] summary").click();
    await view
      .getByRole("button", { name: "エージェントへの画面提供・操作を許可", exact: true })
      .click();
    const ticket = view.getByLabel("エージェント接続コード");
    await expect(ticket).toHaveValue(/^[A-Za-z0-9_-]{43}$/);
    reference = spawn(
      process.execPath,
      [
        fileURLToPath(
          new URL("../../../../scripts/remote-desktop/agent-client.mjs", import.meta.url),
        ),
      ],
      {
        env: {
          ...process.env,
          SODACTL_URL: appServer.origin,
          SODACTL_COOKIE: appServer.cookie,
          SODA_DESKTOP_GRANT: await ticket.inputValue(),
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    reference.stderr.resume();
    const replies: { ready?: boolean; id?: string; result?: { observationId?: string } }[] = [];
    createInterface({ input: reference.stdout }).on("line", (line) =>
      replies.push(JSON.parse(line)),
    );
    await expect.poll(() => replies.some((r) => r.ready)).toBe(true);
    await expect(view.locator("[data-desktop-status]")).toHaveText("エージェント操作中");
    reference.stdin.write(JSON.stringify({ id: "view", method: "observe" }) + "\n");
    await expect
      .poll(() => replies.find((r) => r.id === "view")?.result?.observationId)
      .toMatch(/^[A-Za-z0-9_-]{43}$/);
    reference.stdin.write(
      JSON.stringify({
        id: "pending",
        method: "act",
        observationId: replies.find((r) => r.id === "view")!.result!.observationId,
        inputs: [{ kind: "key", code: "KeyA", down: true }],
      }) + "\n",
    );
    await expect
      .poll(async () => readFile(record, "utf8").catch(() => ""))
      .toContain('"code":"KeyA"');
    expect(replies.some((r) => r.id === "pending")).toBe(false);
    reference.kill("SIGTERM");
    await expect.poll(() => reference?.exitCode).toBe(0);
    await expect(view.locator("[data-desktop-status]")).toHaveText("閲覧中");
    await view.getByRole("button", { name: "操作する", exact: true }).click();
    await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");
  } finally {
    reference?.stdin.end();
    reference?.kill();
    await provider.close();
    await rm(dir, { recursive: true, force: true });
  }
});
