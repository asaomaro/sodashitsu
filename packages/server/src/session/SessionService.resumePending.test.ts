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
  let logger: MemoryLogger;

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
      logger: (logger = new MemoryLogger()),
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

  // --- 20261009-agent-resume-lost ---

  it("AC5: 復元で pane ごとに 1 行ログが出る（打ち込んだ pane は種類と会話 id の先頭 8 文字だけ。打ち込まなかった pane は理由）", () => {
    const written = logger.lines.find((l) => l.msg === "agent resume command written");
    expect(written?.fields).toEqual({ paneId: "p1", kind: "claude", session: "abc" });
    const skipped = logger.lines.find((l) => l.msg === "agent resume skipped");
    expect(skipped?.fields).toEqual({ paneId: "p2", reason: "no-session-ref" });
  });

  describe("会話の参照を捨てる猶予", () => {
    const report = () => service.reportAgentSession("p1", "claude", "conv-1");
    const refOf = () => service.getPane("p1")?.agentSession ?? null;

    it("エージェントが居なくなっても猶予（10 秒）の間は参照を残し、シェルが生きたまま過ぎたら捨てて 1 行ログに残す", () => {
      service.updatePaneRuntime("p1", { agent: agent() });
      report();
      service.updatePaneRuntime("p1", { agent: null });
      expect(refOf()?.sessionId).toBe("conv-1");
      now += 9_999;
      service.updatePaneRuntime("p1", { busy: false });
      expect(refOf()?.sessionId).toBe("conv-1");
      now += 1;
      service.updatePaneRuntime("p1", { busy: false });
      expect(refOf()).toBeNull();
      expect(logger.lines.filter((l) => l.msg.startsWith("agent session dropped"))).toHaveLength(1);
    });

    it("猶予の間にエージェントが戻れば、参照は捨てない", () => {
      service.updatePaneRuntime("p1", { agent: agent() });
      report();
      service.updatePaneRuntime("p1", { agent: null });
      now += 5_000;
      service.updatePaneRuntime("p1", { agent: agent({ instanceId: "a2" }) });
      now += 60_000;
      service.updatePaneRuntime("p1", { busy: false });
      expect(refOf()?.sessionId).toBe("conv-1");
    });

    it("新しい報告が来たら、前のエージェントの猶予は打ち切る（新しい参照は捨てない）", () => {
      service.updatePaneRuntime("p1", { agent: agent() });
      report();
      service.updatePaneRuntime("p1", { agent: null });
      now += 5_000;
      service.reportAgentSession("p1", "claude", "conv-2");
      now += 60_000;
      service.updatePaneRuntime("p1", { busy: false });
      expect(refOf()?.sessionId).toBe("conv-2");
    });

    it("止まる処理に入った後は、猶予を過ぎても、居なくなっても、捨てない", () => {
      service.updatePaneRuntime("p1", { agent: agent() });
      report();
      service.updatePaneRuntime("p1", { agent: null });
      service.beginShutdown();
      now += 60_000;
      service.updatePaneRuntime("p1", { busy: false });
      expect(refOf()?.sessionId).toBe("conv-1");
    });
  });
});
