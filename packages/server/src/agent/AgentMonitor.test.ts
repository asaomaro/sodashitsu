import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostInfo } from "@sodashitsu/protocol";
import type { Disposable } from "../util/Disposable.js";
import { MemoryLogger } from "../log/Logger.js";
import { EventBus } from "../bus/EventBus.js";
import type { CreatePaneOptions, TerminalManager } from "../terminal/TerminalManager.js";
import type { TerminalHost } from "../terminal/TerminalHost.js";
import type { InputModes, Mirror } from "../terminal/Mirror.js";
import type { PersistScheduler } from "../session/PersistScheduler.js";
import { SessionModel } from "../session/SessionModel.js";
import { SessionService } from "../session/SessionService.js";
import type { ForegroundJob, ProcessInspector, ForegroundProcess, DefaultShell } from "../platform/ProcessInspector.js";
import type { CompiledManifest } from "./ManifestStore.js";
import type { ManifestStore } from "./ManifestStore.js";
import { AgentMonitor } from "./AgentMonitor.js";

class FakeMirror implements Mirror {
  linesValue: string[] = [];
  titleValue = "";
  progressValue: string | null = null;
  cwdHintValue: string | null = null;
  write(): void {}
  pendingBytes(): number {
    return 0;
  }
  onDrained(): Disposable {
    return { dispose: () => undefined };
  }
  serialize(): { cols: number; rows: number; text: string } {
    return { cols: 80, rows: 24, text: "" };
  }
  lastLogicalLines(): string[] {
    return [];
  }
  bottomLines(): string[] {
    return this.linesValue;
  }
  plainText(): string {
    return "";
  }
  historyAnsi(): string {
    return "";
  }
  title(): string {
    return this.titleValue;
  }
  progress(): string | null {
    return this.progressValue;
  }
  cwdHint(): string | null {
    return this.cwdHintValue;
  }
  onResponse(): Disposable {
    return { dispose: () => undefined };
  }
  resize(): void {}
  dispose(): void {}
  notifyAppearanceMayHaveChanged(): void {}
  inputModes(): InputModes {
    return { bracketedPaste: false, applicationCursorKeys: false };
  }
  flush(): Promise<void> {
    return Promise.resolve();
  }
}

let nextPid = 1000;
class FakeTerminalHost implements TerminalHost {
  readonly pid = nextPid++;
  readonly mirror = new FakeMirror();
  readonly fanout = {} as TerminalHost["fanout"];
  lastOutputAtValue = 0;
  constructor(readonly paneId: string) {}
  write(): void {}
  writeModal(): Promise<void> {
    return Promise.resolve();
  }
  resize(): void {}
  lastOutputAt(): number {
    return this.lastOutputAtValue;
  }
  onExit(): Disposable {
    return { dispose: () => undefined };
  }
  dispose(): void {}
}

