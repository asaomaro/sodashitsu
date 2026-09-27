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

/** `agent start` の名前の予約と、検出時の名前付け（20260926-agent-start design「server `SessionService` に足すもの」。AC3・AC4）。 */

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

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof RpcError) return err.code;
    throw err;
  }
  throw new Error("expected an RpcError");
}

describe("SessionService — agent start の名前の予約", () => {
  let service: SessionService;
  let events: ServerEvent[];
  let p1: string;
  let p2: string;
  let p3: string;

  beforeEach(async () => {
    const bus = new EventBus();
    service = new SessionService({
      model: new SessionModel(),
      terminals: new FakeTerminals(),
      bus,
      persist: new CountingPersist(),
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
    p3 = (await service.splitPane(p2, "down", undefined)).pane.id;
    service.updatePaneRuntime(p2, {
      agent: agent({ instanceId: "a2", kind: "codex", label: "Codex" }),
    });
    service.renameAgent(p2, undefined, "taken");
    events = [];
    bus.subscribe((e) => events.push(e));
  });

  it("予約した名前は別の起動・rename に使えず、live な名前・書式違反も予約できない（AC3・AC4）", () => {
    service.beginAgentLaunch(p1, "reviewer", "claude");
    expect(service.hasAgentLaunch(p1)).toBe(true);
    expect(codeOf(() => service.beginAgentLaunch(p3, "reviewer", "claude"))).toBe(
      "agent_name_taken",
    );
    expect(codeOf(() => service.renameAgent(p2, undefined, "reviewer"))).toBe("agent_name_taken");
    expect(codeOf(() => service.assertAgentNameAvailable("reviewer", null))).toBe(
      "agent_name_taken",
    );
    expect(codeOf(() => service.beginAgentLaunch(p3, "taken", "claude"))).toBe("agent_name_taken");
    expect(codeOf(() => service.beginAgentLaunch(p3, "Bad", "claude"))).toBe("invalid_agent_name");
    expect(codeOf(() => service.beginAgentLaunch(p1, "other", "claude"))).toBe("agent_pane_busy");
    expect(service.hasAgentLaunch(p3)).toBe(false);
  });

  it("期待の種類が新しく検出されると、その 1 回の反映・1 回の発行で予約の名前が付き、予約は終わる（AC3）", () => {
    service.beginAgentLaunch(p1, "reviewer", "claude");
    service.updatePaneRuntime(p1, { agent: agent({ instanceId: "a9", state: "unknown" }) });
    const named = agent({ instanceId: "a9", state: "unknown", name: "reviewer" });
    expect(service.getPane(p1)?.agent).toEqual(named);
    expect(events).toEqual([
      { event: "pane.agent_status_changed", data: { paneId: p1, agent: named } },
    ]);
    expect(service.hasAgentLaunch(p1)).toBe(false);
    // 以後の判定の周期（名前を持たない patch）でも同じ検出の間は残る
    service.updatePaneRuntime(p1, { agent: agent({ instanceId: "a9", state: "idle" }) });
    expect(service.getPane(p1)?.agent?.name).toBe("reviewer");
  });

  it("名前の付いた後の締め切り（endAgentLaunch）は名前を外さない（AC3）", () => {
    const token = service.beginAgentLaunch(p1, "reviewer", "claude");
    service.updatePaneRuntime(p1, { agent: agent({ instanceId: "a9" }) });
    service.endAgentLaunch(p1, token);
    expect(service.getPane(p1)?.agent?.name).toBe("reviewer");
  });

  it("別の種類が検出されると予約だけ終わり、名前は付かず、同じ名前をすぐ使える（AC3）", () => {
    service.beginAgentLaunch(p1, "reviewer", "claude");
    service.updatePaneRuntime(p1, {
      agent: agent({ instanceId: "a9", kind: "codex", label: "Codex" }),
    });
    expect(service.getPane(p1)?.agent?.name).toBeUndefined();
    expect(service.hasAgentLaunch(p1)).toBe(false);
    expect(() => service.beginAgentLaunch(p3, "reviewer", "claude")).not.toThrow();
  });

  it("締め切りで予約を解くと同じ名前を使える。古い印では新しい予約を解かない（AC3）", () => {
    const token = service.beginAgentLaunch(p1, "reviewer", "claude");
    service.endAgentLaunch(p1, token);
    expect(service.hasAgentLaunch(p1)).toBe(false);
    const again = service.beginAgentLaunch(p1, "reviewer", "claude");
    service.endAgentLaunch(p1, token);
    expect(service.hasAgentLaunch(p1)).toBe(true);
    service.endAgentLaunch(p1, again);
    expect(service.hasAgentLaunch(p1)).toBe(false);
  });

  it("予約の無い pane の新しい検出には名前を付けない", () => {
    service.updatePaneRuntime(p1, { agent: agent({ instanceId: "a9" }) });
    expect(service.getPane(p1)?.agent?.name).toBeUndefined();
  });

  it("閉じた pane の予約は一意性の検査に数えない", async () => {
    service.beginAgentLaunch(p3, "reviewer", "claude");
    await service.closePane(p3);
    expect(() => service.assertAgentNameAvailable("reviewer", null)).not.toThrow();
  });

  it("予約中に同じ名前が他で live になっていたら、種類が合っても名前は付けず予約だけ終える", () => {
    service.beginAgentLaunch(p1, "reviewer", "claude");
    // 通常の経路（rename・別の予約）では起きないが、一意性を破らない守り
    service.updatePaneRuntime(p3, { agent: agent({ instanceId: "a3", name: "reviewer" }) });
    service.updatePaneRuntime(p1, { agent: agent({ instanceId: "a9" }) });
    expect(service.getPane(p1)?.agent?.name).toBeUndefined();
    expect(service.hasAgentLaunch(p1)).toBe(false);
  });

  it("同じ instanceId の反映（既に居るエージェントの状態の更新）では予約を終えない", () => {
    service.beginAgentLaunch(p2, "reviewer", "codex");
    service.updatePaneRuntime(p2, {
      agent: agent({ instanceId: "a2", kind: "codex", label: "Codex", state: "working" }),
    });
    expect(service.hasAgentLaunch(p2)).toBe(true);
    expect(service.getPane(p2)?.agent?.name).toBe("taken");
  });

  it("rename の検査は自分の pane を除く（同じ名前の付け直しは成功）", () => {
    expect(service.renameAgent(p2, undefined, "taken").name).toBe("taken");
  });
});
