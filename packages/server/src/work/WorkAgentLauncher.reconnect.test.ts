import { createConnection, type Socket } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { WorkAgentLauncher, type WorkAgentRemote } from "./WorkAgentLauncher.js";
import { DesktopBridgeError } from "../desktop/bridgeRpc.js";
import type { SessionService } from "../session/SessionService.js";
import type { AgentStarter } from "../agent/AgentStarter.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});
async function fixture(plugin = false) {
  const dir = await mkdtemp(join(tmpdir(), "soda-proxy-reconnect-"));
  const id = randomUUID(),
    claim = randomUUID(),
    paneId = randomUUID(),
    localPane = randomUUID();
  const request = {
    id,
    paneId,
    workspaceId: randomUUID(),
    folder: "/remote",
    root: "/remote",
    identity: "a".repeat(64),
    agentKind: "claude",
    args: [],
    state: "claimed",
    expiresAt: Date.now() + 60000,
    ...(plugin ? { task: { pluginKey: "user:fixture", taskFile: "task.md" } } : {}),
  };
  let disconnected = false,
    authority = true,
    identity = request.identity,
    cutWrite = false,
    writes = 0,
    reportDenied = plugin,
    agentName = "";
  const inspection = () => ({
    folder: request.folder,
    root: request.root,
    identity,
    instructions: [],
    skills: [],
    platform: "linux",
  });
  function remote(initial: boolean) {
    let closed = false;
    return {
      valid: () => !closed && (!initial || !disconnected),
      close: vi.fn(() => {
        closed = true;
      }),
      request: vi.fn(async (method: string, params: any): Promise<any> => {
        if (method === "work.agent_claim") return { request, claim };
        if (method === "work.inspect") return inspection();
        if (method === "work.agent_check") {
          if (!authority) throw new DesktopBridgeError("rejected", "authority expired");
          return {};
        }
        if (method === "work.agent_poll" && reportDenied) {
          reportDenied = false;
          throw new DesktopBridgeError("rejected", "report failed");
        }
        if (method === "work.agent_tool") {
          if (!authority) throw new DesktopBridgeError("rejected", "tool denied");
          if (params.tool.action === "write") {
            writes++;
            if (cutWrite) {
              disconnected = true;
              throw new DesktopBridgeError("closed", "reply lost");
            }
          }
          return { content: "remote result", version: "a".repeat(64) };
        }
        return {};
      }),
    };
  }
  const initial = remote(true),
    replacement = remote(false);
  let attempts = 0;
  const connect = vi.fn(
    async () => (++attempts === 1 ? initial : replacement) as unknown as WorkAgentRemote,
  );
  let socket!: Socket,
    counter = 0,
    secret = "",
    reason: string | undefined;
  const pending = new Map<number, { resolve(v: any): void; reject(e: Error): void }>();
  function call(operation: string, tool?: unknown): Promise<any> {
    if (reason) return Promise.reject(Error(reason));
    const n = ++counter;
    return new Promise((resolve, reject) => {
      pending.set(n, { resolve, reject });
      socket.write(JSON.stringify({ id: n, secret, operation, tool }) + "\n");
    });
  }
  const start = vi.fn(async (p: any, _b: unknown, options: any) => {
    agentName = p.name;
    const cap = JSON.parse(await readFile(options.command.args.at(-1), "utf8"));
    secret = cap.secret;
    socket = createConnection(cap.socketPath);
    socket.on("error", () => {});
    socket.setEncoding("utf8");
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk;
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const m = JSON.parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        if (m.type === "proxy_closed") {
          reason = m.reason;
          for (const p of pending.values()) p.reject(Error(reason));
          pending.clear();
          continue;
        }
        const p = pending.get(m.id);
        if (!p) continue;
        pending.delete(m.id);
        if (m.error) p.reject(Error(m.error));
        else p.resolve(m.result);
      }
    });
    socket.on("close", () => {
      for (const p of pending.values()) p.reject(Error(reason ?? "socket closed"));
      pending.clear();
    });
    await new Promise<void>((r) => socket.once("connect", r));
    await call("started");
  });
  const logger = { info: vi.fn(), warn: vi.fn() };
  const session = {
    getPane: (id: string) =>
      id === localPane
        ? {
            id,
            agent: {
              instanceId: "operator-instance",
              kind: "claude",
              name: agentName,
              state: "idle",
            },
          }
        : undefined,
    createWorkspace: async () => ({
      workspace: { id: randomUUID() },
      tab: { id: randomUUID() },
      pane: { id: localPane },
    }),
  };
  const launcher = new WorkAgentLauncher(
    dir,
    session as unknown as SessionService,
    { start, isShellAvailable: async () => true } as unknown as AgentStarter,
    connect,
    undefined,
    undefined,
    { logger },
  );
  cleanups.push(async () => {
    launcher.close();
    socket?.destroy();
    await rm(dir, { recursive: true, force: true });
  });
  await launcher.launch("b".repeat(32), id);
  return {
    call,
    initial,
    replacement,
    logger,
    connect,
    id,
    claim,
    request,
    writes: () => writes,
    disconnect: () => {
      disconnected = true;
    },
    rejectAuthority: () => {
      authority = false;
    },
    changeIdentity: () => {
      identity = "c".repeat(64);
    },
    loseWriteReply: () => {
      cutWrite = true;
    },
  };
}
it.skipIf(process.platform === "win32")(
  "reuses the same local IPC after loss and validates the original claim and scope before a NEW read",
  async () => {
    const f = await fixture();
    f.disconnect();
    await expect(
      f.call("tool", { operation: "file", action: "read", path: "README.md" }),
    ).resolves.toMatchObject({ content: "remote result" });
    expect(f.replacement.request.mock.calls.map(([m]) => m)).toEqual([
      "work.agent_check",
      "work.inspect",
      "work.agent_check",
      "work.agent_tool",
    ]);
    expect(f.replacement.request.mock.calls[0]![1]).toEqual({ id: f.id, claim: f.claim });
    expect(f.replacement.request.mock.calls[1]![1]).toMatchObject({
      workspaceId: f.request.workspaceId,
      expectedRoot: f.request.root,
      expectedIdentity: f.request.identity,
    });
    expect(f.logger.info.mock.calls.map(([, fields]) => fields!.event)).toEqual([
      "disconnected",
      "reconnected",
    ]);
    expect(JSON.stringify(f.logger.info.mock.calls)).not.toContain(f.claim);
  },
);
it.skipIf(process.platform === "win32")(
  "does not replay an uncertain write after reconnecting",
  async () => {
    const f = await fixture();
    f.loseWriteReply();
    await expect(
      f.call("tool", {
        operation: "file",
        action: "write",
        path: "README.md",
        content: "secret content",
        version: "a".repeat(64),
      }),
    ).rejects.toThrow(/結果/);
    await expect(
      f.call("tool", { operation: "file", action: "read", path: "README.md" }),
    ).resolves.toMatchObject({ content: "remote result" });
    expect(f.writes()).toBe(1);
    expect(
      f.replacement.request.mock.calls.filter(
        ([m, p]) => m === "work.agent_tool" && p.tool.action === "write",
      ),
    ).toHaveLength(0);
    expect(JSON.stringify(f.logger.info.mock.calls)).not.toContain("secret content");
  },
);
it.skipIf(process.platform === "win32")(
  "refuses a different project identity and delivers a fixed terminal reason",
  async () => {
    const f = await fixture();
    f.disconnect();
    f.changeIdentity();
    await expect(f.call("tool", { operation: "inspect" })).rejects.toThrow(
      "target_validation_failed",
    );
    expect(f.replacement.request.mock.calls.some(([m]) => m === "work.agent_tool")).toBe(false);
    expect(f.logger.info).toHaveBeenCalledWith(
      "work agent proxy lifecycle",
      expect.objectContaining({ event: "closed", reason: "target_validation_failed" }),
    );
  },
);
it.skipIf(process.platform === "win32")(
  "closes a live non-plugin proxy after its original authority is revoked",
  async () => {
    const f = await fixture();
    f.rejectAuthority();
    await expect(
      f.call("tool", {
        operation: "file",
        action: "write",
        path: "README.md",
        content: "x",
        version: "a".repeat(64),
      }),
    ).rejects.toThrow("target_validation_failed");
    expect(f.writes()).toBe(0);
    expect(f.initial.request.mock.calls.some(([m]) => m === "work.agent_check")).toBe(true);
  },
);

it.skipIf(process.platform === "win32")(
  "closes on authority rejection from an exec's separate channel too",
  async () => {
    const f = await fixture();
    f.rejectAuthority();
    await expect(
      f.call("tool", { operation: "exec", command: "must not execute" }),
    ).rejects.toThrow("target_validation_failed");
    expect(f.initial.request.mock.calls.some(([m]) => m === "work.agent_check")).toBe(true);
  },
);

it.skipIf(process.platform === "win32")(
  "does not destroy a valid plugin proxy for a non-authority status-report rejection",
  async () => {
    const f = await fixture(true);
    await expect
      .poll(() =>
        f.logger.info.mock.calls.some(([, fields]) => fields?.event === "status_report_failed"),
      )
      .toBe(true);
    await expect(f.call("tool", { operation: "inspect" })).resolves.toMatchObject({
      content: "remote result",
    });
    expect(f.logger.info.mock.calls.some(([, fields]) => fields?.event === "closed")).toBe(false);
  },
);
