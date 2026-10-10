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


/** 画面の文言・最初の入力の時刻をテストが決める。 */
const screens = new Map<string, string>();
const submits = new Map<string, number>();

class FakeHost implements TerminalHost {
  readonly pid = 4242;
  constructor(readonly paneId: string) {}
  get mirror(): TerminalHost["mirror"] {
    const id = this.paneId;
    return { plainText: () => screens.get(id) ?? "" } as unknown as TerminalHost["mirror"];
  }
  lastSubmitAt(): number {
    return submits.get(this.paneId) ?? 0;
  }
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
const DAEMON = 900;
const ID_A = "01a12341-547a-7191-8f4e-75de3ffa2434";
const ID_B = "01a1234a-1768-7210-befd-023a395239b0";
const ID_C = "01a12326-c9f9-7773-8000-6bde9e00ac25";

/** 20261010-codex-multi-pane: Codex の pane が複数あっても、会話の参照を正しい pane に付ける（付けられないときは付けない）。 */
describe("SessionService — Codex の複数の pane の会話の参照", () => {
  let service: SessionService;
  let logger: MemoryLogger;
  let records: Record<string, { cwd: string | null; originator: string | null } | null | undefined>;
  let lookups: string[];
  let now: number;

  const refOf = (id: string) => service.snapshot().panes.find((p) => p.id === id)?.agentSession ?? null;
  const logs = (msg: string) => logger.lines.filter((r) => r.msg.includes(msg));
  const flush = async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  };

  async function build(): Promise<void> {
    screens.clear();
    submits.clear();
    records = {};
    lookups = [];
    now = 1_000_000;
    const ancestors: Record<number, number[]> = { [DAEMON]: [DAEMON, 301, 1] };
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
      ancestorsOf: (pid) => ancestors[pid] ?? [pid, SHELL_PID, 1],
      pidAlive: () => true,
      codexRecordLookup: async (id) => {
        lookups.push(id);
        return id in records ? records[id] : undefined;
      },
      codexRecordRetry: { times: 1, delayMs: 1 },
    });
    const ws = (n: number) => ({
      id: `w${n}`,
      label: `w${n}`,
      cwd: "/r",
      activeTabId: `t${n}`,
      tabs: [
        {
          id: `t${n}`,
          label: `${n}`,
          focusedPaneId: `p${n}`,
          zoomedPaneId: null,
          layout: { type: "pane" as const, paneId: `p${n}` },
          panes: [{ id: `p${n}`, label: null, cwd: "/r", shell: "/bin/sh" }],
        },
      ],
    });
    await service.restore({ schema: 1, savedAt: "2026-10-10T00:00:00Z", groups: [], workspaces: [ws(1), ws(2)], focus: null });
  }
  const detectCodex = (paneId: string, pid: number, resumeId?: string, instanceId = `i-${paneId}`) => {
    service.setFrontAgent(paneId, { kind: "codex", pids: new Set([pid]), verifiable: true, ...(resumeId ? { resumeId } : {}) });
    service.updatePaneRuntime(paneId, { agent: agent({ instanceId, kind: "codex" }) });
  };
  const goneCodex = (paneId: string) => {
    service.setFrontAgent(paneId, null);
    service.updatePaneRuntime(paneId, { agent: null });
  };
  const resident = (id: string, cwd: string | undefined = "/r") => service.reportAgentSession("p1", "codex", id, DAEMON, { cwd, source: "startup" });

  beforeEach(build);

  describe("手がかり 1: 前面のプロセスの引数（codex resume <id>）", () => {
    it("引数に id があれば、daemon の報告を待たずに、その pane の会話になる（source: argv）", () => {
      detectCodex("p1", 100, ID_A);
      expect(refOf("p1")).toMatchObject({ kind: "codex", sessionId: ID_A });
      const l = logs("agent session attached");
      expect(l[0]!.fields).toMatchObject({ paneId: "p1", kind: "codex", session: ID_A.slice(0, 8), source: "argv" });
    });

    it("同じ検出の間は 1 回だけ（あとの報告・終了の文言が優先する）。復元した参照と同じなら何もしない", () => {
      detectCodex("p1", 100, ID_A);
      service.reportAgentSession("p1", "codex", ID_B, 100, { cwd: "/r" }); // pane の中のフック（シェルの子孫）の報告 = 会話が替わった
      expect(refOf("p1")?.sessionId).toBe(ID_B);
      detectCodex("p1", 100, ID_A); // 同じ instanceId の判定の繰り返し
      expect(refOf("p1")?.sessionId).toBe(ID_B);
    });

    it("引数の id は、入力の裏づけの無い別の id の daemon の報告より優先する（複数の pane）", async () => {
      detectCodex("p1", 100, ID_A);
      detectCodex("p2", 200);
      records[ID_B] = { cwd: "/r", originator: "codex-tui" };
      resident(ID_B);
      await flush();
      expect(refOf("p1")?.sessionId).toBe(ID_A);
      expect(refOf("p2")).toBeNull(); // どちらにも最初の入力が無い
    });
  });

  describe("手がかり 2: 最初の入力の時刻", () => {
    beforeEach(() => {
      detectCodex("p1", 100);
      detectCodex("p2", 200);
    });

    it("(a) 片方が最初の入力を送った直後の報告は、その pane に付く（報告の paneId が別の pane でも）。検算の記録を見る", async () => {
      records[ID_A] = { cwd: "/r", originator: "codex-tui" };
      submits.set("p2", Date.now() - 400);
      service.reportAgentSession("p1", "codex", ID_A, DAEMON, { cwd: "/r", source: "startup" }); // 報告の paneId は p1（daemon を起動した pane）
      await flush();
      expect(refOf("p2")).toMatchObject({ kind: "codex", sessionId: ID_A });
      expect(refOf("p1")).toBeNull();
      expect(lookups).toEqual([ID_A]);
      expect(logs("agent session attached").at(-1)!.fields).toMatchObject({ paneId: "p2", source: "first-turn" });
    });

    it("(a') 続けて、もう片方が送って報告が届けば、それぞれに正しい id が付く", async () => {
      records[ID_A] = { cwd: "/r", originator: "codex-tui" };
      records[ID_B] = { cwd: "/r", originator: "codex-tui" };
      submits.set("p2", Date.now() - 300);
      resident(ID_A);
      await flush();
      submits.set("p1", Date.now() - 300);
      resident(ID_B);
      await flush();
      expect(refOf("p2")?.sessionId).toBe(ID_A);
      expect(refOf("p1")?.sessionId).toBe(ID_B);
    });

    it("(b) ほぼ同時に両方が送ったら、どちらにも付けない", async () => {
      records[ID_A] = { cwd: "/r", originator: "codex-tui" };
      submits.set("p1", Date.now() - 500);
      submits.set("p2", Date.now() - 800);
      resident(ID_A);
      await flush();
      expect(refOf("p1")).toBeNull();
      expect(refOf("p2")).toBeNull();
      expect(String(logs("agent report ignored")[0]!.fields?.["reason"])).toContain("2 front codex agents");
    });

    it("入力が窓（6 秒）より前なら付けない。入力が一度も無い pane にも付けない", async () => {
      records[ID_A] = { cwd: "/r", originator: "codex-tui" };
      submits.set("p2", Date.now() - 20_000);
      resident(ID_A);
      await flush();
      expect(refOf("p1")).toBeNull();
      expect(refOf("p2")).toBeNull();
    });

    it("(c) Sodashitsu の外の Codex（cwd が違う）の報告は、直前に入力のあった pane にも付かない", async () => {
      records[ID_A] = { cwd: "/elsewhere", originator: "codex-tui" };
      submits.set("p2", Date.now() - 300);
      resident(ID_A, "/elsewhere");
      await flush();
      expect(refOf("p2")).toBeNull();
      expect(refOf("p1")).toBeNull();
    });

    it("検算: 記録が無い・記録の cwd が違う・確かめられないときは付けない", async () => {
      submits.set("p2", Date.now() - 300);
      records[ID_A] = null;
      resident(ID_A);
      await flush();
      expect(refOf("p2")).toBeNull();
      expect(String(logs("agent report ignored").at(-1)!.fields?.["reason"])).toContain("no session record");
      records[ID_B] = { cwd: "/other", originator: "codex-tui" };
      resident(ID_B);
      await flush();
      expect(refOf("p2")).toBeNull();
      expect(String(logs("agent report ignored").at(-1)!.fields?.["reason"])).toContain("cwd is not the pane's");
      resident(ID_C); // records に無い = 確かめられない
      await flush();
      expect(refOf("p2")).toBeNull();
      expect(String(logs("agent report ignored").at(-1)!.fields?.["reason"])).toContain("could not be checked");
    });

    it("（レビュー指摘 2）pane の TUI（originator: codex-tui）が始めた会話だけを付ける: codex_exec・リモート・VS Code の拡張などの会話は付けない（sole-codex でも）", async () => {
      submits.set("p2", Date.now() - 300);
      for (const originator of ["codex_exec", "codex_chatgpt_android_remote", "codex_cli_rs", null]) {
        records[ID_A] = { cwd: "/r", originator };
        resident(ID_A);
        await flush();
        expect(refOf("p2")).toBeNull();
      }
      service.setFrontAgent("p1", null); // p2 だけが codex（sole-codex の道）
      for (const originator of ["codex_exec", null]) {
        records[ID_A] = { cwd: "/r", originator };
        resident(ID_A);
        await flush();
        expect(refOf("p2")).toBeNull();
      }
      records[ID_A] = { cwd: "/r", originator: "codex-tui" };
      resident(ID_A);
      await flush();
      expect(refOf("p2")?.sessionId).toBe(ID_A);
    });

    it("（レビュー指摘 5）参照のある pane（引数で付いた）が /new で会話を替えたら、新しい会話に付け替える。前の参照は一つ前へ", async () => {
      detectCodex("p1", 100, ID_C, "i-p1-resumed");
      records[ID_A] = { cwd: "/r", originator: "codex-tui" };
      submits.set("p1", Date.now() - 300);
      resident(ID_A);
      await flush();
      expect(refOf("p1")?.sessionId).toBe(ID_A);
      expect(service.agentSessionHistoryOf("p1").map((h) => h.sessionId)).toEqual([ID_C]);
    });

    it("（レビュー指摘 5）報告の会話が、ほかの pane の今の参照と同じなら、付けない（その会話は、そちらのもの）", async () => {
      detectCodex("p2", 200, ID_A, "i-p2-resumed"); // p2 の参照は ID_A
      records[ID_A] = { cwd: "/r", originator: "codex-tui" };
      submits.set("p1", Date.now() - 300);
      resident(ID_A);
      await flush();
      expect(refOf("p1")).toBeNull();
      expect(refOf("p2")?.sessionId).toBe(ID_A);
    });

    it("すでに別の参照のある pane も候補にする。入力の窓に両方の pane が入れば、どちらにも付けない", async () => {
      detectCodex("p1", 100, ID_C, "i-p1-resumed"); // 引数の参照（codex resume <id> で立ち上がり直した）
      records[ID_A] = { cwd: "/r", originator: "codex-tui" };
      submits.set("p1", Date.now() - 300);
      submits.set("p2", Date.now() - 300);
      resident(ID_A);
      await flush();
      expect(refOf("p1")?.sessionId).toBe(ID_C);
      expect(refOf("p2")).toBeNull();
    });
  });

  describe("Codex の pane が 1 つのとき（#128 の道）は、今までどおり", () => {
    it("入力の時刻が無くても、cwd が一致すれば付く。記録が確かめられなくても付く（source: sole-codex）", async () => {
      detectCodex("p1", 100);
      resident(ID_A);
      await flush();
      expect(refOf("p1")?.sessionId).toBe(ID_A);
      expect(logs("agent session attached").at(-1)!.fields).toMatchObject({ source: "sole-codex" });
    });

    it("記録があって cwd が違うなら付けない。cwd の無い報告は付けない", async () => {
      detectCodex("p1", 100);
      records[ID_A] = { cwd: "/other", originator: "codex-tui" };
      resident(ID_A);
      service.reportAgentSession("p1", "codex", ID_B, DAEMON, { source: "startup" }); // cwd が無い古い報告
      await flush();
      expect(refOf("p1")).toBeNull();
    });
  });

  describe("手がかり 3: 終了のときの画面の文言", () => {
    const EXIT = (id: string) => `Disconnected from this task. Any running work continues.\nTo reconnect, run:\n  codex resume ${id}\nToken usage so far: total=9`;

    it("終了の文言の id を、その pane の会話にする（時刻の一致で付いたものを、打ち消す）。前の参照は一つ前に残る", async () => {
      detectCodex("p1", 100);
      detectCodex("p2", 200);
      records[ID_A] = { cwd: "/r", originator: "codex-tui" };
      submits.set("p1", Date.now() - 300);
      resident(ID_A);
      await flush();
      expect(refOf("p1")?.sessionId).toBe(ID_A);
      records[ID_B] = { cwd: "/r", originator: "codex-tui" };
      screens.set("p1", EXIT(ID_B));
      goneCodex("p1");
      await flush();
      expect(refOf("p1")?.sessionId).toBe(ID_B);
      expect(service.agentSessionHistoryOf("p1").map((h) => h.sessionId)).toEqual([ID_A]);
      expect(logs("agent session attached").at(-1)!.fields).toMatchObject({ paneId: "p1", source: "exit-text" });
    });

    it("参照が無かった pane にも付く。検出の時点で画面にあった文言（前の実行のもの）は拾わない", async () => {
      records[ID_A] = { cwd: "/r", originator: "codex-tui" };
      records[ID_C] = { cwd: "/r", originator: "codex-tui" };
      screens.set("p1", EXIT(ID_C)); // 前の実行の終了の文言が残っている
      detectCodex("p1", 100);
      goneCodex("p1"); // 今回は、文言を出さずに終わった（kill など）
      await flush();
      expect(refOf("p1")).toBeNull();
      detectCodex("p1", 101, undefined, "i-second");
      screens.set("p1", EXIT(ID_C) + "\n" + EXIT(ID_A));
      goneCodex("p1");
      await flush();
      expect(refOf("p1")?.sessionId).toBe(ID_A);
    });

    it("（レビュー指摘 1）画面の文言は誰でも出せるので、記録で検算する: 記録が無い・cwd が違う・別の道具の記録・確かめられないときは付けず、直前の参照を残す", async () => {
      detectCodex("p1", 100, ID_A);
      for (const [id, rec] of [
        [ID_B, null],
        [ID_C, { cwd: "/elsewhere", originator: "codex-tui" }],
        ["01a12399-aaaa-7aaa-8aaa-aaaaaaaaaaaa", { cwd: "/r", originator: "codex_exec" }],
        ["01a12399-bbbb-7bbb-8bbb-bbbbbbbbbbbb", undefined],
      ] as const) {
        records[id] = rec as never;
        screens.set("p1", EXIT(id));
        goneCodex("p1");
        await flush();
        expect(refOf("p1")?.sessionId).toBe(ID_A);
        detectCodex("p1", 100, undefined, `i-${id}`);
      }
      expect(logs("agent report ignored").filter((l) => String(l.fields?.["reason"]).includes("exit text not used")).length).toBe(4);
    });
  });

  describe("(d) 同じ pane で別の会話を始める", () => {
    it("codex を終えて（猶予を過ぎて）、同じ pane で別の会話を始めると、新しい id に替わる。前の会話は一つ前に残る", async () => {
      detectCodex("p1", 100, ID_A);
      goneCodex("p1");
      expect(refOf("p1")?.sessionId).toBe(ID_A);
      detectCodex("p1", 101, ID_B, "i-next"); // codex resume <ID_B>
      expect(refOf("p1")?.sessionId).toBe(ID_B);
      expect(service.agentSessionHistoryOf("p1").map((h) => h.sessionId)).toEqual([ID_A]);
    });
  });
});
