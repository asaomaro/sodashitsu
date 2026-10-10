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

/** 20261009-agent-session-attribution の独立レビューの指摘（S1〜S5）の直しの単体。pane は 2 つ（p1: /r1、p2: /r2）。 */
describe("SessionService — 取り違えを避けたまま、正しい報告を落とさない（レビュー S1〜S5）", () => {
  let now: number;
  let service: SessionService;
  let logger: MemoryLogger;
  let ancestors: Record<number, number[] | null>;
  let deadPids: Set<number>;

  const underShell = (pid: number): number[] => [pid, SHELL_PID, 1];
  const refOf = (id = "p1") => service.snapshot().panes.find((p) => p.id === id)?.agentSession ?? null;
  const logs = (msg: string) => logger.lines.filter((r) => r.msg.includes(msg));
  const DAEMON = 900;

  async function build(): Promise<void> {
    now = 1_000_000;
    deadPids = new Set();
    ancestors = { [DAEMON]: [DAEMON, 301, 1] }; // 常駐のプロセス（init の子）
    service = new SessionService({
      model: new SessionModel(),
      terminals: new FakeTerminals(),
      bus: new EventBus(),
      persist: { touch: () => undefined, flush: async () => undefined, cancel: () => undefined } as PersistScheduler,
      serverVersion: "0.1.0-test",
      host: HOST_INFO,
      scrollbackLines: 1000,
      spawnGraceMs: 0,
      defaultCwd: "/home/u",
      logger: (logger = new MemoryLogger()),
      clock: { now: () => now },
      ancestorsOf: (pid) => (pid in ancestors ? ancestors[pid]! : underShell(pid)),
      pidAlive: (pid) => !deadPids.has(pid),
    });
    const ws = (n: number) => ({
      id: `w${n}`,
      label: `w${n}`,
      cwd: `/r${n}`,
      activeTabId: `t${n}`,
      tabs: [
        {
          id: `t${n}`,
          label: `${n}`,
          focusedPaneId: `p${n}`,
          zoomedPaneId: null,
          layout: { type: "pane" as const, paneId: `p${n}` },
          panes: [{ id: `p${n}`, label: null, cwd: `/r${n}`, shell: "/bin/sh" }],
        },
      ],
    });
    await service.restore({ schema: 1, savedAt: "2026-10-10T00:00:00Z", groups: [], workspaces: [ws(1), ws(2)], focus: null });
  }
  const front = (paneId: string, pids: number[], kind = "claude", verifiable = true) => service.setFrontAgent(paneId, { kind, pids: new Set(pids), verifiable });
  const detect = (paneId: string, pids: number[], kind = "claude", instanceId = `i-${paneId}`) => {
    front(paneId, pids, kind);
    service.updatePaneRuntime(paneId, { agent: agent({ instanceId, kind: kind as AgentInfo["kind"] }) });
  };
  const vanish = (paneId: string) => {
    service.setFrontAgent(paneId, null);
    service.updatePaneRuntime(paneId, { agent: null });
  };

  beforeEach(build);

  describe("S1: Codex の daemon の報告（シェルの子孫でない）", () => {
    it("前面の codex がサーバ全体で 1 つだけで、cwd がその pane の場所と同じなら、報告の paneId の pane に付く", () => {
      detect("p1", [100], "codex");
      service.reportAgentSession("p1", "codex", "01a12154-aaaa", DAEMON, { cwd: "/r1" });
      expect(refOf("p1")).toMatchObject({ kind: "codex", sessionId: "01a12154-aaaa" });
      expect(logs("agent report ignored")).toHaveLength(0);
    });

    it("末尾の区切りの違いだけなら同じ場所", () => {
      detect("p1", [100], "codex");
      service.reportAgentSession("p1", "codex", "01a12154-aaaa", DAEMON, { cwd: "/r1/" });
      expect(refOf("p1")?.sessionId).toBe("01a12154-aaaa");
    });

    it("前面の codex が 2 つ以上あれば、どれの報告か分からないので捨てる（pane が別でも）", () => {
      detect("p1", [100], "codex");
      detect("p2", [200], "codex");
      service.reportAgentSession("p1", "codex", "01a12154-aaaa", DAEMON, { cwd: "/r1" });
      service.reportAgentSession("p2", "codex", "01a12154-bbbb", DAEMON, { cwd: "/r2" });
      expect(refOf("p1")).toBeNull();
      expect(refOf("p2")).toBeNull();
      expect(String(logs("agent report ignored")[0]!.fields?.["reason"])).toContain("2 front codex");
    });

    it("cwd が pane の場所と違う（Sodashitsu の外で動いた、同じ daemon の Codex）・cwd が無い古い報告は、受けない", () => {
      detect("p1", [100], "codex");
      service.reportAgentSession("p1", "codex", "01a12154-aaaa", DAEMON, { cwd: "/elsewhere" });
      service.reportAgentSession("p1", "codex", "01a12154-aaaa", DAEMON, {});
      service.reportAgentSession("p1", "codex", "01a12154-aaaa", DAEMON);
      expect(refOf("p1")).toBeNull();
      expect(logs("agent report ignored")).toHaveLength(3);
    });

    it("報告の paneId の pane に前面の codex が居なければ（別の pane の codex が 1 つだけでも）受けない", () => {
      detect("p2", [200], "codex");
      service.reportAgentSession("p1", "codex", "01a12154-aaaa", DAEMON, { cwd: "/r1" });
      expect(refOf("p1")).toBeNull();
      expect(refOf("p2")).toBeNull();
      detect("p1", [100], "claude"); // 前面が別の種類
      service.reportAgentSession("p1", "codex", "01a12154-aaaa", DAEMON, { cwd: "/r1" });
      expect(refOf("p1")).toBeNull();
    });

    it("codex 以外の種類は、常駐のプロセスの道を使えない（シェルの子孫でなければ捨てる）", () => {
      detect("p1", [100], "claude");
      service.reportAgentSession("p1", "claude", "aaaaaaaa-1111", DAEMON, { cwd: "/r1" });
      expect(refOf("p1")).toBeNull();
    });
  });

  describe("S2: 前面の記録が古いだけの報告は、確かめ直す", () => {
    it("A が終わって、次の判定の前に別のエージェント B が報告しても、B の検出で受ける（A は捨てられる）", () => {
      detect("p1", [100]);
      service.reportAgentSession("p1", "claude", "aaaaaaaa-1111", 100);
      service.reportAgentSession("p1", "claude", "bbbbbbbb-2222", 200); // 記録はまだ A のもの
      expect(refOf("p1")?.sessionId).toBe("aaaaaaaa-1111");
      vanish("p1");
      detect("p1", [200], "claude", "i-b");
      expect(refOf("p1")?.sessionId).toBe("bbbbbbbb-2222");
      expect(logs("agent report ignored")).toHaveLength(0);
    });

    it("確かめ直しても含まれなければ捨てる（子の claude）。期限で捨てるのも同じ", () => {
      detect("p1", [100]);
      service.reportAgentSession("p1", "claude", "aaaaaaaa-1111", 100);
      service.reportAgentSession("p1", "claude", "bbbbbbbb-2222", 200);
      detect("p1", [100]);
      detect("p1", [100]);
      expect(refOf("p1")?.sessionId).toBe("aaaaaaaa-1111");
      expect(logs("agent report ignored")).toHaveLength(1);
    });
  });

  describe("S3: 確かめずに受ける前に、報告したプロセスが生きているか見る", () => {
    it("期限（15 秒）が過ぎても前面が検出されず、報告したプロセスが終わっていれば、捨てる（ログに残る）", () => {
      service.reportAgentSession("p1", "claude", "aaaaaaaa-1111", 100);
      deadPids.add(100);
      now += 16_000;
      service.setFrontAgent("p1", null);
      expect(refOf("p1")).toBeNull();
      const l = logs("agent report ignored");
      expect(l).toHaveLength(1);
      expect(String(l[0]!.fields?.["reason"])).toContain("already exited");
    });

    it("生きていれば、今までどおり受ける。止まる処理に入ったときも、終わったものは捨てる", () => {
      service.reportAgentSession("p1", "claude", "aaaaaaaa-1111", 100);
      now += 16_000;
      service.setFrontAgent("p1", null);
      expect(refOf("p1")?.sessionId).toBe("aaaaaaaa-1111");
      service.reportAgentSession("p2", "claude", "bbbbbbbb-2222", 300);
      deadPids.add(300);
      service.beginShutdown();
      expect(refOf("p2")).toBeNull();
    });
  });

  describe("S4: /clear は、前の参照を履歴に積まない", () => {
    it("source が clear なら、前の会話は一つ前にならない。それ以外（resume・source 無し）は積む", () => {
      detect("p1", [100]);
      service.reportAgentSession("p1", "claude", "xxxxxxxx-1111", 100, { source: "startup" });
      service.reportAgentSession("p1", "claude", "yyyyyyyy-2222", 100, { source: "clear" });
      expect(refOf("p1")?.sessionId).toBe("yyyyyyyy-2222");
      expect(service.agentSessionHistoryOf("p1")).toEqual([]);
      service.reportAgentSession("p1", "claude", "zzzzzzzz-3333", 100, { source: "resume" });
      expect(service.agentSessionHistoryOf("p1").map((h) => h.sessionId)).toEqual(["yyyyyyyy-2222"]);
    });
  });

  describe("S5: 親子の情報が取れない環境では、pid の含まれるかを確かめない", () => {
    it("verifiable でない前面のエージェントの pane は、シェルの子孫で種類が合えば受ける（種類・子孫の確かめは残る）", () => {
      front("p1", [100], "claude", false);
      service.reportAgentSession("p1", "claude", "aaaaaaaa-1111", 200);
      expect(refOf("p1")?.sessionId).toBe("aaaaaaaa-1111");
      service.reportAgentSession("p1", "codex", "cccccccc-3333", 200);
      expect(refOf("p1")?.sessionId).toBe("aaaaaaaa-1111"); // 種類が違う
      service.reportAgentSession("p1", "claude", "dddddddd-4444", DAEMON);
      expect(refOf("p1")?.sessionId).toBe("aaaaaaaa-1111"); // シェルの子孫でない
    });
  });
});
