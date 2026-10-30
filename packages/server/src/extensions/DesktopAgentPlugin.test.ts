import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { expect, it, vi } from "vitest";
import { DesktopAgentAccess, type AgentTarget } from "../desktop/DesktopAgentAccess.js";
import { ExtensionDesktopAgents, EXTENSION_DESKTOP_METHODS } from "./ExtensionDesktopAgents.js";
import type { ApiExtension } from "./ExtensionApi.js";
import type { ExtPane } from "@sodashitsu/protocol";
it("runs the shipped Node plugin operations against actual human grants and memory inputs", async () => {
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL("../../../../plugins/desktop-agent/extension.mjs", import.meta.url))],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const stopped = once(child, "exit"),
    stderr: string[] = [];
  child.stderr.on("data", (value) => stderr.push(String(value)));
  const api = new DesktopAgentAccess(),
    key = "user:desktop-agent",
    runId = randomUUID();
  const ext: ApiExtension = {
    key,
    id: "desktop-agent",
    scope: "user",
    root: null,
    runId,
    tag: "test",
    allow: ["desktop-agent"],
    onUnresponsive: "pass",
  };
  const pane: ExtPane = {
    id: randomUUID(),
    tabId: randomUUID(),
    workspaceId: randomUUID(),
    workspaceLabel: "test",
    workspaceCwd: "/generated",
    label: "test",
    agent: null,
    plugin: { extensionKey: key, display: "desktop-agent" },
  };
  const send = (line: unknown) => child.stdin.write(JSON.stringify(line) + "\n");
  const bridge = new ExtensionDesktopAgents(api, () => ({ ext, panes: [pane], send }));
  const replies = new Map<string, { ok: boolean; result?: any; error?: string }>();
  let registered = false;
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    const message = JSON.parse(line);
    if (message.method === "app.register") {
      registered =
        message.params.operations.map((o: { name: string }) => o.name).join(",") ===
        "attach,observe,act,release";
      send({ type: "ext.result", id: message.id, ok: true, result: {} });
    } else if (message.method === "display.set")
      send({ type: "ext.result", id: message.id, ok: true, result: {} });
    else if (message.method === "app.result") replies.set(message.params.callId, message.params);
    else bridge.handle(key, runId, message);
  });
  const target: AgentTarget = {
    frame: () => ({
      info: { seq: 1, width: 1, height: 1, format: "image/png", captureMs: 0, encodeMs: 0 },
      image: new Uint8Array([1, 2, 3]),
      at: performance.now(),
    }),
    control: vi.fn(),
    state: vi.fn(),
    input: vi.fn(async () => {}),
    releaseInputs: vi.fn(),
  };
  const call = async (operation: string, params: unknown) => {
    const id = randomUUID();
    send({
      type: "app.call",
      callId: id,
      operation,
      params,
      target: { paneId: pane.id, tabId: pane.tabId, workspaceId: pane.workspaceId },
    });
    await vi.waitFor(() => expect(replies.has(id)).toBe(true));
    return replies.get(id)!;
  };
  try {
    send({
      type: "ext.hello",
      extension: { scope: "user", id: "desktop-agent" },
      methods: EXTENSION_DESKTOP_METHODS,
    });
    send({ type: "ext.panes", panes: [pane] });
    await vi.waitFor(() => expect(registered).toBe(true));
    const attached = await call("attach", { ticket: api.grant(target).ticket });
    expect(attached.ok).toBe(true);
    const leaseId = attached.result.leaseId;
    const observation = await call("observe", { leaseId });
    expect(observation).toMatchObject({ ok: true, result: { imageBase64: "AQID" } });
    expect(
      (
        await call("act", {
          leaseId,
          observationId: observation.result.observationId,
          inputs: [{ kind: "key", code: "KeyA", down: true }],
        })
      ).ok,
    ).toBe(true);
    expect(target.input).toHaveBeenCalledOnce();
    expect((await call("release", { leaseId })).ok).toBe(true);
    expect(target.control).toHaveBeenLastCalledWith(false);
    expect((await call("observe", { leaseId })).ok).toBe(false);
    expect(stderr).toEqual([]);
  } finally {
    bridge.stopped(key, runId);
    child.stdin.end();
    const timer = setTimeout(() => child.kill("SIGTERM"), 1000);
    try {
      await stopped;
    } finally {
      clearTimeout(timer);
      lines.close();
    }
  }
});
