import type { AgentInfo, HostInfo, ServerEvent } from "@sodashitsu/protocol";
import { RpcError } from "@sodashitsu/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import type { Disposable } from "../util/Disposable.js";
import { MemoryLogger } from "../log/Logger.js";
import { EventBus } from "../bus/EventBus.js";
import type { CreatePaneOptions, TerminalManager } from "../terminal/TerminalManager.js";
import type { TerminalHost } from "../terminal/TerminalHost.js";
import type { PersistScheduler } from "./PersistScheduler.js";
import { SessionModel } from "./SessionModel.js";
import { SessionService } from "./SessionService.js";

/** エージェントの名前（20260926-agent-start-rename design「名前の引き継ぎ」「`SessionService.renameAgent`」）。 */

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
  touchCount = 0;
  touch(): void {
    this.touchCount++;
  }
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

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof RpcError) return err.code;
    throw err;
  }
  throw new Error("expected an RpcError");
}

describe("SessionService — エージェントの名前", () => {
  let service: SessionService;
  let persist: CountingPersist;
  let events: ServerEvent[];
  let p1: string;
  let p2: string;

  beforeEach(async () => {
    const bus = new EventBus();
    persist = new CountingPersist();
    service = new SessionService({
      model: new SessionModel(),
      terminals: new FakeTerminals(),
      bus,
      persist,
      serverVersion: "0.1.0-test",
      host: HOST_INFO,
      scrollbackLines: 1000,
      spawnGraceMs: 0,
      defaultCwd: "/home/u",
      logger: new MemoryLogger(),
    });
    const { pane } = await service.createWorkspace("/home/u", "api");
    p1 = pane.id;
    p2 = (await service.splitPane(p1, "right", undefined)).pane.id;
    service.updatePaneRuntime(p1, { agent: agent({ instanceId: "a1" }) });
    service.updatePaneRuntime(p2, {
      agent: agent({ instanceId: "a2", kind: "codex", label: "Codex" }),
    });
    events = [];
    bus.subscribe((e) => events.push(e));
  });

  it("名前を付けると Pane.agent に載り、他のクライアントへ pane.agent_status_changed が届き、変更後の AgentInfo を返す（AC1・AC12）", () => {
    const touched = persist.touchCount;
    const result = service.renameAgent(p1, undefined, "reviewer");
    expect(result).toEqual(agent({ instanceId: "a1", name: "reviewer" }));
    expect(service.getPane(p1)?.agent?.name).toBe("reviewer");
    expect(events).toEqual([
      { event: "pane.agent_status_changed", data: { paneId: p1, agent: result } },
    ]);
    expect(persist.touchCount).toBe(touched); // 名前は保存しない
  });

  it("null で外すと name の項目ごと消え、発行される（AC2・AC12）", () => {
    service.renameAgent(p1, undefined, "reviewer");
    events.length = 0;
    const result = service.renameAgent(p1, "a1", null);
    expect("name" in result).toBe(false);
    expect(service.getPane(p1)?.agent).toEqual(agent({ instanceId: "a1" }));
    expect(events.map((e) => e.event)).toEqual(["pane.agent_status_changed"]);
  });

  it("別の名前への付け替えも発行される", () => {
    service.renameAgent(p1, undefined, "reviewer");
    events.length = 0;
    service.renameAgent(p1, undefined, "writer");
    expect(service.getPane(p1)?.agent?.name).toBe("writer");
    expect(events.map((e) => e.event)).toEqual(["pane.agent_status_changed"]);
  });

  it("書式に外れる名前は invalid_agent_name で何も変えない（AC3）", () => {
    service.renameAgent(p1, undefined, "reviewer");
    events.length = 0;
    for (const bad of [
      "",
      "Reviewer",
      "1reviewer",
      "reviewer one",
      "reviewer.one",
      "a".repeat(33),
    ]) {
      expect(
        codeOf(() => service.renameAgent(p1, undefined, bad)),
        bad,
      ).toBe("invalid_agent_name");
    }
    expect(service.getPane(p1)?.agent?.name).toBe("reviewer");
    expect(events).toEqual([]);
  });

  it("他のエージェントが使っている名前は agent_name_taken で、どちらも変えない（AC4）", () => {
    service.renameAgent(p2, undefined, "reviewer");
    service.renameAgent(p1, undefined, "writer");
    events.length = 0;
    expect(codeOf(() => service.renameAgent(p1, undefined, "reviewer"))).toBe("agent_name_taken");
    expect(service.getPane(p1)?.agent?.name).toBe("writer");
    expect(service.getPane(p2)?.agent?.name).toBe("reviewer");
    expect(events).toEqual([]);
  });

  it("同じエージェントへの同じ名前の付け直し・名前なしへの null は成功し、発行しない（AC4）", () => {
    service.renameAgent(p1, undefined, "reviewer");
    events.length = 0;
    expect(service.renameAgent(p1, undefined, "reviewer").name).toBe("reviewer");
    expect(service.renameAgent(p2, undefined, null)).toEqual(
      agent({ instanceId: "a2", kind: "codex", label: "Codex" }),
    );
    expect(events).toEqual([]);
  });

  it("pane が無い・エージェントが居ない・instanceId が違うと agent_not_found で何も変えない（AC5・AC11）", () => {
    expect(codeOf(() => service.renameAgent("nope", undefined, "reviewer"))).toBe(
      "agent_not_found",
    );
    service.updatePaneRuntime(p2, { agent: null });
    events.length = 0;
    expect(codeOf(() => service.renameAgent(p2, undefined, "reviewer"))).toBe("agent_not_found");
    expect(codeOf(() => service.renameAgent(p1, "a0", "reviewer"))).toBe("agent_not_found");
    expect(service.getPane(p1)?.agent?.name).toBeUndefined();
    expect(events).toEqual([]);
  });

  it("エージェントが居なくなった pane の名前は一意性の検査に数えない（AC10）", () => {
    service.renameAgent(p2, undefined, "reviewer");
    service.updatePaneRuntime(p2, { agent: null });
    expect(service.renameAgent(p1, undefined, "reviewer").name).toBe("reviewer");
  });

  describe("判定の周期をまたいだ引き継ぎ（updatePaneRuntime）", () => {
    it("同じ instanceId の更新（名前を知らない AgentTracker から）では名前が残り、状態の変化と一緒に届く（AC1・AC10）", () => {
      service.renameAgent(p1, undefined, "reviewer");
      events.length = 0;
      service.updatePaneRuntime(p1, {
        agent: agent({ instanceId: "a1", state: "working", since: 2000 }),
      });
      expect(service.getPane(p1)?.agent).toEqual(
        agent({ instanceId: "a1", state: "working", since: 2000, name: "reviewer" }),
      );
      expect(events).toEqual([
        {
          event: "pane.agent_status_changed",
          data: {
            paneId: p1,
            agent: agent({ instanceId: "a1", state: "working", since: 2000, name: "reviewer" }),
          },
        },
      ]);
    });

    it("中身が同じ更新は、名前を引き継いだうえで発行しない", () => {
      service.renameAgent(p1, undefined, "reviewer");
      events.length = 0;
      service.updatePaneRuntime(p1, { agent: agent({ instanceId: "a1" }) });
      expect(service.getPane(p1)?.agent?.name).toBe("reviewer");
      expect(events).toEqual([]);
    });

    it("名前を持つ更新は、前の名前で上書きしない", () => {
      service.renameAgent(p1, undefined, "reviewer");
      service.updatePaneRuntime(p1, { agent: agent({ instanceId: "a1", name: "writer" }) });
      expect(service.getPane(p1)?.agent?.name).toBe("writer");
    });

    it("別の instanceId（入れ替わり）には引き継がない（AC10）", () => {
      service.renameAgent(p1, undefined, "reviewer");
      service.updatePaneRuntime(p1, {
        agent: agent({ instanceId: "a9", kind: "codex", label: "Codex" }),
      });
      expect(service.getPane(p1)?.agent?.instanceId).toBe("a9");
      expect(service.getPane(p1)?.agent?.name).toBeUndefined();
    });

    it("終了（null）で消え、同じ instanceId が戻っても名前は戻らない（AC10）", () => {
      service.renameAgent(p1, undefined, "reviewer");
      service.updatePaneRuntime(p1, { agent: null });
      expect(service.getPane(p1)?.agent).toBeNull();
      service.updatePaneRuntime(p1, { agent: agent({ instanceId: "a1" }) });
      expect(service.getPane(p1)?.agent?.name).toBeUndefined();
    });

    it("pane が閉じると、その名前は一意性の検査に数えない（AC10）", async () => {
      service.renameAgent(p2, undefined, "reviewer");
      await service.closePane(p2);
      expect(service.renameAgent(p1, undefined, "reviewer").name).toBe("reviewer");
    });
  });
});