class FakeTerminalManager implements TerminalManager {
  readonly hosts = new Map<string, FakeTerminalHost>();
  create(paneId: string, _opts: CreatePaneOptions): TerminalHost {
    const host = new FakeTerminalHost(paneId);
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

class FakeProcessInspector implements ProcessInspector {
  jobs = new Map<number, ForegroundJob | null>();
  delayMs = 0;
  /** true の間は `foregroundJob` が二度と解決しない（review 指摘。should。ネイティブ実装のコールバックが
   *  一度も呼ばれずに固まるケースの再現。`AgentMonitor` 側のタイムアウト防御のテスト用）。 */
  hangs = false;
  calls: number[] = [];
  async foreground(): Promise<ForegroundProcess | null> {
    return null; // AgentMonitor は foregroundJob だけを使う
  }
  async foregroundJob(shellPid: number): Promise<ForegroundJob | null> {
    this.calls.push(shellPid);
    if (this.hangs) return new Promise(() => undefined); // 永久に解決しない
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    return this.jobs.get(shellPid) ?? null;
  }
  isBusy(): boolean {
    return false;
  }
  defaultShell(): DefaultShell {
    return { shell: "/bin/sh", args: [] };
  }
}

class FakeManifestStore implements ManifestStore {
  private readonly manifests = new Map<string, CompiledManifest>();
  set(kind: string, manifest: CompiledManifest): void {
    this.manifests.set(kind, manifest);
  }
  get(kind: string): CompiledManifest | undefined {
    return this.manifests.get(kind);
  }
  summaries(): [] {
    return [];
  }
}

/** contains マッチだけの簡単な manifest（3状態）。 */
function simpleManifest(kind: string): CompiledManifest {
  const rule = (id: string, state: "working" | "blocked" | "idle", needle: string, visible: "visibleWorking" | "visibleBlocker" | "visibleIdle") => ({
    id,
    state,
    priority: 10,
    region: "whole_recent",
    visibleIdle: visible === "visibleIdle",
    visibleBlocker: visible === "visibleBlocker",
    visibleWorking: visible === "visibleWorking",
    skipStateUpdate: false,
    gate: { contains: [needle], regex: [], lineRegex: [], all: [], any: [], not: [] },
  });
  return {
    kind,
    minEngineVersion: null,
    rules: [rule("working", "working", "working...", "visibleWorking"), rule("blocked", "blocked", "proceed?", "visibleBlocker"), rule("idle-visible", "idle", "ready>", "visibleIdle")],
  };
}

class FakePersistScheduler implements PersistScheduler {
  touch(): void {}
  async flush(): Promise<void> {}
  cancel(): void {}
}

const HOST_INFO: HostInfo = { os: "linux", windowsBuild: null, hostname: "test" };

function makeHarness() {
  const terminals = new FakeTerminalManager();
  const bus = new EventBus();
  const processInspector = new FakeProcessInspector();
  const manifestStore = new FakeManifestStore();
  const session = new SessionService({
    model: new SessionModel(),
    terminals,
    bus,
    persist: new FakePersistScheduler(),
    serverVersion: "test",
    host: HOST_INFO,
    scrollbackLines: 1000,
    spawnGraceMs: 1,
    defaultCwd: "/home/u",
    logger: new MemoryLogger(),
  });
  const monitorLogger = new MemoryLogger();
  const monitor = new AgentMonitor({ session, terminals, processInspector, manifestStore, bus, logger: monitorLogger });
  return { terminals, bus, processInspector, manifestStore, session, monitor, monitorLogger };
}

/** `vi.advanceTimersByTimeAsync` を大きく1回で呼ぶより、心拍（100ms）単位で細かく刻んで呼ぶ方が、
 *  各心拍が生む非同期の連鎖（judge の中の await）をそのたびに確実に drain できる。 */
async function advance(totalMs: number, stepMs = 10): Promise<void> {
  let remaining = totalMs;
  while (remaining > 0) {
    const step = Math.min(stepMs, remaining);
    await vi.advanceTimersByTimeAsync(step);
    remaining -= step;
  }
}

describe("AgentMonitor", () => {
  // `session.createWorkspace()` 自身が内部で実物の setTimeout（D37 の猶予判定）を使うので、
  // 偽の時計は pane を作り終えたあと（各テストの中で）だけ有効にする。
  afterEach(() => {
    vi.useRealTimers();
  });

  it("エージェントを見つけたら3秒の起動猶予のあと判定し、pane.agent_status_changed が届く（D46）", async () => {
    const { terminals, bus, processInspector, manifestStore, session, monitor } = makeHarness();
    manifestStore.set("claude", simpleManifest("claude"));
    const { pane } = await session.createWorkspace("/home/u", "api");
    const host = terminals.get(pane.id) as FakeTerminalHost;
    host.mirror.linesValue = ["working..."];
    processInspector.jobs.set(host.pid, { processGroupId: 999, processes: [{ pid: 999, exe: "claude", argv: ["claude"], cwd: null }] });

    const events: string[] = [];
    bus.subscribe((e) => events.push(e.event));
    vi.useFakeTimers();
    monitor.start();
    try {
      await advance(150); // 最初の心拍（100ms周期）を1回過ぎたところ：まだ検出直後
      expect(events).toContain("pane.agent_status_changed"); // 最初の unknown を即座に知らせる（D46）

      events.length = 0;
      await advance(3500); // 猶予（3秒）を過ぎる
      expect(events).toContain("pane.agent_status_changed");
      const snapshot = session.snapshot().panes.find((p) => p.id === pane.id);
      expect(snapshot?.agent?.kind).toBe("claude");
      expect(snapshot?.agent?.state).toBe("working");
    } finally {
      await monitor.stop();
    }
  });

  it("前の周期の foregroundJob がまだ終わっていない pane は次の心拍で飛ばす（直列化）", async () => {
    const { terminals, processInspector, session, monitor } = makeHarness();
    const { pane } = await session.createWorkspace("/home/u", "api");
    const host = terminals.get(pane.id) as FakeTerminalHost;
    processInspector.delayMs = 300; // 心拍（100ms）より長くかかる

    vi.useFakeTimers();
    monitor.start();
    try {
      await advance(250); // 心拍2回分経過してもまだ1回目の呼び出し中のはず
      expect(processInspector.calls.filter((pid) => pid === host.pid).length).toBe(1);
      await advance(300); // 1回目が終わる
      expect(processInspector.calls.filter((pid) => pid === host.pid).length).toBeGreaterThanOrEqual(1);
    } finally {
      await monitor.stop();
    }
  });

  it("working→素の idle の保留中は、短い間隔（100ms）で再確認する", async () => {
    const { terminals, processInspector, manifestStore, session, monitor } = makeHarness();
    manifestStore.set("claude", simpleManifest("claude"));
    const { pane } = await session.createWorkspace("/home/u", "api");
    const host = terminals.get(pane.id) as FakeTerminalHost;
    host.mirror.linesValue = ["working..."];
    processInspector.jobs.set(host.pid, { processGroupId: 999, processes: [{ pid: 999, exe: "claude", argv: ["claude"], cwd: null }] });

    vi.useFakeTimers();
    monitor.start();
    try {
      await advance(3500); // 起動猶予を抜け、working が反映される
      expect(session.snapshot().panes.find((p) => p.id === pane.id)?.agent?.state).toBe("working");

      host.mirror.linesValue = ["ready"]; // どのルールにも一致しない（素の idle）
      host.lastOutputAtValue = Date.now(); // 画面が変わった＝出力があった（ACTIVE_INTERVAL_MS で次の確認が来る）
      processInspector.calls.length = 0;
      await advance(150); // 500ms 待たずに、保留中の再確認（100ms）が働くはず
      expect(processInspector.calls.filter((pid) => pid === host.pid).length).toBeGreaterThanOrEqual(1);
    } finally {
      await monitor.stop();
    }
  });

  it("フォーカスされたら markSeen が反映され、pane.agent_status_changed が届く（design「done」）", async () => {
    const { terminals, bus, processInspector, manifestStore, session, monitor } = makeHarness();
    manifestStore.set("claude", simpleManifest("claude"));
    const { pane } = await session.createWorkspace("/home/u", "api");
    const host = terminals.get(pane.id) as FakeTerminalHost;
    host.mirror.linesValue = ["working..."];
    processInspector.jobs.set(host.pid, { processGroupId: 999, processes: [{ pid: 999, exe: "claude", argv: ["claude"], cwd: null }] });

    vi.useFakeTimers();
    monitor.start();
    try {
      await advance(3500);
      host.mirror.linesValue = ["ready>"]; // visibleIdle。保留せず即座に idle・completionSeq+1
      await advance(600);
      const before = session.snapshot().panes.find((p) => p.id === pane.id)?.agent;
      expect(before?.completionSeq).toBe(1);
      expect(before?.serverSeenSeq).toBe(0);

      const events: string[] = [];
      bus.subscribe((e) => events.push(e.event));
      session.focusPane(pane.id); // session.focus_changed を発行 → AgentMonitor が markSeen する
      expect(events).toContain("pane.agent_status_changed");
      const after = session.snapshot().panes.find((p) => p.id === pane.id)?.agent;
      expect(after?.serverSeenSeq).toBe(1);
    } finally {
      await monitor.stop();
    }
  });

  it("pane が閉じられても例外にならず、以後の心拍で静かに無視する", async () => {
    const { session, monitor } = makeHarness();
    const { pane } = await session.createWorkspace("/home/u", "api");
    await session.createWorkspace("/home/u", "api2"); // これが無いと D24 の自動作成（実物の setTimeout を使う）が
    // closePane の中で起きてしまい、偽の時計の下では待ち続けてしまう。もう1つ workspace を残しておけば起きない。

    vi.useFakeTimers();
    monitor.start();
    try {
      await advance(50);
      await session.closePane(pane.id);
      await expect(vi.advanceTimersByTimeAsync(1200)).resolves.not.toThrow();
    } finally {
      await monitor.stop();
    }
  });

  it("stop() したあとは心拍が動かない", async () => {
    const { terminals, processInspector, session, monitor } = makeHarness();
    const { pane } = await session.createWorkspace("/home/u", "api");
    const host = terminals.get(pane.id) as FakeTerminalHost;

    vi.useFakeTimers();
    monitor.start();
    await advance(50);
    await monitor.stop();
    processInspector.calls.length = 0;
    await advance(2000);
    expect(processInspector.calls.filter((pid) => pid === host.pid).length).toBe(0);
  });

  it("判定の失敗が同じ pane・同じ理由で続くときは、最初の 1 回と、60 秒ごとの件数つきの 1 行だけをログに出す（20261009-agent-resume-lost の AC6）", async () => {
    const { processInspector, session, monitor, monitorLogger } = makeHarness();
    await session.createWorkspace("/home/u", "api");
    processInspector.hangs = true; // 毎回 2 秒の時間切れ → 約 3 秒に 1 回の失敗
    vi.useFakeTimers();
    monitor.start();
    await advance(130_000, 100);
    const failures = monitorLogger.lines.filter((l) => l.msg === "agent judgment failed");
    expect(failures.length).toBeGreaterThanOrEqual(2);
    expect(failures.length).toBeLessThanOrEqual(4); // まとめなければ 40 件あまり
    expect(failures[0]!.fields).not.toHaveProperty("repeated");
    expect(failures[1]!.fields?.["repeated"]).toBeGreaterThan(5);
  });

  it("foregroundJob が固まっても、上限（2秒）で諦めてその pane の判定を再開する（review 指摘。should）", async () => {
    const { terminals, processInspector, session, monitor, monitorLogger } = makeHarness();
    const { pane } = await session.createWorkspace("/home/u", "api");
    const host = terminals.get(pane.id) as FakeTerminalHost;
    processInspector.hangs = true; // ネイティブ実装のコールバックが一度も呼ばれない状況を模す

    vi.useFakeTimers();
    monitor.start();
    // ここでは `monitor.stop()` を待たない（このテスト自身が「ハングしたまま二度と解決しない」を作る
    // シナリオなので、以後は時計を進めるものが無いと `stop()` の内部の `Promise.allSettled` も
    // 一緒にハングしてしまう。タイムアウトで実際にその周期が終わったことまでを確かめれば十分）。
    await advance(150); // 最初の心拍で呼び出しが inFlight になる（一生解決しない）
    expect(processInspector.calls.filter((pid) => pid === host.pid).length).toBe(1);

    await advance(2100); // タイムアウト（2000ms）を過ぎる
    expect(monitorLogger.lines.some((l) => l.level === "error" && l.msg === "agent judgment failed")).toBe(true);

    // 次の心拍（IDLE_INTERVAL_MS=1秒後の再判定）がまだ起きていないこの時点で stop() を呼ぶ。
    // タイムアウトした1回目の周期は既に settle して inFlightJudgments から抜けているはずなので、
    // stop() は（新たにハングする2回目の呼び出しを待つ必要なく）速やかに返るはず。
    await expect(monitor.stop()).resolves.toBeUndefined();
  });

  it("stop() は実行中の判定周期を待ってから返る（review 指摘。should。close() が terminals を破棄する前に\
実行中の周期を終わらせるため）", async () => {
    const { terminals, processInspector, session, monitor } = makeHarness();
    const { pane } = await session.createWorkspace("/home/u", "api");
    const host = terminals.get(pane.id) as FakeTerminalHost;
    processInspector.delayMs = 1500; // タイムアウト（2000ms）未満で終わる、意図的に遅い呼び出し

    vi.useFakeTimers();
    monitor.start();
    await advance(150); // 最初の心拍で呼び出しが inFlight になる
    expect(processInspector.calls.filter((pid) => pid === host.pid).length).toBe(1);

    let stopped = false;
    const stopPromise = monitor.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve(); // マイクロタスクを逃がすだけ（時計は進めない）
    expect(stopped).toBe(false); // 1500ms の遅延がまだ終わっていないので、stop() もまだ返らない

    await advance(1500); // 遅延分だけ進める → 実行中の周期が完了する
    await stopPromise;
    expect(stopped).toBe(true);
  });
});
