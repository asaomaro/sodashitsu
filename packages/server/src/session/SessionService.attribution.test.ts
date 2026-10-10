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


const SHELL_PID = 4242;
type Opts = { ancestors?: Record<number, number[] | null> };

describe("SessionService — 会話の参照は、その pane の前面のエージェント自身の報告でだけ変わる（20261009-agent-session-attribution）", () => {
  let now: number;
  let service: SessionService;
  let logger: MemoryLogger;
  let ancestors: Record<number, number[] | null>;
  let persistCalls: number;

  /** 親が shell なら、shell の子孫（自分から shell まで）。 */
  const underShell = (pid: number): number[] => [pid, SHELL_PID, 1];
  const refOf = (id = "p1") => service.snapshot().panes.find((p) => p.id === id)?.agentSession ?? null;
  const logs = (msg: string) => logger.lines.filter((r) => r.msg.includes(msg));

  async function build(opts: Opts = {}, saved?: { kind: string; sessionId: string; reportedAt: number }[]): Promise<void> {
    now = 1_000_000;
    persistCalls = 0;
    ancestors = opts.ancestors ?? {};
    service = new SessionService({
      model: new SessionModel(),
      terminals: new FakeTerminals(),
      bus: new EventBus(),
      persist: { touch: () => void persistCalls++, flush: async () => undefined, cancel: () => undefined } as PersistScheduler,
      serverVersion: "0.1.0-test",
      host: HOST_INFO,
      scrollbackLines: 1000,
      spawnGraceMs: 0,
      defaultCwd: "/home/u",
      logger: (logger = new MemoryLogger()),
      clock: { now: () => now },
      ancestorsOf: (pid) => (pid in ancestors ? ancestors[pid]! : underShell(pid)),
    });
    await service.restore({
      schema: 1,
      savedAt: "2026-10-10T00:00:00Z",
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
              layout: { type: "pane", paneId: "p1" },
              panes: [
                {
                  id: "p1",
                  label: null,
                  cwd: "/r",
                  shell: "/bin/sh",
                  ...(saved && saved[0] ? { agentSession: saved[0] } : {}),
                  ...(saved && saved.length > 1 ? { agentSessionHistory: saved.slice(1) } : {}),
                },
              ],
            },
          ],
        },
      ],
      focus: null,
    });
  }
  const front = (pids: number[], kind = "claude") => service.setFrontAgent("p1", { kind, pids: new Set(pids) });
  const noFront = () => service.setFrontAgent("p1", null);
  const detect = (pids: number[], instanceId = "i1", state: AgentInfo["state"] = "idle") => {
    front(pids);
    service.updatePaneRuntime("p1", { agent: agent({ instanceId, state }) });
  };
  const vanish = () => {
    noFront();
    service.updatePaneRuntime("p1", { agent: null });
  };
  const tick = () => service.updatePaneRuntime("p1", { busy: false });

  beforeEach(async () => {
    await build();
  });

  it("件 B の再現: 前面のエージェント（pid 100）の報告 A の後、その pane の中で動いた子の claude（pid 200）の報告 B は、参照を替えない（ログに残る）", () => {
    detect([100]);
    service.reportAgentSession("p1", "claude", "aaaaaaaa-1111", 100);
    expect(refOf()?.sessionId).toBe("aaaaaaaa-1111");
    service.reportAgentSession("p1", "claude", "bbbbbbbb-2222", 200);
    expect(refOf()?.sessionId).toBe("aaaaaaaa-1111");
    const l = logs("agent report ignored");
    expect(l).toHaveLength(1);
    expect(l[0]!.fields).toMatchObject({ paneId: "p1", kind: "claude", session: "bbbbbbbb", agentPid: 200 });
    expect(String(l[0]!.fields?.["reason"])).toContain("not the pane's front agent");
  });

  it("pid の無い報告（古い版のフック・pid の取れない OS）は、今までどおり受ける", () => {
    detect([100]);
    service.reportAgentSession("p1", "claude", "aaaaaaaa-1111");
    service.reportAgentSession("p1", "claude", "bbbbbbbb-2222");
    expect(refOf()?.sessionId).toBe("bbbbbbbb-2222");
  });

  it("その pane のシェルの子孫でない報告（常駐のプロセスの中で動いたフック。Codex の daemon）は、前面のエージェントが検出される前でも捨てる", async () => {
    await build({ ancestors: { 900: [900, 301, 1] } });
    service.reportAgentSession("p1", "codex", "01a12154-aaaa", 900);
    expect(refOf()).toBeNull();
    expect(logs("agent report ignored")[0]!.fields).toMatchObject({ kind: "codex", agentPid: 900 });
    expect(String(logs("agent report ignored")[0]!.fields?.["reason"])).toContain("not a descendant");
    // 検出された後でも同じ
    detect([100]);
    service.reportAgentSession("p1", "codex", "01a12154-aaaa", 900);
    expect(refOf()).toBeNull();
  });

  it("種類が違う報告（前面は claude で、codex の報告）は捨てる", () => {
    detect([100]);
    service.reportAgentSession("p1", "codex", "01a12154-aaaa", 100);
    expect(refOf()).toBeNull();
  });

  it("起動の直後: 前面のエージェントが検出される前の報告は保留し、検出されたとき、その pid なら受ける", () => {
    service.reportAgentSession("p1", "claude", "aaaaaaaa-1111", 100);
    expect(refOf()).toBeNull(); // まだ受けていない
    detect([100]);
    expect(refOf()?.sessionId).toBe("aaaaaaaa-1111");
  });

  it("保留した報告は、検出されたエージェントの pid が違えば捨てる", () => {
    service.reportAgentSession("p1", "claude", "bbbbbbbb-2222", 200);
    detect([100]);
    expect(refOf()).toBeNull();
    expect(logs("agent report ignored")).toHaveLength(1);
  });

  it("保留は pane ごとに 1 件（新しいものが勝つ）", () => {
    service.reportAgentSession("p1", "claude", "aaaaaaaa-1111", 100);
    service.reportAgentSession("p1", "claude", "cccccccc-3333", 100);
    detect([100]);
    expect(refOf()?.sessionId).toBe("cccccccc-3333");
    expect(service.agentSessionHistoryOf("p1")).toEqual([]);
  });

  it("保留の間に前面のエージェントが現れないまま 15 秒が過ぎたら、今までどおり受けた扱い（シェルの子孫であることは確かめてある）。ログに残る", () => {
    service.reportAgentSession("p1", "claude", "aaaaaaaa-1111", 100);
    now += 14_000;
    tick();
    noFront();
    expect(refOf()).toBeNull();
    now += 2_000;
    noFront();
    expect(refOf()?.sessionId).toBe("aaaaaaaa-1111");
    expect(logs("accepted without verification")).toHaveLength(1);
  });

  it("保留の間にサーバが止まる処理に入ったら、受けた扱いにして保存する", () => {
    service.reportAgentSession("p1", "claude", "aaaaaaaa-1111", 100);
    service.beginShutdown();
    expect(refOf()?.sessionId).toBe("aaaaaaaa-1111");
  });

  it("同じプロセスの中で会話が替わる（/clear・/resume・fork）報告は受ける。前の参照は履歴に残る（最大 2 件）", () => {
    detect([100]);
    for (const id of ["s1", "s2", "s3", "s4"]) service.reportAgentSession("p1", "claude", id, 100);
    expect(refOf()?.sessionId).toBe("s4");
    expect(service.agentSessionHistoryOf("p1").map((h) => h.sessionId)).toEqual(["s3", "s2"]);
    // 同じ id の再報告は履歴を増やさない
    service.reportAgentSession("p1", "claude", "s4", 100);
    expect(service.agentSessionHistoryOf("p1").map((h) => h.sessionId)).toEqual(["s3", "s2"]);
  });

  it("サブエージェントの報告の確かめ（acceptsReporter）: pid の無い報告・前面のエージェントの報告は受け、子の claude・pane の外の報告は受けない", () => {
    detect([100]);
    expect(service.acceptsReporter("p1", "claude", undefined)).toBe(true);
    expect(service.acceptsReporter("p1", "claude", 100)).toBe(true);
    expect(service.acceptsReporter("p1", "claude", 200)).toBe(false);
    ancestors[900] = [900, 301, 1];
    expect(service.acceptsReporter("p1", "claude", 900)).toBe(false);
    noFront();
    expect(service.acceptsReporter("p1", "claude", 100)).toBe(true); // まだ分からない間は、今までどおり受ける
  });

  describe("再開の失敗（AC4）", () => {
    it("再開を打ち込んだ後、手が空く前に居なくなったら、参照を捨てる代わりに一つ前へ戻す（ログに、会話の id・時間・理由）。次の再開は一つ前", async () => {
      await build({}, [
        { kind: "claude", sessionId: "bbbbbbbb-2222", reportedAt: 2 },
        { kind: "claude", sessionId: "aaaaaaaa-1111", reportedAt: 1 },
      ]);
      expect(refOf()?.sessionId).toBe("bbbbbbbb-2222"); // 復元で再開を打ち込んだ
      now += 3_000;
      detect([100], "i1", "unknown"); // 立ち上がったが、手が空く前
      now += 1_000;
      vanish();
      now += 10_000;
      tick();
      expect(refOf()?.sessionId).toBe("aaaaaaaa-1111");
      expect(service.agentSessionHistoryOf("p1")).toEqual([]);
      const l = logs("reverted to the previous session");
      expect(l).toHaveLength(1);
      expect(l[0]!.fields).toMatchObject({ session: "bbbbbbbb", previous: "aaaaaaaa", kind: "claude" });
      expect(typeof l[0]!.fields?.["sinceResumeWrittenMs"]).toBe("number");
      expect(logs("agent session dropped")).toHaveLength(0);
    });

    it("一つ前が無ければ、無し（捨てる）", async () => {
      await build({}, [{ kind: "claude", sessionId: "bbbbbbbb-2222", reportedAt: 2 }]);
      detect([100], "i1", "unknown");
      vanish();
      now += 10_000;
      tick();
      expect(refOf()).toBeNull();
      expect(logs("reverted to the previous session")[0]!.fields).toMatchObject({ previous: null });
    });

    it("手が空いた（立ち上がった）後に終わったなら、ふつうに捨てる（履歴も消す。古い会話を、あとから戻さない）", async () => {
      await build({}, [
        { kind: "claude", sessionId: "bbbbbbbb-2222", reportedAt: 2 },
        { kind: "claude", sessionId: "aaaaaaaa-1111", reportedAt: 1 },
      ]);
      detect([100], "i1", "idle");
      vanish();
      now += 10_000;
      tick();
      expect(refOf()).toBeNull();
      expect(service.agentSessionHistoryOf("p1")).toEqual([]);
      const l = logs("agent session dropped (agent gone, shell alive)");
      expect(l).toHaveLength(1);
      expect(l[0]!.fields).toMatchObject({ session: "bbbbbbbb", paneId: "p1" });
      expect(String(l[0]!.fields?.["reason"])).toBeTruthy();
    });

    it("エージェントが検出されないまま 30 秒が過ぎた（速い失敗）ときも、一つ前へ戻す", async () => {
      await build({}, [
        { kind: "claude", sessionId: "bbbbbbbb-2222", reportedAt: 2 },
        { kind: "claude", sessionId: "aaaaaaaa-1111", reportedAt: 1 },
      ]);
      now += 29_000;
      noFront();
      expect(refOf()?.sessionId).toBe("bbbbbbbb-2222");
      now += 2_000;
      noFront();
      expect(refOf()?.sessionId).toBe("aaaaaaaa-1111");
      expect(logs("reverted to the previous session")[0]!.fields).toMatchObject({ reason: "no agent was detected after the resume command" });
    });

    it("再開で立ち上がって報告が届けば（成功）、再開の失敗として扱わない", async () => {
      await build({}, [{ kind: "claude", sessionId: "bbbbbbbb-2222", reportedAt: 2 }]);
      detect([100], "i1", "unknown");
      service.reportAgentSession("p1", "claude", "bbbbbbbb-2222", 100);
      now += 40_000;
      noFront();
      tick();
      expect(refOf()?.sessionId).toBe("bbbbbbbb-2222");
    });
  });

  describe("猶予の穴（AC9。fork のレビュー R1）", () => {
    it("報告ありのエージェント A → 終了 → 10 秒の猶予の間に、報告をしない別のエージェント B（別のプロセス）が検出されたら、参照を捨てる（履歴に一つ前として残す）", () => {
      detect([100], "iA");
      service.reportAgentSession("p1", "claude", "aaaaaaaa-1111", 100);
      vanish();
      now += 500;
      detect([300], "iB"); // 報告をしない別のエージェント
      expect(refOf()).toBeNull();
      expect(service.agentSessionHistoryOf("p1").map((h) => h.sessionId)).toEqual(["aaaaaaaa-1111"]);
      expect(logs("a different agent started without reporting")).toHaveLength(1);
      now += 20_000;
      tick();
      expect(refOf()).toBeNull();
    });

    it("B が報告するなら（検出の後に届く）、その報告が参照になる", () => {
      detect([100], "iA");
      service.reportAgentSession("p1", "claude", "aaaaaaaa-1111", 100);
      vanish();
      detect([300], "iB");
      service.reportAgentSession("p1", "claude", "bbbbbbbb-2222", 300);
      expect(refOf()?.sessionId).toBe("bbbbbbbb-2222");
    });

    it("B の報告が検出より先に届いても（保留）、受ける", () => {
      detect([100], "iA");
      service.reportAgentSession("p1", "claude", "aaaaaaaa-1111", 100);
      vanish();
      service.reportAgentSession("p1", "claude", "bbbbbbbb-2222", 300);
      detect([300], "iB");
      expect(refOf()?.sessionId).toBe("bbbbbbbb-2222");
    });

    it("同じエージェントの判定の揺れ（居なくなって、すぐ同じプロセスが検出された）では、捨てない", () => {
      detect([100], "iA");
      service.reportAgentSession("p1", "claude", "aaaaaaaa-1111", 100);
      vanish();
      now += 2_000;
      detect([100], "iA2");
      expect(refOf()?.sessionId).toBe("aaaaaaaa-1111");
    });

    it("サーバの再起動の復元（#122）: 居なくなる前の記録が無い pane に、再開で立ち上がったエージェントが検出されても、参照は消えない", async () => {
      await build({}, [{ kind: "claude", sessionId: "bbbbbbbb-2222", reportedAt: 2 }]);
      detect([100], "iR", "idle");
      expect(refOf()?.sessionId).toBe("bbbbbbbb-2222");
    });

    it("止まる処理に入った後は、居なくなっても・別のエージェントが検出されても捨てない（#122）", () => {
      detect([100], "iA");
      service.reportAgentSession("p1", "claude", "aaaaaaaa-1111", 100);
      service.beginShutdown();
      vanish();
      now += 60_000;
      tick();
      expect(refOf()?.sessionId).toBe("aaaaaaaa-1111");
    });
  });
});
