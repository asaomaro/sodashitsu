import type { AgentInfo, HostInfo } from "@sodashitsu/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import type { Disposable } from "../util/Disposable.js";
import { MemoryLogger } from "../log/Logger.js";
import { EventBus } from "../bus/EventBus.js";
import type { CreatePaneOptions, TerminalManager } from "../terminal/TerminalManager.js";
import type { TerminalHost } from "../terminal/TerminalHost.js";
import type { PersistScheduler } from "./PersistScheduler.js";
import { SessionModel } from "./SessionModel.js";
import { SessionService } from "./SessionService.js";

/** 復元で打ち込んだ会話の再開の「まだ検出されていない」間（20260926-agent-start の cross 点検。`agent start` はその pane に打ち込まない）。 */

class FakeHost implements TerminalHost {
  readonly pid = 4242;
  constructor(readonly paneId: string) {}
  readonly mirror = {} as TerminalHost["mirror"];
  readonly fanout = {} as TerminalHost["fanout"];
  write(): void {}
  writeModal(): Promise<void> {
    return Promise.resolve();
  }
  resize(): void {}
  lastOutputAt(): number {
    return 0;
  }
  onExit(): Disposable {
    return { dispose: () => undefined };
  }
  dispose(): void {}
}

class FakeTerminals implements TerminalManager {
  private readonly hosts = new Map<string, FakeHost>();
  create(paneId: string, _opts: CreatePaneOptions): TerminalHost {
    const host = new FakeHost(paneId);
    this.hosts.set(paneId, host);
    return host;
  }
  get(paneId: string): TerminalHost | undefined {
    return this.hosts.get(paneId);
  }
  resize(): void {}
  dispose(paneId: string): void {
    this.hosts.delete(paneId);
  }
}

class CountingPersist implements PersistScheduler {
  touch(): void {}
  async flush(): Promise<void> {}
  cancel(): void {}
}

const HOST_INFO: HostInfo = { os: "linux", windowsBuild: null, hostname: "test-host" };

function agent(patch: Partial<AgentInfo> = {}): AgentInfo {
  return {
    instanceId: "a1",
    kind: "claude",
    label: "Claude Code",
    state: "idle",
    completionSeq: 0,
    serverSeenSeq: 0,
    verified: true,
    since: 1000,
    ...patch,
  };
}

describe("SessionService — hasPendingResume", () => {
  let now: number;
  let service: SessionService;

  beforeEach(async () => {
    now = 1_000_000;
    service = new SessionService({
      model: new SessionModel(),
      terminals: new FakeTerminals(),
      bus: new EventBus(),
      persist: new CountingPersist(),
      serverVersion: "0.1.0-test",
      host: HOST_INFO,
      scrollbackLines: 1000,
      spawnGraceMs: 0,
      defaultCwd: "/home/u",
      logger: new MemoryLogger(),
      clock: { now: () => now },
    });
    const pane = (
      id: string,
      agentSession?: { kind: string; sessionId: string; reportedAt: number },
    ) => ({
      id,
      label: null,
      cwd: "/r",
      shell: "/bin/sh",
      ...(agentSession ? { agentSession } : {}),
    });
    await service.restore({
      schema: 1,
      savedAt: "2026-09-26T00:00:00Z",
      groups: [],
      workspaces: [
        {
          id: "w1",
          label: "w1",
          cwd: "/r",
          activeTabId: "t1",
          tabs: [
            {
              id: "t1",
              label: "1",
              focusedPaneId: "p1",
              zoomedPaneId: null,
              layout: {
                type: "split",
                id: "s1",
                dir: "right",
                ratio: 0.5,
                a: { type: "pane", paneId: "p1" },
                b: { type: "pane", paneId: "p2" },
              },
              panes: [pane("p1", { kind: "claude", sessionId: "abc", reportedAt: 1 }), pane("p2")],
            },
          ],
        },
      ],
      focus: null,
    });
  });

  it("再開コマンドを打ち込んだ pane は 30 秒の間 true で、過ぎたら false。打ち込んでいない pane は false", () => {
    expect(service.hasPendingResume("p1")).toBe(true);
    expect(service.hasPendingResume("p2")).toBe(false);
    now += 30_000;
    expect(service.hasPendingResume("p1")).toBe(true);
    now += 1;
    expect(service.hasPendingResume("p1")).toBe(false);
  });

  it("pane を閉じたら記録を消す（review ラウンド 1）", async () => {
    expect(service.hasPendingResume("p1")).toBe(true);
    await service.closePane("p1");
    expect(service.hasPendingResume("p1")).toBe(false);
  });

  it("エージェントが検出されたら false", () => {
    service.updatePaneRuntime("p1", { agent: agent({ instanceId: "a9" }) });
    expect(service.hasPendingResume("p1")).toBe(false);
  });
});
