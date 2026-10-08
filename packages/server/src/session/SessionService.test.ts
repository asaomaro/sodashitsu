import type { AgentInfo, GitInfo, HostInfo, LayoutNode, Workspace } from "@sodashitsu/protocol";
import { RpcError, UUID_RE } from "@sodashitsu/protocol";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Disposable } from "../util/Disposable.js";
import { MemoryLogger } from "../log/Logger.js";
import { EventBus } from "../bus/EventBus.js";
import type { CreatePaneOptions, TerminalManager } from "../terminal/TerminalManager.js";
import type { TerminalHost } from "../terminal/TerminalHost.js";
import type { PersistScheduler } from "./PersistScheduler.js";
import { NotFoundError, SessionModel, type GitJudgement } from "./SessionModel.js";
import { SessionService } from "./SessionService.js";
import * as Layout from "./LayoutTree.js";
import type { NewCwdDeps } from "./newCwd.js";
import type { WorkspaceLabelDeps } from "./workspaceLabel.js";
import type { SessionFileData } from "../persist/SessionFile.js";
import { historyReplayText } from "../terminal/historyAnsi.js";

/** 即座に失敗させたい pane の id を登録しておける偽の TerminalManager（T17「テスト方針」）。 */
class FakeTerminalHost implements TerminalHost {
  readonly pid = 4242;
  /** 20260926-edit-scrollback：ミラーの `plainText()` が返す中身。 */
  scrollbackText = "";
  /** 20260926-screen-history-replay：ミラーへの書き込み（画面履歴の流し込み）を記録する。 */
  mirrorWrites: string[] = [];
  readonly mirror = {
    plainText: () => this.scrollbackText,
    write: (chunk: string) => {
      this.mirrorWrites.push(chunk);
    },
  } as unknown as TerminalHost["mirror"];
  readonly fanout = {} as TerminalHost["fanout"];
  private readonly exitListeners = new Set<(code: number) => void>();
  disposed = false;
  resized: { cols: number; rows: number } | null = null;
  /** 20260923-agent-session-resume：復元時の resume コマンド投入を確かめるため、書き込みを記録する。 */
  writes: (string | Uint8Array)[] = [];

  constructor(
    readonly paneId: string,
    failWithCode: number | null,
  ) {
    if (failWithCode !== null) {
      queueMicrotask(() => {
        for (const fn of [...this.exitListeners]) fn(failWithCode);
      });
    }
  }
  write(input: string | Uint8Array): void {
    this.writes.push(input);
  }
  writeModal(): Promise<void> {
    return Promise.resolve();
  }
  resize(cols: number, rows: number): void {
    this.resized = { cols, rows };
  }
  lastOutputAt(): number {
    return Date.now();
  }
  onExit(cb: (code: number) => void): Disposable {
    this.exitListeners.add(cb);
    return { dispose: () => this.exitListeners.delete(cb) };
  }
  dispose(): void {
    this.disposed = true;
  }
  fireExit(code: number): void {
    for (const fn of [...this.exitListeners]) fn(code);
  }
}

class FakeTerminalManager implements TerminalManager {
  readonly hosts = new Map<string, FakeTerminalHost>();
  readonly createOptions: CreatePaneOptions[] = [];
  /** 次に create するとき、この終了コードで即座に失敗させる（null なら成功）。 */
  nextSpawnFailure: number | null = null;
  /** create の直後に呼ぶ（20260926-edit-scrollback：起動の猶予の間に別の操作を割り込ませる）。 */
  onCreate: ((paneId: string) => void) | null = null;

  create(paneId: string, opts: CreatePaneOptions): TerminalHost {
    this.createOptions.push(opts);
    queueMicrotask(() => this.onCreate?.(paneId));
    const host = new FakeTerminalHost(paneId, this.nextSpawnFailure);
    this.nextSpawnFailure = null;
    this.hosts.set(paneId, host);
    return host;
  }
  get(paneId: string): TerminalHost | undefined {
    return this.hosts.get(paneId);
  }
  resize(paneId: string, cols: number, rows: number): void {
    this.hosts.get(paneId)?.resize(cols, rows);
  }
  dispose(paneId: string): void {
    this.hosts.get(paneId)?.dispose();
    this.hosts.delete(paneId);
  }
}

class FakePersistScheduler implements PersistScheduler {
  touchCount = 0;
  touch(): void {
    this.touchCount++;
  }
  async flush(): Promise<void> {
    // no-op
  }
  cancel(): void {}
}

const HOST_INFO: HostInfo = { os: "linux", windowsBuild: null, hostname: "test-host" };

/**
 * 名前を決める偽の依存（20260921-workspace-auto-label）。`gitRoots` の下（とその階層）は git のリポジトリ（`.git/HEAD` がある）とみなす。
 * `/home/u` はホーム。stat を保留にしたいテストは `stat` を差し替える。
 */
function fakeLabelDeps(gitRoots: string[] = []): WorkspaceLabelDeps {
  const files = new Set(gitRoots.map((r) => `${r}/.git/HEAD`));
  const dirs = new Set(gitRoots.map((r) => `${r}/.git`));
  return {
    stat: async (p) => (files.has(p) ? { isDirectory: false, isFile: true } : dirs.has(p) ? { isDirectory: true, isFile: false } : null),
    readFile: async () => null,
    home: () => "/home/u",
  };
}

function makeService(
  terminals: FakeTerminalManager,
  bus: EventBus,
  persist: FakePersistScheduler,
  shell?: string,
  workspaceLabelDeps?: WorkspaceLabelDeps,
) {
  return new SessionService({
    shell,
    workspaceLabelDeps,
    model: new SessionModel(),
    terminals,
    bus,
    persist,
    serverVersion: "0.1.0-test",
    host: HOST_INFO,
    scrollbackLines: 1000,
    spawnGraceMs: 5, // テストを速く保つ（本番の既定は 300ms。D37）
    defaultCwd: "/home/u",
    logger: new MemoryLogger(),
  });
}

describe("SessionService — `--shell`（T27）", () => {
  it("--shell を渡すと、workspace・tab・分割のどの新しい pane もそのシェルで起動する", async () => {
    const terminals = new FakeTerminalManager();
    const service = makeService(terminals, new EventBus(), new FakePersistScheduler(), "/usr/bin/zsh");
    const { workspace, pane } = await service.createWorkspace("/home/u/api", "api");
    await service.createTab(workspace.id, undefined);
    await service.splitPane(pane.id, "right", undefined);
    expect(terminals.createOptions.map((o) => o.shell)).toEqual(["/usr/bin/zsh", "/usr/bin/zsh", "/usr/bin/zsh"]);
    expect(service.snapshot().panes.map((p) => p.shell)).toEqual(["/usr/bin/zsh", "/usr/bin/zsh", "/usr/bin/zsh"]); // 保存にも残る
  });

  it("再起動後の復元でも、保存された shell ではなく --shell で起動する", async () => {
    const terminals = new FakeTerminalManager();
    const service = makeService(terminals, new EventBus(), new FakePersistScheduler(), "/usr/bin/zsh");
    const data: SessionFileData = {
      schema: 1,
      savedAt: "2026-09-18T00:00:00Z",
      groups: [],
      workspaces: [
        {
          id: "w1",
          label: "api",
          cwd: "/home/u/api",
          activeTabId: "t1",
          tabs: [
            {
              id: "t1",
              label: "main",
              focusedPaneId: "p1",
              zoomedPaneId: null,
              layout: { type: "pane", paneId: "p1" },
              panes: [{ id: "p1", label: null, cwd: "/home/u/api", shell: "" }],
            },
          ],
        },
      ],
      focus: { workspaceId: "w1", tabId: "t1", paneId: "p1" },
    };
    await service.restore(data);
    expect(terminals.createOptions.map((o) => o.shell)).toEqual(["/usr/bin/zsh"]);
  });

  it("--shell を渡さなければ shell を指定しない（TerminalManager が OS の既定を使う）", async () => {
    const terminals = new FakeTerminalManager();
    const service = makeService(terminals, new EventBus(), new FakePersistScheduler());
    await service.createWorkspace("/home/u/api", "api");
    expect(terminals.createOptions[0]?.shell).toBeUndefined();
  });
});

// 20260928-windows-pane-cwd の D-1・decisions D2：場所の知らせを差し込むのは対話の pane のシェル（新規・分割・復元）だけ。
describe("SessionService — シェルの場所の知らせ（trackCwd）", () => {
  it("workspace・tab・分割・再起動後の復元の pane は trackCwd 付きで起動する（--shell の有無によらない）", async () => {
    for (const shell of [undefined, "pwsh.exe"]) {
      const terminals = new FakeTerminalManager();
      const service = makeService(terminals, new EventBus(), new FakePersistScheduler(), shell);
      const { workspace, pane } = await service.createWorkspace("/home/u/api", "api");
      await service.createTab(workspace.id, undefined);
      await service.splitPane(pane.id, "right", undefined);
      expect(terminals.createOptions.map((o) => o.trackCwd), String(shell)).toEqual([true, true, true]);

      const restored = new FakeTerminalManager();
      await makeService(restored, new EventBus(), new FakePersistScheduler(), shell).restore({
        schema: 1,
        savedAt: "2026-09-28T00:00:00Z",
        groups: [],
        workspaces: [
          {
            id: "w1",
            label: "api",
            cwd: "/home/u/api",
            activeTabId: "t1",
            tabs: [
              {
                id: "t1",
                label: "main",
                focusedPaneId: "p1",
                zoomedPaneId: null,
                layout: { type: "split", id: "s1", dir: "right", ratio: 0.5, a: { type: "pane", paneId: "p1" }, b: { type: "pane", paneId: "p2" } },
                panes: [
                  { id: "p1", label: null, cwd: "/home/u/api", shell: "" },
                  { id: "p2", label: null, cwd: "/home/u/api/src", shell: "" },
                ],
              },
            ],
          },
        ],
        focus: { workspaceId: "w1", tabId: "t1", paneId: "p1" },
      });
      expect(restored.createOptions.map((o) => [o.cwd, o.trackCwd]), String(shell)).toEqual([
        ["/home/u/api", true],
        ["/home/u/api/src", true],
      ]);
    }
  });
});

describe("SessionService — workspace creation", () => {
  let terminals: FakeTerminalManager;
  let bus: EventBus;
  let persist: FakePersistScheduler;
  let service: SessionService;

  beforeEach(() => {
    terminals = new FakeTerminalManager();
    bus = new EventBus();
    persist = new FakePersistScheduler();
    service = makeService(terminals, bus, persist);
  });

  it("creates a workspace, emits workspace.created and pane.created, and schedules a save", async () => {
    const events: string[] = [];
    bus.subscribe((e) => events.push(e.event));
    const { workspace, pane } = await service.createWorkspace("/home/u/api", "api");
    expect(workspace.cwd).toBe("/home/u/api");
    expect(pane.status).toBe("running");
    expect(events).toEqual(["workspace.created", "tab.created", "pane.created", "sidebar.layout_changed"]); // D88（最後は新しい項目 `w:<id>` が一番上の末尾に入った知らせ）
    expect(persist.touchCount).toBe(1);
    expect(terminals.get(pane.id)).toBeDefined();
  });

  it("throws spawn_failed and does not commit anything when the shell fails to start (D37)", async () => {
    terminals.nextSpawnFailure = 1; // execvp 失敗を模する
    const events: string[] = [];
    bus.subscribe((e) => events.push(e.event));
    await expect(service.createWorkspace("/home/u", "api")).rejects.toThrow(RpcError);
    expect(events).toEqual([]); // 何もイベントを出さない
    expect(persist.touchCount).toBe(0);
    expect(service.snapshot().workspaces).toEqual([]); // モデルにも残らない
  });

  it("treats an immediate exit code 0 as a successful spawn, then immediately closes it and auto-recreates (D37 + D18 + D24)", async () => {
    // レビュー指摘で発覚: 猶予中に code 0 で即終了した pane は、以前は永久に「running」のまま残る
    // zombie になっていた（onExit の登録が終了イベントより後で、二度と発火しないため）。
    // 直した今は、成功として一度モデルへコミットしたあと、その場で D18 の連鎖（closePane）が起き、
    // 唯一の workspace だったので D24 ですぐ作り直される。
    terminals.nextSpawnFailure = 0;
    const { workspace } = await service.createWorkspace("/home/u", "api");
    expect(service.snapshot().workspaces.map((w) => w.id)).not.toContain(workspace.id);
    expect(service.snapshot().workspaces.length).toBe(1); // D24 で作り直された別の workspace
  });
});

describe("SessionService — tabs and panes", () => {
  let terminals: FakeTerminalManager;
  let bus: EventBus;
  let persist: FakePersistScheduler;
  let service: SessionService;

  beforeEach(() => {
    terminals = new FakeTerminalManager();
    bus = new EventBus();
    persist = new FakePersistScheduler();
    service = makeService(terminals, bus, persist);
  });

  it("splits a pane and emits pane.created + layout.updated", async () => {
    const { pane } = await service.createWorkspace("/home/u", "api");
    const events: string[] = [];
    bus.subscribe((e) => events.push(e.event));
    const { pane: newPane } = await service.splitPane(pane.id, "right", undefined);
    expect(events).toEqual(["pane.created", "layout.updated"]);
    expect(newPane.cwd).toBe(pane.cwd); // 分割元の cwd を引き継ぐ
  });

  // 20260923-pane-name-dnd-swap：ドラッグでの入れ替え。design「3. サーバ側」。
  it("swapPaneWith: 入れ替えに成功すると layout.updated を publish し保存を予約する", async () => {
    const { pane } = await service.createWorkspace("/home/u", "api");
    const { pane: other } = await service.splitPane(pane.id, "right", undefined);
    const events: string[] = [];
    bus.subscribe((e) => events.push(e.event));
    persist.touchCount = 0;

    const ok = service.swapPaneWith(pane.id, other.id);

    expect(ok).toBe(true);
    expect(events).toEqual(["layout.updated"]);
    expect(persist.touchCount).toBe(1);
  });

  it("swapPaneWith: 何も起きなかったときは publish も保存の予約もしない", async () => {
    const { pane } = await service.createWorkspace("/home/u", "api");
    const events: string[] = [];
    bus.subscribe((e) => events.push(e.event));
    persist.touchCount = 0;

    const ok = service.swapPaneWith(pane.id, pane.id); // 同じ pane 同士

    expect(ok).toBe(false);
    expect(events).toEqual([]);
    expect(persist.touchCount).toBe(0);
  });

  // 20260924-pane-dnd-split-move：ドラッグでの分割。design「振る舞いの詳細 > サーバ側」。
  it("moveToEdge: 成功すると layout.updated を publish し保存を予約する", async () => {
    const { pane } = await service.createWorkspace("/home/u", "api");
    const { pane: other } = await service.splitPane(pane.id, "right", undefined);
    const events: string[] = [];
    bus.subscribe((e) => events.push(e.event));
    persist.touchCount = 0;

    const ok = service.moveToEdge(other.id, pane.id, "top");

    expect(ok).toBe(true);
    expect(events).toEqual(["layout.updated"]);
    expect(persist.touchCount).toBe(1);
  });

  it("moveToEdge: 何も起きなかったときは publish も保存の予約もしない", async () => {
    const { pane } = await service.createWorkspace("/home/u", "api");
    const events: string[] = [];
    bus.subscribe((e) => events.push(e.event));
    persist.touchCount = 0;

    const ok = service.moveToEdge(pane.id, pane.id, "top"); // 自分自身の縁

    expect(ok).toBe(false);
    expect(events).toEqual([]);
    expect(persist.touchCount).toBe(0);
  });

  // 20260924-pane-dnd-split-move：ドラッグでの分割解除。ドロップ先のプロセスは実際に終了する。
  it("replacePane: ドロップ先のプロセスを破棄し、pane.closed → layout.updated の順に publish する", async () => {
    const { pane } = await service.createWorkspace("/home/u", "api");
    const { pane: other } = await service.splitPane(pane.id, "right", undefined);
    const host = terminals.get(other.id) as FakeTerminalHost;
    const events: string[] = [];
    bus.subscribe((e) => events.push(e.event));
    persist.touchCount = 0;

    const ok = service.replacePane(pane.id, other.id);

    expect(ok).toBe(true);
    expect(host.disposed).toBe(true);
    expect(events).toEqual(["pane.closed", "layout.updated"]);
    expect(persist.touchCount).toBe(1);
  });

  // 20260925-pane-replace-focus-hint。
  it("replacePane: 発行する pane.closed の successorPaneId は生存した pane（ドラッグした pane）を指す（AC2）", async () => {
    const { pane } = await service.createWorkspace("/home/u", "api");
    const { pane: other } = await service.splitPane(pane.id, "right", undefined);
    const paneClosedData: { paneId: string; successorPaneId?: string }[] = [];
    bus.subscribe((e) => {
      if (e.event === "pane.closed") paneClosedData.push(e.data);
    });

    service.replacePane(pane.id, other.id);

    expect(paneClosedData).toEqual([{ paneId: other.id, successorPaneId: pane.id }]);
  });

  // `toEqual` は「キーが無い」と「値が undefined」を区別しないため、`successorPaneId` の
  // **キー自体が無い**ことは `Object.hasOwn` で確認する（taskcheck T3 round1 の must 指摘：
  // 元の `toEqual({ successorPaneId: undefined })` は無効な回帰テストだった）。
  it("closePane: 発行する pane.closed に successorPaneId のキー自体が含まれない（回帰。AC3）", async () => {
    const { pane } = await service.createWorkspace("/home/u", "api");
    const { pane: other } = await service.splitPane(pane.id, "right", undefined);
    const paneClosedData: { paneId: string; successorPaneId?: string }[] = [];
    bus.subscribe((e) => {
      if (e.event === "pane.closed") paneClosedData.push(e.data);
    });

    await service.closePane(other.id);

    expect(paneClosedData).toHaveLength(1);
    expect(Object.hasOwn(paneClosedData[0]!, "successorPaneId")).toBe(false);
  });

  it("closeTab: 発行する pane.closed に successorPaneId のキー自体が含まれない（回帰。AC3）", async () => {
    const { workspace } = await service.createWorkspace("/home/u", "api");
    const { tab, pane: tabPane } = await service.createTab(workspace.id, undefined);
    await service.splitPane(tabPane.id, "right", undefined); // この tab に2枚目の pane を作る
    const paneClosedData: { paneId: string; successorPaneId?: string }[] = [];
    bus.subscribe((e) => {
      if (e.event === "pane.closed") paneClosedData.push(e.data);
    });

    await service.closeTab(tab.id);

    expect(paneClosedData.length).toBeGreaterThan(0);
    for (const data of paneClosedData) expect(Object.hasOwn(data, "successorPaneId")).toBe(false);
  });

  it("closeWorkspace: 発行する pane.closed に successorPaneId のキー自体が含まれない（回帰。AC3）", async () => {
    const { workspace, pane } = await service.createWorkspace("/home/u", "api");
    await service.splitPane(pane.id, "right", undefined);
    const paneClosedData: { paneId: string; successorPaneId?: string }[] = [];
    bus.subscribe((e) => {
      if (e.event === "pane.closed") paneClosedData.push(e.data);
    });

    await service.closeWorkspace(workspace.id);

    expect(paneClosedData.length).toBeGreaterThan(0);
    for (const data of paneClosedData) expect(Object.hasOwn(data, "successorPaneId")).toBe(false);
  });

  it("replacePane: 何も起きなかったときはプロセスを破棄せず publish も保存の予約もしない", async () => {
    const { pane } = await service.createWorkspace("/home/u", "api");
    const events: string[] = [];
    bus.subscribe((e) => events.push(e.event));
    persist.touchCount = 0;

    const ok = service.replacePane(pane.id, pane.id); // 自分自身

    expect(ok).toBe(false);
    expect(events).toEqual([]);
    expect(persist.touchCount).toBe(0);
  });

  // 20260924-pane-move-cross-tab：D&D での別 tab・別 workspace への移動。
  // design「振る舞いの詳細 > 複数クライアントでの同期」・decisions.md D3（pane.updated の追加）。
  describe("moveToTab", () => {
    it("移動元 tab に他の pane が残るとき: pane.updated → layout.updated（移動元）→ layout.updated（移動先）の順に publish する", async () => {
      const { pane: p1, tab: t1 } = await service.createWorkspace("/home/u", "api");
      const { pane: p2 } = await service.splitPane(p1.id, "right", undefined);
      const { tab: t2 } = await service.createTab(t1.workspaceId, undefined);
      const events: string[] = [];
      bus.subscribe((e) => events.push(e.event));
      persist.touchCount = 0;

      const ok = service.moveToTab(p2.id, t2.id);

      expect(ok).toBe(true);
      expect(events).toEqual(["pane.updated", "layout.updated", "layout.updated"]);
      expect(service.snapshot().panes.find((p) => p.id === p2.id)?.tabId).toBe(t2.id);
      expect(persist.touchCount).toBe(1);
    });

    it("移動元 tab がその1枚だけの pane を失って空になるとき: workspace が生き残れば tab.closed → workspace.updated を publish する", async () => {
      const { tab: t1 } = await service.createWorkspace("/home/u", "api");
      const { tab: t2, pane: p2 } = await service.createTab(t1.workspaceId, undefined);
      const { tab: t3 } = await service.createTab(t1.workspaceId, undefined);
      const events: string[] = [];
      bus.subscribe((e) => events.push(e.event));
      persist.touchCount = 0;

      const ok = service.moveToTab(p2.id, t3.id);

      expect(ok).toBe(true);
      expect(events).toEqual(["pane.updated", "tab.closed", "workspace.updated", "layout.updated"]);
      expect(service.snapshot().tabs.map((t) => t.id)).not.toContain(t2.id);
      expect(service.snapshot().workspaces.map((w) => w.id)).toContain(t1.workspaceId); // workspace は生き残る
    });

    it("移動元 workspace も連鎖して空になるとき（D18）: tab.closed → workspace.closed を publish する", async () => {
      const { workspace: w1, pane: p1, tab: t1 } = await service.createWorkspace("/home/u", "api");
      const { workspace: w2, tab: t2 } = await service.createWorkspace("/home/u", "other");
      const events: string[] = [];
      bus.subscribe((e) => events.push(e.event));
      persist.touchCount = 0;

      const ok = service.moveToTab(p1.id, t2.id);

      expect(ok).toBe(true);
      expect(events).toEqual(["pane.updated", "tab.closed", "workspace.closed", "sidebar.layout_changed", "layout.updated"]);
      expect(service.snapshot().tabs.map((t) => t.id)).not.toContain(t1.id);
      expect(service.snapshot().workspaces.map((w) => w.id)).not.toContain(w1.id);
      expect(service.snapshot().workspaces.map((w) => w.id)).toContain(w2.id);
    });

    it("自分自身の tab など何も起きなかったときは publish も保存の予約もしない", async () => {
      const { pane, tab } = await service.createWorkspace("/home/u", "api");
      const events: string[] = [];
      bus.subscribe((e) => events.push(e.event));
      persist.touchCount = 0;

      const ok = service.moveToTab(pane.id, tab.id); // 自分自身の tab

      expect(ok).toBe(false);
      expect(events).toEqual([]);
      expect(persist.touchCount).toBe(0);
    });
  });

  describe("moveToNewTab", () => {
    it("別 workspace への移動: pane.updated → tab.created → workspace.updated（移動先）→ layout.updated（移動元。生きていれば）の順に publish する", async () => {
      const { pane: p1, tab: t1 } = await service.createWorkspace("/home/u", "api");
      const { pane: p2 } = await service.splitPane(p1.id, "right", undefined);
      const { workspace: w2 } = await service.createWorkspace("/home/u", "other");
      const events: string[] = [];
      bus.subscribe((e) => events.push(e.event));
      persist.touchCount = 0;

      const newTab = service.moveToNewTab(p2.id, w2.id);

      expect(newTab).not.toBeNull();
      expect(newTab?.workspaceId).toBe(w2.id);
      expect(events).toEqual(["pane.updated", "tab.created", "workspace.updated", "layout.updated"]);
      expect(service.snapshot().panes.find((p) => p.id === p2.id)?.tabId).toBe(newTab?.id);
      expect(service.snapshot().tabs.map((t) => t.id)).toContain(t1.id); // 移動元 tab は生き残る（p1 が残る）
    });

    it("同一 workspace 内で、移動元 tab がその1枚だけの pane を失っても正しく畳まれる（他の tab は残る）", async () => {
      const { workspace: w1, tab: t1, pane: p1 } = await service.createWorkspace("/home/u", "api");
      const { tab: t2 } = await service.createTab(w1.id, undefined);
      const events: string[] = [];
      bus.subscribe((e) => events.push(e.event));
      persist.touchCount = 0;

      const newTab = service.moveToNewTab(p1.id, w1.id); // 移動先 workspace == 移動元 workspace

      expect(newTab).not.toBeNull();
      // 移動元と移動先が同じ workspace なので、workspace.updated は1回だけ（二重に発行しない。D3 の続き）。
      expect(events).toEqual(["pane.updated", "tab.created", "workspace.updated", "tab.closed"]);
      expect(service.snapshot().tabs.map((t) => t.id)).not.toContain(t1.id); // 唯一の pane を失った移動元 tab は畳まれる
      expect(service.snapshot().tabs.map((t) => t.id)).toContain(t2.id); // 他の tab は残る
      expect(service.snapshot().workspaces.map((w) => w.id)).toContain(w1.id);
    });

    it("存在しない workspace など何も起きなかったときは publish も保存の予約もしない", async () => {
      const { pane } = await service.createWorkspace("/home/u", "api");
      const events: string[] = [];
      bus.subscribe((e) => events.push(e.event));
      persist.touchCount = 0;

      const newTab = service.moveToNewTab(pane.id, "w-nope");

      expect(newTab).toBeNull();
      expect(events).toEqual([]);
      expect(persist.touchCount).toBe(0);
    });

    it("移動元 workspace も連鎖して空になるとき（D18）: tab.closed → workspace.closed を publish する（moveToTab と同じ分岐。taskcheck 指摘）", async () => {
      const { workspace: w1, pane: p1, tab: t1 } = await service.createWorkspace("/home/u", "api");
      const { workspace: w2 } = await service.createWorkspace("/home/u", "other");
      const events: string[] = [];
      bus.subscribe((e) => events.push(e.event));
      persist.touchCount = 0;

      const newTab = service.moveToNewTab(p1.id, w2.id); // w1 の唯一の tab の唯一の pane を、別 workspace へ

      expect(newTab).not.toBeNull();
      expect(events).toEqual(["pane.updated", "tab.created", "workspace.updated", "tab.closed", "workspace.closed", "sidebar.layout_changed"]);
      expect(service.snapshot().tabs.map((t) => t.id)).not.toContain(t1.id);
      expect(service.snapshot().workspaces.map((w) => w.id)).not.toContain(w1.id);
      expect(service.snapshot().workspaces.map((w) => w.id)).toContain(w2.id);
    });
  });

  // 20261008-web-tab-dnd（別の worktree の workspace への pane の移動を断る。T8）。
  describe("pane の移動の範囲（別の worktree へは断る）", () => {
    const judged = (worktreeKey: string, isLinkedWorktree = false): GitJudgement => ({
      kind: "git",
      git: { branch: "b", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree, worktreeKey },
    });

    it("別の worktree への moveToTab・moveToNewTab は、イベントを 1 つも出さず、保存の予約もしない。理由が返る", async () => {
      const { workspace: w1, pane: p1 } = await service.createWorkspace("/r", "a");
      await service.splitPane(p1.id, "right", undefined);
      const { workspace: w2, tab: t2 } = await service.createWorkspace("/r", "b");
      service.updateWorkspaceGit(w1.id, judged("/r/.git"));
      service.updateWorkspaceGit(w2.id, judged("/r/.git/worktrees/wt", true));
      const events: string[] = [];
      bus.subscribe((e) => events.push(e.event));
      persist.touchCount = 0;

      expect(service.paneMoveBlockToTab(p1.id, t2.id)).toBe("different_worktree");
      expect(service.paneMoveBlockToWorkspace(p1.id, w2.id)).toBe("different_worktree");
      expect(service.moveToTab(p1.id, t2.id)).toBe(false);
      expect(service.moveToNewTab(p1.id, w2.id)).toBeNull();

      expect(events).toEqual([]);
      expect(persist.touchCount).toBe(0);
    });

    it("同じ worktree では今までどおりのイベントの並び", async () => {
      const { workspace: w1, pane: p1 } = await service.createWorkspace("/r", "a");
      await service.splitPane(p1.id, "right", undefined);
      const { workspace: w2, tab: t2 } = await service.createWorkspace("/r", "b");
      service.updateWorkspaceGit(w1.id, judged("/r/.git"));
      service.updateWorkspaceGit(w2.id, judged("/r/.git"));
      expect(service.paneMoveBlockToTab(p1.id, t2.id)).toBeNull();
      const events: string[] = [];
      bus.subscribe((e) => events.push(e.event));
      persist.touchCount = 0;

      expect(service.moveToTab(p1.id, t2.id)).toBe(true);

      expect(events).toEqual(["pane.updated", "layout.updated", "layout.updated"]);
      expect(persist.touchCount).toBe(1);
    });

    it("paneMoveBlockToTab・paneMoveBlockToWorkspace は、pane・tab・workspace が無くても投げずに null", async () => {
      const { pane } = await service.createWorkspace("/r", "a");
      expect(service.paneMoveBlockToTab(pane.id, "nope")).toBeNull();
      expect(service.paneMoveBlockToTab("nope", "nope")).toBeNull();
      expect(service.paneMoveBlockToWorkspace(pane.id, "nope")).toBeNull();
      expect(service.paneMoveBlockToWorkspace("nope", "nope")).toBeNull();
    });
  });

  it("supports at least 16 panes in one session, each independently addressable (AC17「規模」・test 工程で確認)", async () => {
    const { pane: first, tab } = await service.createWorkspace("/home/u", "api");
    const paneIds = [first.id];
    let source = first;
    for (let i = 1; i < 16; i++) {
      const { pane } = await service.splitPane(source.id, i % 2 === 0 ? "right" : "down", undefined);
      paneIds.push(pane.id);
      source = pane;
    }
    expect(paneIds.length).toBe(16);
    expect(new Set(paneIds).size).toBe(16); // 全て別 id
    const snapshot = service.snapshot();
    expect(snapshot.panes.map((p) => p.id).sort()).toEqual([...paneIds].sort());
    expect(snapshot.tabs.find((t) => t.id === tab.id)).toBeDefined();
    // 個別に操作できる（サーバ側が人為的な上限を課していないことの確認。実際の応答性は 03-web-desktop 側の e2e 計測に引き継ぐ）。
    service.resizePane(paneIds[7]!, 100, 30);
    expect(service.getPane(paneIds[7]!)?.cols).toBe(100);
    expect(service.getPane(paneIds[0]!)?.cols).not.toBe(100); // 他の pane には影響しない
  });

  it("rolls back a failed split without touching the layout", async () => {
    const { pane, tab } = await service.createWorkspace("/home/u", "api");
    terminals.nextSpawnFailure = 1;
    await expect(service.splitPane(pane.id, "right", undefined)).rejects.toThrow(RpcError);
    expect(service.snapshot().tabs.find((t) => t.id === tab.id)?.layout).toEqual({ type: "pane", paneId: pane.id });
  });

  it("disposes the orphaned PTY if the source pane is closed during the split's spawn grace window (レビュー指摘・round2)", async () => {
    const { pane } = await service.createWorkspace("/home/u", "api");
    const beforeIds = new Set(terminals.hosts.keys());

    const splitPromise = service.splitPane(pane.id, "right", undefined);
    // spawnForPane は terminals.create() を同期的に呼ぶので、この時点で新しい pane の PTY は
    // 既にフェイク側の hosts に入っている（猶予期間の待ちに入る前）。
    const newPaneId = [...terminals.hosts.keys()].find((id) => !beforeIds.has(id));
    expect(newPaneId).toBeDefined();
    const newHost = terminals.get(newPaneId!) as FakeTerminalHost;

    // 分割元の pane を、猶予期間中（spawn の await 中）に別の RPC で閉じる。
    void service.closePane(pane.id);

    await expect(splitPromise).rejects.toThrow(); // model.splitPane が NotFoundError を投げる
    expect(newHost.disposed).toBe(true); // 孤児化せず破棄されている
  });

  it("closing the only pane closes the tab and workspace, disposes the PTY, and auto-creates a replacement (D24)", async () => {
    const { pane, workspace } = await service.createWorkspace("/home/u", "api");
    const host = terminals.get(pane.id) as FakeTerminalHost;
    const events: string[] = [];
    bus.subscribe((e) => events.push(e.event));

    await service.closePane(pane.id);

    expect(host.disposed).toBe(true);
    expect(events).toEqual([
      "pane.closed",
      "tab.closed",
      "workspace.closed",
      "sidebar.layout_changed",
      "workspace.created",
      "tab.created",
      "pane.created",
      "sidebar.layout_changed",
    ]); // D88
    expect(service.snapshot().workspaces.length).toBe(1);
    expect(service.snapshot().workspaces[0]!.id).not.toBe(workspace.id); // 新しく作られた別の workspace
  });

  it("closes only the pane (not the tab) when siblings remain, and emits layout.updated", async () => {
    const { pane } = await service.createWorkspace("/home/u", "api");
    const { pane: sibling } = await service.splitPane(pane.id, "right", undefined);
    const events: string[] = [];
    bus.subscribe((e) => events.push(e.event));

    await service.closePane(sibling.id);

    expect(events).toEqual(["pane.closed", "layout.updated"]);
    expect(service.snapshot().panes.map((p) => p.id)).toEqual([pane.id]);
  });

  it("disposes the shell when a shell exits on its own (D18)", async () => {
    const { pane } = await service.createWorkspace("/home/u", "api");
    const host = terminals.get(pane.id) as FakeTerminalHost;
    const events: string[] = [];
    bus.subscribe((e) => events.push(e.event));

    host.fireExit(0);
    await new Promise((r) => setTimeout(r, 20)); // closePane は onExit ハンドラの中から非同期に呼ばれる

    expect(events).toContain("pane.exited");
    expect(events).toContain("workspace.closed");
    expect(host.disposed).toBe(true);
  });

  it("closeTab publishes pane.closed for every pane it takes with it, then tab.closed (D42)", async () => {
    // T14/T17 は closePane 経由の連鎖しか自動テストで確かめていなかった。closeTab を直接呼ぶ
    // 経路（複数 pane を抱えた tab を丸ごと閉じる）でも同じ順で全てのイベントが出ることを確かめる。
    const { pane, tab, workspace } = await service.createWorkspace("/home/u", "api");
    const { pane: sibling } = await service.splitPane(pane.id, "right", undefined);
    await service.createTab(workspace.id, "second"); // workspace は残るようにしておく
    const paneHost = terminals.get(pane.id) as FakeTerminalHost;
    const siblingHost = terminals.get(sibling.id) as FakeTerminalHost;
    const events: { event: string; paneId?: string; tabId?: string }[] = [];
    bus.subscribe((e) => events.push({ event: e.event, ...(e.data as { paneId?: string; tabId?: string }) }));

    await service.closeTab(tab.id);

    const paneClosed = events.filter((e) => e.event === "pane.closed").map((e) => e.paneId);
    expect(paneClosed.sort()).toEqual([pane.id, sibling.id].sort());
    expect(events.map((e) => e.event)).not.toContain("workspace.closed"); // 他の tab が残っている
    const tabClosedIdx = events.findIndex((e) => e.event === "tab.closed");
    expect(events[tabClosedIdx]).toEqual({ event: "tab.closed", tabId: tab.id });
    expect(paneClosed.every((_id, i) => events.findIndex((e) => e.paneId === paneClosed[i]) < tabClosedIdx)).toBe(true);
    expect(paneHost.disposed).toBe(true);
    expect(siblingHost.disposed).toBe(true);
  });

  it("createTab emits workspace.updated with the new tabIds (05-e2e-docs T2 の E2E で発見。D88)", async () => {
    // `TabBar.vue` 等は `workspace.tabIds` から tab の一覧を出すため、`tab.created` だけでは
    // 新しい tab がタブバーに現れない（実際に real Chromium で再現した不具合）。
    const { workspace } = await service.createWorkspace("/home/u", "api");
    const events: string[] = [];
    bus.subscribe((e) => events.push(e.event));

    const { tab: newTab } = await service.createTab(workspace.id, "second");

    expect(events).toEqual(["tab.created", "pane.created", "workspace.updated"]);
    expect(service.snapshot().workspaces.find((w) => w.id === workspace.id)?.tabIds).toContain(newTab.id);
  });

  it("moveTab emits workspace.updated with the reordered tabIds (20260923-missing-keybinding-actions)", async () => {
    const { workspace, tab: firstTab } = await service.createWorkspace("/home/u", "api");
    const { tab: secondTab } = await service.createTab(workspace.id, "second");
    const events: { event: string; workspace?: { id: string; tabIds: string[] } }[] = [];
    bus.subscribe((e) => events.push({ event: e.event, ...(e.data as { workspace?: { id: string; tabIds: string[] } }) }));

    service.moveTab(firstTab.id, "next");

    const wsUpdated = events.filter((e) => e.event === "workspace.updated");
    expect(wsUpdated).toHaveLength(1);
    expect(wsUpdated[0]!.workspace?.tabIds).toEqual([secondTab.id, firstTab.id]);
  });

  it("moveTab does not emit workspace.updated when the workspace has only one tab (AC5)", async () => {
    const { workspace, tab } = await service.createWorkspace("/home/u", "api");
    const events: string[] = [];
    bus.subscribe((e) => events.push(e.event));

    service.moveTab(tab.id, "next");

    expect(events).toEqual([]);
    expect(service.snapshot().workspaces.find((w) => w.id === workspace.id)?.tabIds).toEqual([tab.id]);
  });

  it("closeTab emits workspace.updated (not workspace.closed) when a sibling tab remains (D88)", async () => {
    const { workspace } = await service.createWorkspace("/home/u", "api");
    const { tab: secondTab } = await service.createTab(workspace.id, "second");
    const events: { event: string; workspace?: { id: string; tabIds: string[] } }[] = [];
    bus.subscribe((e) => events.push({ event: e.event, ...(e.data as { workspace?: { id: string; tabIds: string[] } }) }));

    await service.closeTab(secondTab.id);

    const wsUpdated = events.filter((e) => e.event === "workspace.updated");
    expect(wsUpdated).toHaveLength(1);
    expect(wsUpdated[0]!.workspace?.tabIds).not.toContain(secondTab.id);
    expect(events.map((e) => e.event)).not.toContain("workspace.closed");
  });

  it("closePane emits workspace.updated when closing the last pane cascades into closing its tab, but a sibling tab keeps the workspace alive (D88)", async () => {
    const { workspace } = await service.createWorkspace("/home/u", "api");
    const { tab: secondTab, pane: secondTabPane } = await service.createTab(workspace.id, "second");
    const events: { event: string; workspace?: { id: string; tabIds: string[] } }[] = [];
    bus.subscribe((e) => events.push({ event: e.event, ...(e.data as { workspace?: { id: string; tabIds: string[] } }) }));

    await service.closePane(secondTabPane.id); // second tab の唯一の pane → tab も連鎖して閉じる

    const wsUpdated = events.filter((e) => e.event === "workspace.updated");
    expect(wsUpdated).toHaveLength(1);
    expect(wsUpdated[0]!.workspace?.tabIds).not.toContain(secondTab.id);
    expect(events.map((e) => e.event)).not.toContain("workspace.closed");
  });

  it("closeWorkspace publishes pane.closed/tab.closed for every pane and tab it takes with it (D42)", async () => {
    const { pane, tab, workspace } = await service.createWorkspace("/home/u", "api");
    const { pane: sibling } = await service.splitPane(pane.id, "right", undefined); // tab に 2 pane
    const { tab: secondTab, pane: secondTabPane } = await service.createTab(workspace.id, "second"); // workspace に 2 tab
    const hosts = [pane.id, sibling.id, secondTabPane.id].map((id) => terminals.get(id) as FakeTerminalHost);
    const events: { event: string; paneId?: string; tabId?: string; workspaceId?: string }[] = [];
    bus.subscribe((e) => events.push({ event: e.event, ...(e.data as Record<string, string>) }));

    await service.closeWorkspace(workspace.id);

    const paneClosed = events.filter((e) => e.event === "pane.closed").map((e) => e.paneId);
    expect(paneClosed.sort()).toEqual([pane.id, sibling.id, secondTabPane.id].sort());
    const tabClosed = events.filter((e) => e.event === "tab.closed").map((e) => e.tabId);
    expect(tabClosed.sort()).toEqual([tab.id, secondTab.id].sort());
    const wsClosedIdx = events.findIndex((e) => e.event === "workspace.closed" && e.workspaceId === workspace.id);
    expect(wsClosedIdx).toBeGreaterThan(-1);
    // pane.closed → tab.closed → workspace.closed の順（design「連鎖して閉じるとき」）。
    expect(events.findIndex((e) => e.event === "pane.closed")).toBeLessThan(events.findIndex((e) => e.event === "tab.closed"));
    expect(events.findIndex((e) => e.event === "tab.closed")).toBeLessThan(wsClosedIdx);
    for (const host of hosts) expect(host.disposed).toBe(true);
    // D24：workspace が 0 個になったので自動で 1 つ作り直す。
    expect(service.snapshot().workspaces.length).toBe(1);
    expect(service.snapshot().workspaces[0]!.id).not.toBe(workspace.id);
  });
});

// 20260923-workspace-grouping。
describe("SessionService — workspace grouping and ordering", () => {
  let terminals: FakeTerminalManager;
  let bus: EventBus;
  let persist: FakePersistScheduler;
  let service: SessionService;

  beforeEach(() => {
    terminals = new FakeTerminalManager();
    bus = new EventBus();
    persist = new FakePersistScheduler();
    service = makeService(terminals, bus, persist);
  });

  it("moveWorkspace emits workspace.order_changed with the reordered ids", async () => {
    const { workspace: w1 } = await service.createWorkspace("/a", "a");
    const { workspace: w2 } = await service.createWorkspace("/b", "b");
    const events: { event: string; workspaceIds?: string[] }[] = [];
    bus.subscribe((e) => events.push({ event: e.event, ...(e.data as { workspaceIds?: string[] }) }));

    service.moveWorkspace(w1.id, "next");

    const orderChanged = events.filter((e) => e.event === "workspace.order_changed");
    expect(orderChanged).toHaveLength(1);
    expect(orderChanged[0]!.workspaceIds).toEqual([w2.id, w1.id]);
  });

  it("moveWorkspace does not emit anything when there is only one workspace", async () => {
    await service.createWorkspace("/a", "a");
    const events: string[] = [];
    bus.subscribe((e) => events.push(e.event));

    service.moveWorkspace((await service.snapshot()).workspaces[0]!.id, "next");

    expect(events).toEqual([]);
  });

  it("moveWorkspacesTo moves a block of ids together and emits workspace.order_changed once", async () => {
    const { workspace: w1 } = await service.createWorkspace("/a", "a");
    const { workspace: w2 } = await service.createWorkspace("/b", "b");
    const { workspace: w3 } = await service.createWorkspace("/c", "c");
    const events: { event: string; workspaceIds?: string[] }[] = [];
    bus.subscribe((e) => events.push({ event: e.event, ...(e.data as { workspaceIds?: string[] }) }));

    service.moveWorkspacesTo([w2.id, w3.id], w1.id);

    const orderChanged = events.filter((e) => e.event === "workspace.order_changed");
    expect(orderChanged).toHaveLength(1);
    expect(orderChanged[0]!.workspaceIds).toEqual([w2.id, w3.id, w1.id]);
  });

  // 20261004-group-worktree-items（T8）。
  it("moveItem publishes sidebar.layout_changed and workspace.order_changed and returns {moved: true}; a rejected move publishes nothing", async () => {
    const { workspace: w1 } = await service.createWorkspace("/a", "a");
    const { workspace: w2 } = await service.createWorkspace("/b", "b");
    const { workspace: w3 } = await service.createWorkspace("/c", "c");
    const events: { event: string; workspaceIds?: string[]; layout?: { top: string[]; ungrouped: string[] } }[] = [];
    bus.subscribe((e) => events.push({ event: e.event, ...(e.data as object) }));
    persist.touchCount = 0;

    expect(service.moveItem({ kind: "workspace", workspaceId: w3.id }, { kind: "workspace", workspaceId: w1.id })).toEqual({ moved: true });
    expect(events.map((e) => e.event)).toEqual(["sidebar.layout_changed", "workspace.order_changed"]);
    expect(events[0]!.layout!.ungrouped).toEqual([`w:${w3.id}`, `w:${w1.id}`, `w:${w2.id}`]);
    expect(events[1]!.workspaceIds).toEqual([w3.id, w1.id, w2.id]);
    expect(persist.touchCount).toBeGreaterThan(0);

    events.length = 0;
    persist.touchCount = 0;
    expect(service.moveItemBy({ kind: "workspace", workspaceId: w3.id }, "previous")).toEqual({ moved: false }); // 端
    expect(service.moveItem({ kind: "workspace", workspaceId: w1.id }, { kind: "workspace", workspaceId: w1.id })).toEqual({ moved: false }); // 自分自身の前
    service.moveWorkspacesTo([w1.id, w2.id, w3.id], w3.id); // 落とし先が動かす対象自身
    expect(events).toEqual([]);
    expect(persist.touchCount).toBe(0);
  });

  it("createWorkspace publishes workspace.order_changed when the new workspace lands before the others (「グループなし」 above a group)", async () => {
    const { workspace: w1 } = await service.createWorkspace("/a", "a");
    const group = service.createGroup("G", w1.id);
    service.moveItem({ kind: "ungrouped" }, { kind: "group", groupId: group.id });
    const events: { event: string; workspaceIds?: string[] }[] = [];
    bus.subscribe((e) => events.push({ event: e.event, ...(e.data as object) }));
    const { workspace: w2 } = await service.createWorkspace("/b", "b");
    const names = events.map((e) => e.event);
    expect(names.indexOf("workspace.created")).toBeGreaterThanOrEqual(0);
    expect(names.indexOf("workspace.order_changed")).toBeGreaterThan(names.indexOf("workspace.created"));
    expect(events.find((e) => e.event === "workspace.order_changed")!.workspaceIds).toEqual([w2.id, w1.id]);
  });

  it("group.* CRUD: create/rename/toggleGroupCollapsed publish group.created/group.updated; add/removeFromGroup publish workspace.updated", async () => {
    const { workspace } = await service.createWorkspace("/a", "a");
    const events: { event: string; group?: { id: string; label: string; collapsed: boolean }; workspace?: { groupId: string | null } }[] = [];
    bus.subscribe((e) => events.push({ event: e.event, ...(e.data as { group?: { id: string; label: string; collapsed: boolean }; workspace?: { groupId: string | null } }) }));

    const group = service.createGroup("backend");
    expect(events.map((e) => e.event)).toEqual(["group.created", "sidebar.layout_changed"]); // グループの項目 `g:<id>` が一番上の末尾に入る
    expect(events[0]).toEqual({ event: "group.created", group });

    service.renameGroup(group.id, "frontend");
    expect(events.at(-1)?.event).toBe("group.updated");
    expect(events.at(-1)?.group?.label).toBe("frontend");

    service.toggleGroupCollapsed(group.id);
    expect(events.at(-1)).toEqual({ event: "group.updated", group: { id: group.id, label: "frontend", collapsed: true } });
    service.toggleGroupCollapsed(group.id); // もう一度で戻る（競合しない。タスク点検の指摘）
    expect(events.at(-1)).toEqual({ event: "group.updated", group: { id: group.id, label: "frontend", collapsed: false } });

    const updatedEvents = (): typeof events => events.filter((e) => e.event === "workspace.updated");
    service.addToGroup(workspace.id, group.id);
    expect(updatedEvents().at(-1)?.workspace?.groupId).toBe(group.id);

    service.removeFromGroup(workspace.id);
    expect(updatedEvents().at(-1)?.workspace?.groupId).toBeNull();
  });

  // 20261004-group-worktree-items（T5）。`workspace.closed` を出す 5 経路は、どれもサイドバーの共通の出口を通る。
  describe("sidebar.layout_changed (the common exit)", () => {
    type Seen = { event: string; layout?: { top: string[]; groups: Record<string, string[]>; ungrouped: string[] }; workspaceId?: string };
    const watch = (): Seen[] => {
      const seen: Seen[] = [];
      bus.subscribe((e) => seen.push({ event: e.event, ...(e.data as object) }));
      return seen;
    };
    /** `workspace.closed` の後に、閉じた workspace を含まない `sidebar.layout_changed` が届いている。 */
    const expectLeftLayout = (seen: Seen[], closedId: string): void => {
      const closedAt = seen.findIndex((e) => e.event === "workspace.closed" && e.workspaceId === closedId);
      expect(closedAt).toBeGreaterThanOrEqual(0);
      const layoutEvent = seen.slice(closedAt).find((e) => e.event === "sidebar.layout_changed");
      expect(layoutEvent).toBeDefined();
      expect(JSON.stringify(layoutEvent!.layout)).not.toContain(`w:${closedId}`);
    };

    it("closeWorkspace", async () => {
      const { workspace: w1 } = await service.createWorkspace("/a", "a");
      const { workspace: w2 } = await service.createWorkspace("/b", "b");
      const seen = watch();
      persist.touchCount = 0;
      await service.closeWorkspace(w1.id);
      expectLeftLayout(seen, w1.id);
      expect(service.snapshot().layout?.ungrouped).toEqual([`w:${w2.id}`]);
      expect(persist.touchCount).toBeGreaterThan(0);
    });

    it("closeTab (the last tab of the workspace)", async () => {
      const { workspace: w1, tab } = await service.createWorkspace("/a", "a");
      await service.createWorkspace("/b", "b");
      const seen = watch();
      await service.closeTab(tab.id);
      expectLeftLayout(seen, w1.id);
    });

    it("closePane (the last pane of the workspace)", async () => {
      const { workspace: w1, pane } = await service.createWorkspace("/a", "a");
      await service.createWorkspace("/b", "b");
      const seen = watch();
      await service.closePane(pane.id);
      expectLeftLayout(seen, w1.id);
    });

    it("moveToTab (the source workspace becomes empty)", async () => {
      const { workspace: w1, pane } = await service.createWorkspace("/a", "a");
      const { tab: t2 } = await service.createWorkspace("/a", "b");
      const seen = watch();
      service.moveToTab(pane.id, t2.id);
      expectLeftLayout(seen, w1.id);
    });

    it("moveToNewTab (the source workspace becomes empty)", async () => {
      const { workspace: w1, pane } = await service.createWorkspace("/a", "a");
      const { workspace: w2 } = await service.createWorkspace("/a", "b");
      const seen = watch();
      service.moveToNewTab(pane.id, w2.id);
      expectLeftLayout(seen, w1.id);
    });

    it("createWorkspace publishes the layout with the new workspace at the end", async () => {
      const { workspace: w1 } = await service.createWorkspace("/a", "a");
      const seen = watch();
      const { workspace: w2 } = await service.createWorkspace("/b", "b");
      expect(seen.find((e) => e.event === "sidebar.layout_changed")?.layout?.ungrouped).toEqual([`w:${w1.id}`, `w:${w2.id}`]);
    });

    it("group operations publish workspace.updated, then sidebar.layout_changed, then workspace.order_changed", async () => {
      const { workspace: w1 } = await service.createWorkspace("/a", "a");
      const { workspace: w2 } = await service.createWorkspace("/b", "b");
      const g1 = service.createGroup("g1", w2.id); // w2 を新しいグループへ（グループは「グループなし」の前に入る。平らな順は [w2, w1]）
      const seen = watch();
      persist.touchCount = 0;
      service.addToGroup(w1.id, g1.id);
      expect(seen.map((e) => e.event)).toEqual(["workspace.updated", "sidebar.layout_changed"]); // 平らな順は [w2, w1] のまま（order_changed は出ない）
      expect(persist.touchCount).toBeGreaterThan(0);
      seen.length = 0;
      service.removeFromGroup(w2.id); // w2 が「グループなし」の末尾へ出る → 平らな順が [w1, w2] になる
      expect(seen.map((e) => e.event)).toEqual(["workspace.updated", "sidebar.layout_changed", "workspace.order_changed"]);
      seen.length = 0;
      service.deleteGroup(g1.id); // w1 が「グループなし」の末尾へ出る → 平らな順が [w2, w1] になる
      expect(seen.map((e) => e.event)).toEqual(["group.deleted", "workspace.updated", "sidebar.layout_changed", "workspace.order_changed"]);
    });

    it("createGroup with a workspaceId puts that item into the new group", async () => {
      const { workspace: w1 } = await service.createWorkspace("/a", "a");
      const seen = watch();
      const group = service.createGroup("g", w1.id);
      expect(seen.map((e) => e.event)).toEqual(["group.created", "workspace.updated", "sidebar.layout_changed"]);
      expect(service.snapshot().layout).toEqual({ top: [`g:${group.id}`, "u"], groups: { [group.id]: [`w:${w1.id}`] }, ungrouped: [] });
      expect(service.getWorkspace(w1.id)?.groupId).toBe(group.id);
    });
  });

  it("deleteGroup publishes group.deleted, then workspace.updated for every member whose groupId is cleared", async () => {
    const { workspace: w1 } = await service.createWorkspace("/a", "a");
    const { workspace: w2 } = await service.createWorkspace("/b", "b");
    const group = service.createGroup("backend");
    service.addToGroup(w1.id, group.id);
    service.addToGroup(w2.id, group.id);
    const events: { event: string; groupId?: string; workspace?: { id: string; groupId: string | null } }[] = [];
    bus.subscribe((e) => events.push({ event: e.event, ...(e.data as { groupId?: string; workspace?: { id: string; groupId: string | null } }) }));

    service.deleteGroup(group.id);

    expect(events[0]).toEqual({ event: "group.deleted", groupId: group.id });
    const wsUpdated = events.filter((e) => e.event === "workspace.updated");
    expect(wsUpdated.map((e) => e.workspace?.id).sort()).toEqual([w1.id, w2.id].sort());
    for (const e of wsUpdated) expect(e.workspace?.groupId).toBeNull();
  });

  it("closeWorkspace(closeLinkedWorktrees=true) also closes every linked worktree sharing the same repoKey (herdr の close_group 相当)", async () => {
    const { workspace: main, pane: mainPane } = await service.createWorkspace("/repo", "main");
    const { workspace: wt, pane: wtPane } = await service.createWorkspace("/repo-wt", "wt");
    service.updateWorkspaceGit(main.id, { kind: "git", git: { branch: "main", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: false } });
    service.updateWorkspaceGit(wt.id, { kind: "git", git: { branch: "feature", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: true } });
    const [mainHost, wtHost] = [mainPane.id, wtPane.id].map((id) => terminals.get(id) as FakeTerminalHost); // dispose 前に控える
    const events: { event: string; workspaceId?: string }[] = [];
    bus.subscribe((e) => events.push({ event: e.event, ...(e.data as { workspaceId?: string }) }));

    await service.closeWorkspace(main.id, true);

    const closedIds = events.filter((e) => e.event === "workspace.closed").map((e) => e.workspaceId);
    expect(closedIds.sort()).toEqual([main.id, wt.id].sort());
    expect(mainHost!.disposed).toBe(true);
    expect(wtHost!.disposed).toBe(true);
  });

  it("closeWorkspace(closeLinkedWorktrees=true) closes only the target when it has no linked worktrees", async () => {
    const { workspace } = await service.createWorkspace("/plain", "plain");
    const events: { event: string; workspaceId?: string }[] = [];
    bus.subscribe((e) => events.push({ event: e.event, ...(e.data as { workspaceId?: string }) }));

    await service.closeWorkspace(workspace.id, true);

    expect(events.filter((e) => e.event === "workspace.closed").map((e) => e.workspaceId)).toEqual([workspace.id]);
  });

  it("closeWorkspace without closeLinkedWorktrees (既定 false) leaves the linked worktree open (回帰なし)", async () => {
    const { workspace: main } = await service.createWorkspace("/repo", "main");
    const { workspace: wt } = await service.createWorkspace("/repo-wt", "wt");
    service.updateWorkspaceGit(main.id, { kind: "git", git: { branch: "main", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: false } });
    service.updateWorkspaceGit(wt.id, { kind: "git", git: { branch: "feature", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: true } });

    await service.closeWorkspace(main.id);

    expect(service.snapshot().workspaces.map((w) => w.id)).toContain(wt.id);
  });
});

describe("SessionService — runtime updates", () => {
  let terminals: FakeTerminalManager;
  let bus: EventBus;
  let persist: FakePersistScheduler;
  let service: SessionService;

  beforeEach(() => {
    terminals = new FakeTerminalManager();
    bus = new EventBus();
    persist = new FakePersistScheduler();
    service = makeService(terminals, bus, persist);
  });

  it("allocateAgentInstanceId returns unique UUIDs and schedules a save (T8)", async () => {
    const a1 = service.allocateAgentInstanceId();
    const a2 = service.allocateAgentInstanceId();
    expect(a1).not.toBe(a2);
    expect(a1).toMatch(UUID_RE);
    expect(a2).toMatch(UUID_RE);
    expect(persist.touchCount).toBeGreaterThanOrEqual(2);
  });

  // 20260923-workspace-grouping。タスク点検の指摘：sameGit が repoKey/isLinkedWorktree を比較して
  // いなかったため、branch/ahead/behind が同じまま repoKey/isLinkedWorktree だけ変わるケース
  // （worktree 自動グループの判定の要）で更新が握りつぶされていた。
  it("updateWorkspaceGit emits workspace.updated when only repoKey changes (branch/ahead/behind unchanged)", async () => {
    const { workspace } = await service.createWorkspace("/repo", "repo");
    service.updateWorkspaceGit(workspace.id, { kind: "git", git: { branch: "main", ahead: 0, behind: 0, repoKey: null, isLinkedWorktree: false } });
    const events: string[] = [];
    bus.subscribe((e) => events.push(e.event));

    service.updateWorkspaceGit(workspace.id, { kind: "git", git: { branch: "main", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: false } });

    // 判定が付く（`w:<id>` → `r:`）ので、レイアウトも変わる。
    expect(events).toEqual(["workspace.updated", "sidebar.layout_changed"]);
    expect(service.snapshot().workspaces[0]!.git?.repoKey).toBe("/repo/.git");
  });

  it("updateWorkspaceGit emits workspace.updated when only isLinkedWorktree changes", async () => {
    const { workspace } = await service.createWorkspace("/repo-wt", "wt");
    service.updateWorkspaceGit(workspace.id, { kind: "git", git: { branch: "feature", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: false } });
    const events: string[] = [];
    bus.subscribe((e) => events.push(e.event));

    service.updateWorkspaceGit(workspace.id, { kind: "git", git: { branch: "feature", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: true } });

    expect(events).toEqual(["workspace.updated"]);
    expect(service.snapshot().workspaces[0]!.git?.isLinkedWorktree).toBe(true);
  });

  it("updateWorkspaceGit is a no-op when nothing (including repoKey/isLinkedWorktree) changes", async () => {
    const { workspace } = await service.createWorkspace("/repo", "repo");
    const git = { branch: "main", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: false };
    service.updateWorkspaceGit(workspace.id, { kind: "git", git: git });
    const events: string[] = [];
    bus.subscribe((e) => events.push(e.event));

    service.updateWorkspaceGit(workspace.id, { kind: "git", git: { ...git } });

    expect(events).toEqual([]);
  });

  // 20261004-group-worktree-items（T6）。判定の 3 つの結果を、共通の出口でレイアウトと所属に反映する。
  describe("judgments (git / unmanaged / unknown) go through the one model entry", () => {
    const judged = (repoKey: string, linked = false): GitJudgement => ({ kind: "git", git: { branch: "main", ahead: 0, behind: 0, repoKey, isLinkedWorktree: linked } });

    it("a repoKey change publishes workspace.updated once, then the layout, and schedules a save; applyWorkspaceIdentity takes the same path", async () => {
      const { workspace } = await service.createWorkspace("/repo", "repo");
      const events: { event: string; data: unknown }[] = [];
      bus.subscribe((e) => events.push(e));
      persist.touchCount = 0;
      service.applyWorkspaceIdentity(workspace.id, "/repo", judged("/repo/.git"), null);
      expect(events.map((e) => e.event)).toEqual(["workspace.updated", "sidebar.layout_changed"]);
      expect(events[1]!.data).toEqual({ layout: { top: ["u"], groups: {}, ungrouped: ["r:/repo/.git"] } });
      expect(persist.touchCount).toBe(1);
    });

    it("a group-changing judgment publishes the one workspace.updated that carries both the git and the new groupId", async () => {
      const a = (await service.createWorkspace("/a", "a")).workspace;
      const b = (await service.createWorkspace("/b", "b")).workspace;
      service.updateWorkspaceGit(a.id, judged("/repo/.git"));
      const g = service.createGroup("g", a.id);
      const events: { event: string; data: unknown }[] = [];
      bus.subscribe((e) => events.push(e));
      service.updateWorkspaceGit(b.id, judged("/repo/.git", true));
      const updates = events.filter((e) => e.event === "workspace.updated");
      expect(updates).toHaveLength(1);
      expect((updates[0]!.data as { workspace: { id: string; groupId: string | null; git: unknown } }).workspace).toMatchObject({ id: b.id, groupId: g.id, git: { repoKey: "/repo/.git" } });
    });

    it("unmanaged on a judged workspace gives the w:<id> back (null git); unknown changes nothing and publishes nothing", async () => {
      const { workspace } = await service.createWorkspace("/repo", "repo");
      service.updateWorkspaceGit(workspace.id, judged("/repo/.git"));
      const events: string[] = [];
      bus.subscribe((e) => events.push(e.event));
      persist.touchCount = 0;
      service.updateWorkspaceGit(workspace.id, { kind: "unknown" });
      expect(events).toEqual([]);
      expect(persist.touchCount).toBe(0);
      expect(service.getWorkspace(workspace.id)?.git?.repoKey).toBe("/repo/.git");
      service.updateWorkspaceGit(workspace.id, { kind: "unmanaged" });
      expect(events).toEqual(["workspace.updated", "sidebar.layout_changed"]);
      expect(service.getWorkspace(workspace.id)?.git).toBeNull();
      expect(service.snapshot().layout).toEqual({ top: ["u"], groups: {}, ungrouped: [`w:${workspace.id}`] });
    });

    it("a worktreeKey-only change (same repoKey, same isLinkedWorktree) still goes through the layout exit: the next workspace of the old folder becomes the representative", async () => {
      const wt = (key: string): GitJudgement => ({ kind: "git", git: { branch: "main", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: true, worktreeKey: key } });
      const x = (await service.createWorkspace("/x", "x")).workspace;
      const y = (await service.createWorkspace("/y", "y")).workspace;
      const z = (await service.createWorkspace("/z", "z")).workspace;
      service.updateWorkspaceGit(x.id, wt("/repo/.git/worktrees/x"));
      service.updateWorkspaceGit(y.id, wt("/repo/.git/worktrees/y"));
      service.updateWorkspaceGit(z.id, wt("/repo/.git/worktrees/y")); // y と同じフォルダ。代表でないので通常の項目
      expect(service.snapshot().layout?.ungrouped).toEqual(["r:/repo/.git", `w:${z.id}`]);
      const events: string[] = [];
      bus.subscribe((e) => events.push(e.event));
      persist.touchCount = 0;
      service.updateWorkspaceGit(y.id, wt("/repo/.git/worktrees/y2"));
      expect(events).toEqual(["workspace.updated", "workspace.updated", "sidebar.layout_changed"]); // y と、代表になった z（旗が変わる）
      expect(service.snapshot().layout?.ungrouped).toEqual(["r:/repo/.git"]);
      expect(persist.touchCount).toBe(1);
    });

    it("a branch-only change publishes workspace.updated but neither the layout nor a save", async () => {
      const { workspace } = await service.createWorkspace("/repo", "repo");
      service.updateWorkspaceGit(workspace.id, judged("/repo/.git"));
      const events: string[] = [];
      bus.subscribe((e) => events.push(e.event));
      persist.touchCount = 0;
      service.updateWorkspaceGit(workspace.id, { kind: "git", git: { branch: "dev", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: false } });
      expect(events).toEqual(["workspace.updated"]);
      expect(persist.touchCount).toBe(0);
    });

    it("isLinkedWorktree changing publishes the new order and schedules a save", async () => {
      const a = (await service.createWorkspace("/a", "a")).workspace;
      const b = (await service.createWorkspace("/b", "b")).workspace;
      service.updateWorkspaceGit(a.id, judged("/repo/.git", true));
      service.updateWorkspaceGit(b.id, judged("/repo/.git", true));
      const events: { event: string; data: unknown }[] = [];
      bus.subscribe((e) => events.push(e));
      persist.touchCount = 0;
      service.updateWorkspaceGit(b.id, judged("/repo/.git", false));
      expect(events.map((e) => e.event)).toEqual(["workspace.updated", "workspace.order_changed"]);
      expect(events[1]!.data).toEqual({ workspaceIds: [b.id, a.id] });
      expect(persist.touchCount).toBe(1);
    });
  });

  it("resizePane updates the model, resizes the pty, and emits pane.size_changed", async () => {
    const { pane } = await service.createWorkspace("/home/u", "api");
    const events: { event: string; data: unknown }[] = [];
    bus.subscribe((e) => events.push(e));
    service.resizePane(pane.id, 100, 30);
    expect(events).toEqual([{ event: "pane.size_changed", data: { paneId: pane.id, cols: 100, rows: 30 } }]);
    expect((terminals.get(pane.id) as FakeTerminalHost).resized).toEqual({ cols: 100, rows: 30 });
  });

  it("resizePane is a no-op when the size does not change", async () => {
    const { pane } = await service.createWorkspace("/home/u", "api");
    const events: string[] = [];
    bus.subscribe((e) => events.push(e.event));
    service.resizePane(pane.id, pane.cols, pane.rows);
    expect(events).toEqual([]);
  });

  it("updatePaneRuntime emits pane.agent_status_changed when the agent changes", async () => {
    const { pane } = await service.createWorkspace("/home/u", "api");
    const events: { event: string; data: unknown }[] = [];
    bus.subscribe((e) => events.push(e));
    const agent: AgentInfo = {
      instanceId: "a1",
      kind: "claude",
      label: "Claude Code",
      state: "working",
      completionSeq: 0,
      serverSeenSeq: 0,
      verified: true,
      since: Date.now(),
    };
    service.updatePaneRuntime(pane.id, { agent });
    expect(events.map((e) => e.event)).toEqual(["pane.agent_status_changed"]);
  });

  it("updatePaneRuntime は agent の中身が実際に変わっていなければ pane.agent_status_changed を出さない\
（review 指摘。should。busy/title/cwd と同じ「実際に変わったときだけ発行する」規約に揃えた。AgentTracker が\
公開されない内部フラグ（visibleIdle 等）だけの変化で新しい AgentInfo オブジェクトを返すことがあるため、\
オブジェクトの参照ではなくフィールドで比較する）", async () => {
    const { pane } = await service.createWorkspace("/home/u", "api");
    const agent: AgentInfo = {
      instanceId: "a1",
      kind: "claude",
      label: "Claude Code",
      state: "working",
      completionSeq: 0,
      serverSeenSeq: 0,
      verified: true,
      since: 12345,
    };
    service.updatePaneRuntime(pane.id, { agent });

    const events: string[] = [];
    bus.subscribe((e) => events.push(e.event));
    // 内容は全フィールド同一だが、別オブジェクト（AgentTracker.update が毎回新しいオブジェクトを返すのと同じ形）。
    service.updatePaneRuntime(pane.id, { agent: { ...agent } });
    expect(events).toEqual([]);

    // busy 等と同時に渡っても、agent の中身が同じなら agent_status_changed だけは出ない。
    service.updatePaneRuntime(pane.id, { agent: { ...agent }, busy: true });
    expect(events).toEqual(["pane.updated"]); // busy が変わった分だけ

    // 実際にフィールドが変われば、通常どおり発行される。
    service.updatePaneRuntime(pane.id, { agent: { ...agent, state: "idle", completionSeq: 1 } });
    expect(events).toEqual(["pane.updated", "pane.agent_status_changed"]);
  });

  describe("setAgentSubagents（20261004-subagent-display）", () => {
    const agentOf = (over: Partial<AgentInfo> = {}): AgentInfo => ({
      instanceId: "a1",
      kind: "claude",
      label: "Claude Code",
      state: "working",
      completionSeq: 0,
      serverSeenSeq: 0,
      verified: true,
      since: 12345,
      ...over,
    });
    const subs = (...ids: string[]) => ({ count: ids.length, items: ids.map((id) => ({ id, startedAt: 1 })) });

    it("エージェントが検出されていなければ何もせず false（イベントも出さない）", async () => {
      const { pane } = await service.createWorkspace("/home/u", "api");
      const events: string[] = [];
      bus.subscribe((e) => events.push(e.event));
      expect(service.setAgentSubagents(pane.id, subs("s1"))).toBe(false);
      expect(service.setAgentSubagents("no-such-pane", subs("s1"))).toBe(false);
      expect(events).toEqual([]);
      expect(service.getPane(pane.id)?.agent).toBeNull();
    });

    it("検出されていれば差し替えて pane.agent_status_changed を配り true。同じ参照ならもう配らない。undefined で外す", async () => {
      const { pane } = await service.createWorkspace("/home/u", "api");
      service.updatePaneRuntime(pane.id, { agent: agentOf() });
      const events: { event: string; data: { agent: AgentInfo | null } }[] = [];
      bus.subscribe((e) => e.event === "pane.agent_status_changed" && events.push(e as never));
      const value = subs("s1", "s2");
      expect(service.setAgentSubagents(pane.id, value)).toBe(true);
      expect(events).toHaveLength(1);
      expect(events[0]?.data.agent?.subagents).toBe(value);
      expect(service.getPane(pane.id)?.agent?.subagents).toBe(value);
      expect(service.setAgentSubagents(pane.id, value)).toBe(true);
      expect(events).toHaveLength(1);
      expect(service.setAgentSubagents(pane.id, undefined)).toBe(true);
      expect(events).toHaveLength(2);
      expect(service.getPane(pane.id)?.agent).not.toHaveProperty("subagents");
    });

    it("周期の更新（AgentTracker が毎回 subagents の無い新しい AgentInfo を渡す）で落ちず、同じ参照のまま引き継ぐ。状態が変わっても保つ", async () => {
      const { pane } = await service.createWorkspace("/home/u", "api");
      service.updatePaneRuntime(pane.id, { agent: agentOf() });
      const value = subs("s1");
      service.setAgentSubagents(pane.id, value);
      const events: string[] = [];
      bus.subscribe((e) => events.push(e.event));
      service.updatePaneRuntime(pane.id, { agent: agentOf() });
      expect(events).toEqual([]); // 何も変わらない
      expect(service.getPane(pane.id)?.agent?.subagents).toBe(value);
      service.updatePaneRuntime(pane.id, { agent: agentOf({ state: "idle", completionSeq: 1 }) });
      expect(events).toEqual(["pane.agent_status_changed"]);
      expect(service.getPane(pane.id)?.agent?.subagents).toBe(value);
    });

    it("renameAgent で落ちない（名前を付けても外しても subagents は残る）", async () => {
      const { pane } = await service.createWorkspace("/home/u", "api");
      service.updatePaneRuntime(pane.id, { agent: agentOf() });
      const value = subs("s1");
      service.setAgentSubagents(pane.id, value);
      service.renameAgent(pane.id, "a1", "worker");
      expect(service.getPane(pane.id)?.agent?.subagents).toBe(value);
      service.renameAgent(pane.id, "a1", null);
      expect(service.getPane(pane.id)?.agent?.subagents).toBe(value);
    });

    it("エージェントの入れ替わり（別の instanceId）・終了（null）で消え、新しい検出は subagents を持たない", async () => {
      const { pane } = await service.createWorkspace("/home/u", "api");
      service.updatePaneRuntime(pane.id, { agent: agentOf() });
      service.setAgentSubagents(pane.id, subs("s1"));
      service.updatePaneRuntime(pane.id, { agent: agentOf({ instanceId: "a2" }) });
      expect(service.getPane(pane.id)?.agent).not.toHaveProperty("subagents");
      service.setAgentSubagents(pane.id, subs("s2"));
      service.updatePaneRuntime(pane.id, { agent: null });
      expect(service.getPane(pane.id)?.agent).toBeNull();
      service.updatePaneRuntime(pane.id, { agent: agentOf({ instanceId: "a2" }) }); // 同じ instanceId でも、一度消えた後は引き継がない
      expect(service.getPane(pane.id)?.agent).not.toHaveProperty("subagents");
    });

    it("保存しない（session.json の保存を予約しない）", async () => {
      const { pane } = await service.createWorkspace("/home/u", "api");
      service.updatePaneRuntime(pane.id, { agent: agentOf() });
      persist.touchCount = 0;
      service.setAgentSubagents(pane.id, subs("s1"));
      expect(persist.touchCount).toBe(0);
    });
  });

  it("updatePaneRuntime schedules a save only when cwd changes", async () => {
    const { pane } = await service.createWorkspace("/home/u", "api");
    persist.touchCount = 0;
    service.updatePaneRuntime(pane.id, { busy: true });
    expect(persist.touchCount).toBe(0);
    service.updatePaneRuntime(pane.id, { cwd: "/new/dir" });
    expect(persist.touchCount).toBe(1);
  });

  it("focusPane emits session.focus_changed", async () => {
    const { pane } = await service.createWorkspace("/home/u", "api");
    const { pane: pane2 } = await service.createWorkspace("/home/u", "second");
    const events: { event: string; data: unknown }[] = [];
    bus.subscribe((e) => events.push(e));
    service.focusPane(pane.id);
    expect(events).toEqual([{ event: "session.focus_changed", data: { focus: expect.objectContaining({ paneId: pane.id }) } }]);
    void pane2;
  });
});

describe("SessionService — startup and restore", () => {
  it("ensureNotEmpty creates a workspace only when the model is empty", async () => {
    const terminals = new FakeTerminalManager();
    const bus = new EventBus();
    const persist = new FakePersistScheduler();
    const service = makeService(terminals, bus, persist);
    await service.ensureNotEmpty();
    expect(service.snapshot().workspaces.length).toBe(1);
    await service.ensureNotEmpty(); // 既にあるので何もしない
    expect(service.snapshot().workspaces.length).toBe(1);
  });

  it("restore recreates workspaces/tabs/panes and marks a failed shell without throwing", async () => {
    const terminals = new FakeTerminalManager();
    const bus = new EventBus();
    const persist = new FakePersistScheduler();
    const service = makeService(terminals, bus, persist);

    const data: SessionFileData = {
      schema: 1,
      savedAt: "2026-09-18T00:00:00Z",
      groups: [],
      workspaces: [
        {
          id: "w1",
          label: "api",
          cwd: "/home/u/api",
          activeTabId: "t1",
          tabs: [
            {
              id: "t1",
              label: "agents",
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
              panes: [
                { id: "p1", label: null, cwd: "/home/u/api", shell: "/bin/bash" },
                { id: "p2", label: null, cwd: "/home/u/api", shell: "/bin/bash" },
              ],
            },
          ],
        },
      ],
      focus: { workspaceId: "w1", tabId: "t1", paneId: "p1" },
    };

    terminals.nextSpawnFailure = 1; // p1 の起動を失敗させる（p2 は成功する）
    await service.restore(data);

    const snap = service.snapshot();
    expect(snap.workspaces.map((w) => w.id)).toEqual(["w1"]);
    const p1 = snap.panes.find((p) => p.id === "p1")!;
    const p2 = snap.panes.find((p) => p.id === "p2")!;
    expect(p1.status).toBe("failed");
    expect(p1.failure).toBeTruthy();
    expect(p2.status).toBe("running");
    expect(snap.focus).toEqual({ workspaceId: "w1", tabId: "t1", paneId: "p1" });

    // 復元後の新規採番は UUID で、復元した id とは重ならない。
    const { workspace } = await service.createWorkspace("/home/u", "new");
    expect(workspace.id).toMatch(UUID_RE);
    expect(workspace.id).not.toBe("w1");
  });

  // 20260923-workspace-grouping。
  it("restore rebuilds manual groups and each workspace's groupId, and new group ids are UUIDs", async () => {
    const terminals = new FakeTerminalManager();
    const bus = new EventBus();
    const persist = new FakePersistScheduler();
    const service = makeService(terminals, bus, persist);

    const data: SessionFileData = {
      schema: 1,
      savedAt: "2026-09-18T00:00:00Z",
      groups: [
        { id: "g1", label: "backend", collapsed: true },
        { id: "g2", label: "frontend", collapsed: false },
      ],
      workspaces: [
        {
          id: "w1",
          label: "api",
          cwd: "/home/u/api",
          activeTabId: "t1",
          groupId: "g1",
          tabs: [
            {
              id: "t1",
              label: "agents",
              focusedPaneId: "p1",
              zoomedPaneId: null,
              layout: { type: "pane", paneId: "p1" },
              panes: [{ id: "p1", label: null, cwd: "/home/u/api", shell: "/bin/bash" }],
            },
          ],
        },
      ],
      focus: { workspaceId: "w1", tabId: "t1", paneId: "p1" },
    };

    await service.restore(data);

    const snap = service.snapshot();
    expect(snap.groups).toEqual([
      { id: "g1", label: "backend", collapsed: true },
      { id: "g2", label: "frontend", collapsed: false },
    ]);
    expect(snap.workspaces[0]!.groupId).toBe("g1");
    const created = service.createGroup("ops");
    expect(created.id).toMatch(UUID_RE); // 復元した g1・g2 とは別の UUID
  });

  // 以前の版の保存には groups・groupId が無い——復元しても空のまま（`autoLabel` と同じ後方互換）。
  it("restoring a legacy file with no groups/groupId leaves groups empty and workspace.groupId null", async () => {
    const terminals = new FakeTerminalManager();
    const bus = new EventBus();
    const persist = new FakePersistScheduler();
    const service = makeService(terminals, bus, persist);

    const data: SessionFileData = {
      schema: 1,
      savedAt: "2026-09-18T00:00:00Z",
      groups: [],
      workspaces: [
        {
          id: "w1",
          label: "api",
          cwd: "/home/u/api",
          activeTabId: "t1",
          tabs: [
            {
              id: "t1",
              label: "agents",
              focusedPaneId: "p1",
              zoomedPaneId: null,
              layout: { type: "pane", paneId: "p1" },
              panes: [{ id: "p1", label: null, cwd: "/home/u/api", shell: "/bin/bash" }],
            },
          ],
        },
      ],
      focus: { workspaceId: "w1", tabId: "t1", paneId: "p1" },
    };

    await service.restore(data);

    const snap = service.snapshot();
    expect(snap.groups).toEqual([]);
    expect(snap.workspaces[0]!.groupId).toBeNull();
  });
});

// 20260921-new-terminal-cwd：新しく開く場所の方針（herdr の `terminal.new_cwd`）。場所の規則そのものは `newCwd.test.ts`。
// ここで見るのは、3 つの作成が決めた場所で**起動し、記録（Pane.cwd）もその場所にし**、`cwdFallback` を返し、`cwd` が勝つこと。
describe("SessionService — 新しく開く場所（newCwd）", () => {
  /** 使える場所と、pane ごとの「いまの場所」を持つ偽の deps。 */
  function makeNewCwdService(live: Record<string, string> = {}, usable = ["/home/u", "/home/u/api", "/srv/live", "/tmp/picked", "/start"]) {
    const terminals = new FakeTerminalManager();
    const model = new SessionModel();
    const set = new Set(usable);
    const newCwdDeps: NewCwdDeps = {
      liveCwd: async (id) => live[id] ?? null,
      hintCwd: () => null,
      recordedCwd: (id) => model.getPane(id)?.cwd,
      home: () => "/home/u",
      currentDir: "/start",
      isUsableDir: async (path) => set.has(path),
    };
    const service = new SessionService({
      model,
      terminals,
      bus: new EventBus(),
      persist: new FakePersistScheduler(),
      serverVersion: "0.1.0-test",
      host: HOST_INFO,
      scrollbackLines: 1000,
      spawnGraceMs: 5,
      defaultCwd: "/start",
      logger: new MemoryLogger(),
      newCwdDeps,
      workspaceLabelDeps: fakeLabelDeps(["/home/u/api"]), // /home/u/api は git のリポジトリ（20260921-workspace-auto-label）
    });
    return { service, terminals, model, live };
  }

  it("引き継ぐ：新しい workspace は、元の pane のいまの場所で起動し、workspace と pane の記録もそこになる（AC1）", async () => {
    const h = makeNewCwdService();
    const { pane } = await h.service.createWorkspace("/home/u/api", "api");
    h.live[pane.id] = "/srv/live";
    const r = await h.service.createWorkspace(undefined, undefined, { policy: "follow", sourcePaneId: pane.id });
    expect(h.terminals.createOptions.at(-1)!.cwd).toBe("/srv/live");
    expect(r.workspace.cwd).toBe("/srv/live");
    expect(r.pane.cwd).toBe("/srv/live");
    expect(r.cwdFallback).toBeUndefined();
  });

  // 20260921-workspace-auto-label：自動の名前は、方針で決めた場所（`cd` した先・代わりの場所）から付く。
  it("引き継ぐで開いた新しい workspace の名前は、元の pane のいまの場所の名前。代わりの場所に回ったらその場所の名前", async () => {
    const h = makeNewCwdService();
    const { pane } = await h.service.createWorkspace("/home/u", "home");
    h.live[pane.id] = "/home/u/api";
    const followed = await h.service.createWorkspace(undefined, undefined, { policy: "follow", sourcePaneId: pane.id });
    expect(followed.workspace).toMatchObject({ label: "api", autoLabel: true });
    const fellBack = await h.service.createWorkspace(undefined, undefined, { policy: "path", path: "/nope" });
    expect(fellBack.workspace).toMatchObject({ cwd: "/start", label: "start", autoLabel: true });
  });

  it("引き継ぐ：新しい tab は元の pane のいまの場所で起動し、pane の記録もそこ。workspace の場所は変えない（AC2）", async () => {
    const h = makeNewCwdService();
    const { workspace, pane } = await h.service.createWorkspace("/home/u/api", "api");
    h.live[pane.id] = "/srv/live";
    const r = await h.service.createTab(workspace.id, undefined, { policy: "follow", sourcePaneId: pane.id });
    expect(h.terminals.createOptions.at(-1)!.cwd).toBe("/srv/live");
    expect(r.pane.cwd, "記録も起動と同じ場所").toBe("/srv/live");
    expect(h.model.getWorkspace(workspace.id)!.cwd, "Workspace.cwd は書き換えない（git の情報と worktree が使う）").toBe("/home/u/api");
  });

  it("引き継ぐ：分割は分割する pane のいまの場所で起動し、記録もそこ（AC3）", async () => {
    const h = makeNewCwdService();
    const { workspace, pane } = await h.service.createWorkspace("/home/u/api", "api");
    h.live[pane.id] = "/srv/live";
    const r = await h.service.splitPane(pane.id, "right", undefined, { policy: "follow" });
    expect(h.terminals.createOptions.at(-1)!.cwd).toBe("/srv/live");
    expect(r.pane.cwd).toBe("/srv/live");
    expect(h.model.getWorkspace(workspace.id)!.cwd, "Workspace.cwd は書き換えない").toBe("/home/u/api");
  });

  it("ホーム・起動した場所・指定した場所で起動する（AC6〜AC8）", async () => {
    const h = makeNewCwdService();
    const { workspace, pane } = await h.service.createWorkspace("/home/u/api", "api");
    await h.service.createTab(workspace.id, undefined, { policy: "home" });
    await h.service.splitPane(pane.id, "down", undefined, { policy: "current" });
    await h.service.createWorkspace(undefined, undefined, { policy: "path", path: "/tmp/picked" });
    expect(h.terminals.createOptions.slice(-3).map((o) => o.cwd)).toEqual(["/home/u", "/start", "/tmp/picked"]);
  });

  it("指定した場所が使えなければ以前と同じ場所で起動し、cwdFallback を返す（AC9）", async () => {
    const h = makeNewCwdService();
    const { workspace, pane } = await h.service.createWorkspace("/home/u/api", "api");
    const tab = await h.service.createTab(workspace.id, undefined, { policy: "path", path: "/nope" });
    expect(tab.pane.cwd, "tab は workspace の場所").toBe("/home/u/api");
    expect(tab.cwdFallback).toBe(true);
    const split = await h.service.splitPane(pane.id, "right", undefined, { policy: "path", path: "/nope" });
    expect(split.pane.cwd, "分割は元の pane の記録").toBe("/home/u/api");
    expect(split.cwdFallback).toBe(true);
    const created = await h.service.createWorkspace(undefined, undefined, { policy: "path", path: "/nope" });
    expect(h.terminals.createOptions.at(-1)!.cwd, "workspace はサーバを起動した場所").toBe("/start");
    expect(created.workspace.cwd).toBe("/start");
    expect(created.cwdFallback).toBe(true);
  });

  it("引き継ぐで代わりへ回っても cwdFallback は返さない（知らせない。AC5）", async () => {
    const h = makeNewCwdService();
    const { workspace } = await h.service.createWorkspace("/home/u/api", "api");
    const r = await h.service.createTab(workspace.id, undefined, { policy: "follow" }); // 元の pane が無い
    expect(r.pane.cwd).toBe("/home/u/api");
    expect(r.cwdFallback).toBeUndefined();
  });

  // **worktree を開く経路**（AC11・design D5）。明示した場所が方針に勝ち、代わりへも回さない。
  it("明示した cwd は newCwd に勝ち、検証も代わりもしない", async () => {
    const h = makeNewCwdService();
    const r = await h.service.createWorkspace("/repo/.sodashitsu/worktrees/feat", "feat", { policy: "home" });
    expect(h.terminals.createOptions.at(-1)!.cwd).toBe("/repo/.sodashitsu/worktrees/feat"); // 偽の isUsableDir では使えない場所でも
    expect(r.workspace.cwd).toBe("/repo/.sodashitsu/worktrees/feat");
    expect(r.cwdFallback).toBeUndefined();
  });

  // 本番の `SessionService` は必ず deps を持つので、`newCwd` を載せないクライアント（テストのクライアント・古い web）はこの組（design D5）。
  it("newCwdDeps があっても、要求に newCwd が無ければ今までどおり", async () => {
    const h = makeNewCwdService();
    const { workspace, pane } = await h.service.createWorkspace("/home/u/api", "api");
    h.live[pane.id] = "/srv/live"; // 読み直せば別の場所になる状態でも見ない
    const tab = await h.service.createTab(workspace.id, undefined);
    const split = await h.service.splitPane(pane.id, "right", undefined);
    const created = await h.service.createWorkspace(undefined, undefined);
    expect(h.terminals.createOptions.slice(-3).map((o) => o.cwd)).toEqual(["/home/u/api", "/home/u/api", "/start"]);
    expect([tab.cwdFallback, split.cwdFallback, created.cwdFallback]).toEqual([undefined, undefined, undefined]);
  });

  it("newCwdDeps が無ければ newCwd を見ない（今までどおり）", async () => {
    const terminals = new FakeTerminalManager();
    const service = makeService(terminals, new EventBus(), new FakePersistScheduler());
    const { workspace } = await service.createWorkspace(undefined, undefined, { policy: "home" });
    expect(terminals.createOptions.at(-1)!.cwd, "defaultCwd").toBe("/home/u");
    await service.createTab(workspace.id, undefined, { policy: "path", path: "/tmp/picked" });
    expect(terminals.createOptions.at(-1)!.cwd, "workspace の場所").toBe("/home/u");
  });

  // 方針を決める間（await の間）に分割元が閉じられたら、シェルを起動する前に失敗し、孤児の PTY を残さない。
  it("方針を決める間に分割元が閉じられたら、分割のシェルを起動せずに失敗する", async () => {
    const h = makeNewCwdService();
    const { pane } = await h.service.createWorkspace("/home/u/api", "api");
    const spawnsBefore = h.terminals.createOptions.length;
    const splitting = h.service.splitPane(pane.id, "right", undefined, { policy: "follow" });
    const closing = h.service.closePane(pane.id); // 唯一の pane なので、D24 で代わりの workspace が自動で作られる（その PTY は正当）
    await expect(splitting).rejects.toThrow();
    await closing;
    expect(h.terminals.createOptions.length, "起動したのは D24 の代わりの workspace だけ").toBe(spawnsBefore + 1);
    // **モデルに無い pane の PTY が生きたまま残っていない**（分割で起動した PTY は破棄されている）。
    const orphans = [...h.terminals.hosts.entries()].filter(([id, host]) => !(host as FakeTerminalHost).disposed && !h.model.getPane(id));
    expect(orphans.map(([id]) => id)).toEqual([]);
  });
});

// 20260921-workspace-auto-label：名前を渡さない作成は、開く場所から自動の名前を付ける（design D4b・D10）。
describe("SessionService — workspace の自動の名前", () => {
  function setup(gitRoots: string[] = ["/r"]) {
    const terminals = new FakeTerminalManager();
    const bus = new EventBus();
    const created: string[] = [];
    bus.subscribe((e) => {
      if (e.event === "workspace.created") created.push(e.data.workspace.label);
    });
    const service = makeService(terminals, bus, new FakePersistScheduler(), undefined, fakeLabelDeps(gitRoots));
    return { terminals, bus, created, service };
  }

  it("名前を渡さないと、git の中なら根の名前・外ならフォルダ名・ホームなら ~ で、最初から付いている（AC1・AC3・AC9）", async () => {
    const h = setup();
    const inRepo = await h.service.createWorkspace("/r/src/deep", undefined);
    const outside = await h.service.createWorkspace("/srv/app", undefined);
    const home = await h.service.createWorkspace("/home/u", undefined);
    expect([inRepo.workspace.label, outside.workspace.label, home.workspace.label]).toEqual(["r", "app", "~"]);
    expect([inRepo.workspace.autoLabel, outside.workspace.autoLabel, home.workspace.autoLabel]).toEqual([true, true, true]);
    expect(h.created, "workspace.created にも最初から自動の名前（「1」を経ない）").toEqual(["r", "app", "~"]);
  });

  it("名前を渡せば付けた名前。空白だけの名前は自動の名前（design D10）", async () => {
    const h = setup();
    const named = await h.service.createWorkspace("/r/src", "feat/x");
    const blank = await h.service.createWorkspace("/r/src", "   ");
    expect(named.workspace).toMatchObject({ label: "feat/x", autoLabel: false });
    expect(blank.workspace).toMatchObject({ label: "r", autoLabel: true });
  });

  it("起動時の最初の workspace と、最後を閉じた後の作り直しも自動の名前（AC4）", async () => {
    const terminals = new FakeTerminalManager();
    const service = new SessionService({
      model: new SessionModel(),
      terminals,
      bus: new EventBus(),
      persist: new FakePersistScheduler(),
      serverVersion: "0.1.0-test",
      host: HOST_INFO,
      scrollbackLines: 1000,
      spawnGraceMs: 5,
      defaultCwd: "/r/packages/e2e",
      logger: new MemoryLogger(),
      workspaceLabelDeps: fakeLabelDeps(["/r"]),
    });
    await service.ensureNotEmpty();
    const [first] = service.snapshot().workspaces;
    expect(first).toMatchObject({ label: "r", autoLabel: true });
    await service.closeWorkspace(first!.id); // D24：最後を閉じると作り直す
    const [again] = service.snapshot().workspaces;
    expect(again!.id).not.toBe(first!.id);
    expect(again).toMatchObject({ label: "r", autoLabel: true });
  });

  // 起動の成功から commit までの間に await を挟まない（decisions D1）——名前を決めている間は、シェルを起動せず何も知らせない。
  it("名前を決めている間は起動も知らせもせず、決まってから起動する", async () => {
    const h = setup();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const base = fakeLabelDeps(["/r"]);
    const slow: WorkspaceLabelDeps = { ...base, timeoutMs: 60_000, stat: async (p) => (await gate, base.stat(p)) };
    const service = makeService(h.terminals, h.bus, new FakePersistScheduler(), undefined, slow);
    const creating = service.createWorkspace("/r/src", undefined);
    await new Promise((r) => setTimeout(r, 20));
    expect(h.terminals.createOptions, "名前が決まる前にシェルを起動しない").toEqual([]);
    expect(h.created).toEqual([]);
    release();
    const { workspace } = await creating;
    expect(h.terminals.createOptions).toHaveLength(1);
    expect(workspace.label).toBe("r");
  });

  describe("名前変更（design D5・D9・D10）", () => {
    it("付けた名前は autoLabel: false、null と空白だけは開いた場所から決め直した自動の名前に戻る（AC6）", async () => {
      const h = setup();
      const updated: { label: string; autoLabel: boolean }[] = [];
      h.bus.subscribe((e) => {
        if (e.event === "workspace.updated") updated.push({ label: e.data.workspace.label, autoLabel: e.data.workspace.autoLabel });
      });
      const { workspace } = await h.service.createWorkspace("/r/src", undefined);
      await h.service.renameWorkspace(workspace.id, "mine");
      await h.service.renameWorkspace(workspace.id, null);
      await h.service.renameWorkspace(workspace.id, "again");
      await h.service.renameWorkspace(workspace.id, "  ");
      expect(updated).toEqual([
        { label: "mine", autoLabel: false },
        { label: "r", autoLabel: true },
        { label: "again", autoLabel: false },
        { label: "r", autoLabel: true },
      ]);
    });

    it("名前変更は、名前を入れたときに保存を予約する（null で戻すときも）", async () => {
      const persist = new FakePersistScheduler();
      const service = makeService(new FakeTerminalManager(), new EventBus(), persist, undefined, fakeLabelDeps(["/r"]));
      const { workspace } = await service.createWorkspace("/r/src", "mine");
      const before = persist.touchCount;
      await service.renameWorkspace(workspace.id, null);
      expect(persist.touchCount - before).toBe(1);
    });

    it("要求の時点で無い workspace は not_found で拒否する", async () => {
      const h = setup();
      await expect(h.service.renameWorkspace("w999", "x")).rejects.toThrow(/w999/);
      await expect(h.service.renameWorkspace("w999", null)).rejects.toThrow(/w999/);
    });

    // 自動の名前を決めている間に付けた名前が来たら、後から来た付けた名前が勝つ（古い自動の名前で上書きしない）。
    /** 名前を決める stat を `release` まで保留する service（作成は名前を渡して deps を通らないようにする）。 */
    function gated() {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((r) => (release = r));
      const base = fakeLabelDeps(["/r"]);
      const slow: WorkspaceLabelDeps = { ...base, timeoutMs: 60_000, stat: async (path) => (await gate, base.stat(path)) };
      const terminals = new FakeTerminalManager();
      const bus = new EventBus();
      const persist = new FakePersistScheduler();
      const service = makeService(terminals, bus, persist, undefined, slow);
      return { service, bus, persist, release: () => release() };
    }

    it("自動の名前に戻す待ちの間に名前を付けたら、付けた名前が勝つ（捨てた結果では保存を予約しない）", async () => {
      const h = gated();
      const { workspace } = await h.service.createWorkspace("/r/src", "first");
      const touches = h.persist.touchCount;
      const toAuto = h.service.renameWorkspace(workspace.id, null);
      await h.service.renameWorkspace(workspace.id, "later");
      h.release();
      await toAuto;
      expect(h.service.snapshot().workspaces[0]).toMatchObject({ label: "later", autoLabel: false });
      expect(h.persist.touchCount - touches, "付けた名前の 1 回だけ").toBe(1);
    });

    it("自動の名前に戻す待ちの間に workspace が閉じられたら、何もしない（投げない）", async () => {
      const h = gated();
      await h.service.createWorkspace("/srv/keep", "keep"); // 閉じても D24 の作り直しが走らないように 2 つにする
      const { workspace } = await h.service.createWorkspace("/r/src", "first");
      const events: string[] = [];
      h.bus.subscribe((e) => events.push(e.event));
      const toAuto = h.service.renameWorkspace(workspace.id, null);
      await h.service.closeWorkspace(workspace.id);
      h.release();
      await expect(toAuto).resolves.toBeUndefined();
      expect(events.filter((e) => e === "workspace.updated")).toEqual([]);
    });
  });

  describe("復元（design D6・D10）", () => {
    function workspaceData(id: string, label: string, cwd: string, autoLabel?: boolean) {
      return {
        id,
        label,
        ...(autoLabel !== undefined ? { autoLabel } : {}),
        cwd,
        activeTabId: `t-${id}`,
        tabs: [
          {
            id: `t-${id}`,
            label: "1",
            focusedPaneId: `p-${id}`,
            zoomedPaneId: null,
            layout: { type: "pane" as const, paneId: `p-${id}` },
            panes: [{ id: `p-${id}`, label: null, cwd, shell: "/bin/sh" }],
          },
        ],
      };
    }

    it("自動の名前は場所から決め直し、付けた名前はそのまま。以前の版の「1」と空白だけの名前は自動（AC5〜AC7）", async () => {
      // 保存した後に /r/sub が git のリポジトリになった（親で git init した）状態を、偽の fs で表す。
      const h = setup(["/r"]);
      await h.service.restore({
        schema: 1,
        savedAt: "2026-09-21T00:00:00Z",
        groups: [],
        workspaces: [
          workspaceData("w1", "sub", "/r/sub", true), // 自動（保存した印）→ 決め直して r
          workspaceData("w2", "mine", "/r/sub", false), // 付けた名前 → git の状態が変わってもそのまま
          workspaceData("w3", "1", "/srv/app"), // 以前の版の既定の名前 → 自動
          workspaceData("w4", "feat/x", "/r/sub"), // 以前の版の付けた名前（worktree のブランチ名等）→ そのまま
          workspaceData("w5", "  ", "/srv/app", false), // 空白だけ → 自動
          workspaceData("w6", "1", "/r/sub", false), // 新しい版で利用者が「1」と付けた（印がある）→ 付けた名前のまま
        ],
        focus: null,
      });
      expect(h.service.snapshot().workspaces.map((w) => [w.id, w.label, w.autoLabel])).toEqual([
        ["w1", "r", true],
        ["w2", "mine", false],
        ["w3", "app", true],
        ["w4", "feat/x", false],
        ["w5", "app", true],
        ["w6", "1", false],
      ]);
    });
  });

  // 20260923-agent-session-resume：design「復元」・decisions D8〜D11。
  describe("復元 — 公式フック連携の会話再開（design D9〜D11）", () => {
    function paneData(id: string, cwd: string, agentSession?: { kind: string; sessionId: string; reportedAt: number }) {
      return { id, label: null, cwd, shell: "/bin/sh", ...(agentSession ? { agentSession } : {}) };
    }
    function oneWorkspace(id: string, cwd: string, panes: ReturnType<typeof paneData>[]) {
      return {
        id,
        label: id,
        cwd,
        activeTabId: `t-${id}`,
        tabs: [{ id: `t-${id}`, label: "1", focusedPaneId: panes[0]!.id, zoomedPaneId: null, layout: buildLayout(panes.map((p) => p.id)), panes }],
      };
    }
    function buildLayout(paneIds: string[]): LayoutNode {
      if (paneIds.length === 1) return { type: "pane", paneId: paneIds[0]! };
      const [first, ...rest] = paneIds;
      return { type: "split", id: `s-${first}`, dir: "right", ratio: 0.5, a: { type: "pane", paneId: first! }, b: buildLayout(rest) };
    }

    function setup(getAutoResumeEnabled?: () => boolean) {
      const terminals = new FakeTerminalManager();
      const service = new SessionService({
        model: new SessionModel(),
        terminals,
        bus: new EventBus(),
        persist: new FakePersistScheduler(),
        serverVersion: "0.1.0-test",
        host: HOST_INFO,
        scrollbackLines: 1000,
        spawnGraceMs: 5,
        defaultCwd: "/home/u",
        logger: new MemoryLogger(),
        ...(getAutoResumeEnabled ? { getAutoResumeEnabled } : {}),
      });
      return { terminals, service };
    }

    it("保存されていた会話IDで claude --resume <id> を投入する（AC1）", async () => {
      const { terminals, service } = setup();
      await service.restore({
        schema: 1,
        savedAt: "2026-09-23T00:00:00Z",
        groups: [],
        workspaces: [oneWorkspace("w1", "/r", [paneData("p1", "/r", { kind: "claude", sessionId: "abc-123", reportedAt: 1 })])],
        focus: null,
      });
      const host = terminals.hosts.get("p1") as FakeTerminalHost;
      expect(host.writes).toEqual(["claude --resume abc-123\r"]);
    });

    it("codex は codex resume <id> を投入する（AC2）", async () => {
      const { terminals, service } = setup();
      await service.restore({
        schema: 1,
        savedAt: "2026-09-23T00:00:00Z",
        groups: [],
        workspaces: [oneWorkspace("w1", "/r", [paneData("p1", "/r", { kind: "codex", sessionId: "thr_1", reportedAt: 1 })])],
        focus: null,
      });
      const host = terminals.hosts.get("p1") as FakeTerminalHost;
      expect(host.writes).toEqual(["codex resume thr_1\r"]);
    });

    it("会話IDが無い pane には何も投入しない（AC3・AC4）", async () => {
      const { terminals, service } = setup();
      await service.restore({
        schema: 1,
        savedAt: "2026-09-23T00:00:00Z",
        groups: [],
        workspaces: [oneWorkspace("w1", "/r", [paneData("p1", "/r")])],
        focus: null,
      });
      const host = terminals.hosts.get("p1") as FakeTerminalHost;
      expect(host.writes).toEqual([]);
    });

    it("未知の kind（将来の永続化データ・手編集等）は無害に無視する（AC6 と同じフォールバック）", async () => {
      const { terminals, service } = setup();
      await service.restore({
        schema: 1,
        savedAt: "2026-09-23T00:00:00Z",
        groups: [],
        workspaces: [oneWorkspace("w1", "/r", [paneData("p1", "/r", { kind: "gemini", sessionId: "x", reportedAt: 1 })])],
        focus: null,
      });
      const host = terminals.hosts.get("p1") as FakeTerminalHost;
      expect(host.writes).toEqual([]);
    });

    it("自動再開が無効なら投入しない（design D3・AC-I4）", async () => {
      const { terminals, service } = setup(() => false);
      await service.restore({
        schema: 1,
        savedAt: "2026-09-23T00:00:00Z",
        groups: [],
        workspaces: [oneWorkspace("w1", "/r", [paneData("p1", "/r", { kind: "claude", sessionId: "abc-123", reportedAt: 1 })])],
        focus: null,
      });
      const host = terminals.hosts.get("p1") as FakeTerminalHost;
      expect(host.writes).toEqual([]);
    });

    it("同一 cwd・同一種別の複数 pane でも、pane ごとに一意な ID で全 pane に投入する（AC5・design D11。重複排除はしない）", async () => {
      const { terminals, service } = setup();
      await service.restore({
        schema: 1,
        savedAt: "2026-09-23T00:00:00Z",
        groups: [],
        workspaces: [
          oneWorkspace("w1", "/r", [
            paneData("p1", "/r", { kind: "claude", sessionId: "session-a", reportedAt: 1 }),
            paneData("p2", "/r", { kind: "claude", sessionId: "session-b", reportedAt: 2 }),
          ]),
        ],
        focus: null,
      });
      expect((terminals.hosts.get("p1") as FakeTerminalHost).writes).toEqual(["claude --resume session-a\r"]);
      expect((terminals.hosts.get("p2") as FakeTerminalHost).writes).toEqual(["claude --resume session-b\r"]);
    });

    it("シェルの起動が失敗した pane には投入せず、現状どおり failed にする", async () => {
      const { terminals, service } = setup();
      terminals.nextSpawnFailure = 1;
      await service.restore({
        schema: 1,
        savedAt: "2026-09-23T00:00:00Z",
        groups: [],
        workspaces: [oneWorkspace("w1", "/r", [paneData("p1", "/r", { kind: "claude", sessionId: "abc-123", reportedAt: 1 })])],
        focus: null,
      });
      expect(service.getPane("p1")?.status).toBe("failed");
      // 起動に失敗した pane は `spawnForPane` が `terminals.dispose()` する（破棄されてマップから消える）ので、
      // resume コマンドを書き込む先自体が無い（=投入していないことの証拠）。
      expect(terminals.hosts.has("p1")).toBe(false);
    });

    // 20260926-screen-history-replay：design「復元」。
    describe("画面履歴の流し込み（--pane-history）", () => {
      const SAVED_AT = "2026-09-26T01:02:00.000Z";
      function restoreData(panes: ReturnType<typeof paneData>[]): SessionFileData {
        return {
          schema: 1,
          savedAt: "2026-09-26T00:00:00Z",
          groups: [],
          workspaces: [oneWorkspace("w1", "/r", panes)],
          focus: null,
        };
      }

      it("保存した画面と区切りの行を、端末を作った直後（猶予を待つ前・他の書き込みの前）にミラーへ流す（AC2）", async () => {
        const { terminals, service } = setup();
        const seenAtCreate: number[] = [];
        terminals.onCreate = (id) => seenAtCreate.push((terminals.hosts.get(id) as FakeTerminalHost).mirrorWrites.length);
        await service.restore(restoreData([paneData("p1", "/r")]), { paneHistory: new Map([["p1", { ansi: "\x1b[31mold output", savedAt: SAVED_AT }]]) });
        const host = terminals.hosts.get("p1") as FakeTerminalHost;
        expect(seenAtCreate).toEqual([1]); // create の直後のマイクロタスクの時点で、もう書いてある
        expect(host.mirrorWrites).toEqual([historyReplayText("\x1b[31mold output", SAVED_AT)]);
        expect(host.writes).toEqual([]); // シェル（PTY）へは何も書かない
      });

      it("保存した画面が無い pane には何も流さない（区切りも出さない。AC12）", async () => {
        const { terminals, service } = setup();
        await service.restore(restoreData([paneData("p1", "/r"), paneData("p2", "/r")]), {
          paneHistory: new Map([["p1", { ansi: "old", savedAt: SAVED_AT }]]),
        });
        expect((terminals.hosts.get("p1") as FakeTerminalHost).mirrorWrites).toHaveLength(1);
        expect((terminals.hosts.get("p2") as FakeTerminalHost).mirrorWrites).toEqual([]);
      });

      it("画面履歴を渡さなければ（無効のとき）今までどおり何も流さない", async () => {
        const { terminals, service } = setup();
        await service.restore(restoreData([paneData("p1", "/r")]));
        expect((terminals.hosts.get("p1") as FakeTerminalHost).mirrorWrites).toEqual([]);
      });

      it("会話を再開する pane には流さず、再開のコマンドだけを書く（AC9）", async () => {
        const { terminals, service } = setup();
        await service.restore(restoreData([paneData("p1", "/r", { kind: "claude", sessionId: "abc-123", reportedAt: 1 })]), {
          paneHistory: new Map([["p1", { ansi: "old", savedAt: SAVED_AT }]]),
        });
        const host = terminals.hosts.get("p1") as FakeTerminalHost;
        expect(host.mirrorWrites).toEqual([]);
        expect(host.writes).toEqual(["claude --resume abc-123\r"]);
      });

      it("自動再開が無効なら、会話参照があっても流す（AC9）", async () => {
        const { terminals, service } = setup(() => false);
        await service.restore(restoreData([paneData("p1", "/r", { kind: "claude", sessionId: "abc-123", reportedAt: 1 })]), {
          paneHistory: new Map([["p1", { ansi: "old", savedAt: SAVED_AT }]]),
        });
        const host = terminals.hosts.get("p1") as FakeTerminalHost;
        expect(host.mirrorWrites).toEqual([historyReplayText("old", SAVED_AT)]);
        expect(host.writes).toEqual([]);
      });

      it("再開のコマンドが無い会話参照（未知の kind）なら流す", async () => {
        const { terminals, service } = setup();
        await service.restore(restoreData([paneData("p1", "/r", { kind: "unknown-agent", sessionId: "x", reportedAt: 1 })]), {
          paneHistory: new Map([["p1", { ansi: "old", savedAt: SAVED_AT }]]),
        });
        expect((terminals.hosts.get("p1") as FakeTerminalHost).mirrorWrites).toHaveLength(1);
      });
    });
  });

  describe("報告の受信（reportAgentSession。design「振る舞いの詳細・会話IDの報告受信」）", () => {
    function setup() {
      const terminals = new FakeTerminalManager();
      const persist = new FakePersistScheduler();
      const service = makeService(terminals, new EventBus(), persist);
      return { terminals, persist, service };
    }

    it("報告を pane.agentSession へ反映し、保存を予約する", async () => {
      const { service, persist } = setup();
      const { pane } = await service.createWorkspace("/r", "w1");
      persist.touchCount = 0;

      service.reportAgentSession(pane.id, "claude", "abc-123");

      expect(service.getPane(pane.id)?.agentSession).toMatchObject({ kind: "claude", sessionId: "abc-123" });
      expect(persist.touchCount).toBe(1);
    });

    it("存在しない pane への報告は無視する（report 経路は best-effort）", () => {
      const { service, persist } = setup();
      expect(() => service.reportAgentSession("unknown", "claude", "abc-123")).not.toThrow();
      expect(persist.touchCount).toBe(0);
    });

    it("画面判定でエージェントが消えたら（非 null → null）、会話参照も一緒に消す（design D9）", async () => {
      const { service, persist } = setup();
      const { pane } = await service.createWorkspace("/r", "w1");
      service.reportAgentSession(pane.id, "claude", "abc-123");
      service.updatePaneRuntime(pane.id, {
        agent: { instanceId: "a1", kind: "claude", label: "Claude Code", state: "working", completionSeq: 0, serverSeenSeq: 0, verified: true, since: 1 },
      });
      persist.touchCount = 0;

      service.updatePaneRuntime(pane.id, { agent: null });

      expect(service.getPane(pane.id)?.agentSession).toBeNull();
      expect(persist.touchCount, "会話参照の消滅も保存契機にする（design D8）").toBe(1);
    });

    it("agent の kind・state が変わるだけでは会話参照を消さない", async () => {
      const { service } = setup();
      const { pane } = await service.createWorkspace("/r", "w1");
      service.reportAgentSession(pane.id, "claude", "abc-123");
      service.updatePaneRuntime(pane.id, {
        agent: { instanceId: "a1", kind: "claude", label: "Claude Code", state: "working", completionSeq: 0, serverSeenSeq: 0, verified: true, since: 1 },
      });

      service.updatePaneRuntime(pane.id, {
        agent: { instanceId: "a1", kind: "claude", label: "Claude Code", state: "idle", completionSeq: 1, serverSeenSeq: 0, verified: true, since: 2 },
      });

      expect(service.getPane(pane.id)?.agentSession).toMatchObject({ sessionId: "abc-123" });
    });

    // 20260923-other-agents-session-resume（design AC5）。新規ロジックは無く、既存の
    // `reportAgentSession`/`agentSession` の仕組みがそのまま8 kind 分に対応することの確認テスト。
    it("8 kind すべてで agentSession へ正しく反映される", async () => {
      const { service } = setup();
      const kinds = ["claude", "codex", "cursor", "copilot", "devin", "droid", "grok", "qwen", "qodercli"] as const;
      for (const kind of kinds) {
        const { pane } = await service.createWorkspace("/r", kind);
        service.reportAgentSession(pane.id, kind, `${kind}-session`);
        expect(service.getPane(pane.id)?.agentSession).toMatchObject({ kind, sessionId: `${kind}-session` });
      }
    });

    it("同一 cwd・同一 kind の pane が複数あっても、pane ごとに別々の sessionId を保持する（AC5）", async () => {
      const { service } = setup();
      const { pane: pane1 } = await service.createWorkspace("/same/cwd", "w1");
      const { pane: pane2 } = await service.splitPane(pane1.id, "right", undefined);
      const { pane: pane3 } = await service.splitPane(pane1.id, "down", undefined);

      service.reportAgentSession(pane1.id, "claude", "session-1");
      service.reportAgentSession(pane2.id, "claude", "session-2");
      service.reportAgentSession(pane3.id, "claude", "session-3");

      expect(service.getPane(pane1.id)?.agentSession).toMatchObject({ sessionId: "session-1" });
      expect(service.getPane(pane2.id)?.agentSession).toMatchObject({ sessionId: "session-2" });
      expect(service.getPane(pane3.id)?.agentSession).toMatchObject({ sessionId: "session-3" });
    });
  });

  // 応答しないファイルシステムへの stat は取り消せず libuv のスレッドを塞ぐので、上限を超えた問い合わせが返るまでは根を探さない（review ラウンド 1・2）。
  describe("名前を決める処理が上限を超えた後", () => {
    function stuckDeps() {
      const calls: string[] = [];
      let release: () => void = () => undefined;
      const gate = new Promise<void>((r) => (release = r));
      let hang = true;
      const base = fakeLabelDeps(["/r"]);
      const deps: WorkspaceLabelDeps = {
        ...base,
        timeoutMs: 20,
        stat: (p) => {
          calls.push(p);
          // 止まっている間の問い合わせは、release するまで返らない（止まった NFS の stat の代わり）。
          return hang ? gate.then(() => base.stat(p)) : base.stat(p);
        },
      };
      return {
        deps,
        calls,
        release: () => {
          hang = false;
          release();
        },
      };
    }

    it("上限を超えた問い合わせが返るまでは fs に問い合わせずフォルダ名にし、返ったらまた根を探す", async () => {
      const s = stuckDeps();
      const service = makeService(new FakeTerminalManager(), new EventBus(), new FakePersistScheduler(), undefined, s.deps);
      const first = await service.createWorkspace("/r/src", undefined);
      expect(first.workspace.label, "上限を超えたのでフォルダ名").toBe("src");
      const asked = s.calls.length;
      const second = await service.createWorkspace("/r/src", undefined);
      expect(second.workspace).toMatchObject({ label: "src", autoLabel: true });
      expect(s.calls.length, "止まった問い合わせが返るまでは問い合わせない").toBe(asked);
      s.release(); // 止まっていた stat が返る（遅いだけだった）
      await new Promise((r) => setTimeout(r, 10));
      const third = await service.createWorkspace("/r/src", undefined);
      expect(third.workspace.label, "返ったらまた根を探す").toBe("r");
    });

    // 数を戻す処理はログより先に付ける——warn が投げても、止まった問い合わせが返ったら数が戻る（review ラウンド 3）。
    it("上限を超えたときのログが投げても、問い合わせが返ったらまた根を探す", async () => {
      const s = stuckDeps();
      const logger = new MemoryLogger();
      logger.warn = () => {
        throw new Error("warn failed");
      };
      const service = new SessionService({
        model: new SessionModel(),
        terminals: new FakeTerminalManager(),
        bus: new EventBus(),
        persist: new FakePersistScheduler(),
        serverVersion: "0.1.0-test",
        host: HOST_INFO,
        scrollbackLines: 1000,
        spawnGraceMs: 5,
        defaultCwd: "/home/u",
        logger,
        workspaceLabelDeps: s.deps,
      });
      const first = await service.createWorkspace("/r/src", undefined);
      expect(first.workspace.label, "上限を超えたのでフォルダ名").toBe("src");
      s.release();
      await new Promise((r) => setTimeout(r, 10));
      const second = await service.createWorkspace("/r/src", undefined);
      expect(second.workspace.label, "warn が投げても数が戻り、また根を探す").toBe("r");
    });

    // 1 つずつ決めるので、遅いだけの fs でも数に比例して `/ws` の受け付けが遅れる——合計の期限（1 秒）を過ぎたら残りはフォルダ名（review ラウンド 2）。
    it("復元は合計の期限を過ぎたら、残りを問い合わせずフォルダ名にする（警告は 1 度だけ）", async () => {
      let now = 0;
      const calls: string[] = [];
      const logger = new MemoryLogger();
      const base = fakeLabelDeps(["/r"]);
      const deps: WorkspaceLabelDeps = {
        ...base,
        stat: (p) => {
          calls.push(p);
          now += 400; // 上限（200ms）には達しないが遅い stat（時計だけを進める）
          return base.stat(p);
        },
      };
      const service = new SessionService({
        model: new SessionModel(),
        terminals: new FakeTerminalManager(),
        bus: new EventBus(),
        persist: new FakePersistScheduler(),
        serverVersion: "0.1.0-test",
        host: HOST_INFO,
        scrollbackLines: 1000,
        spawnGraceMs: 5,
        defaultCwd: "/home/u",
        logger,
        workspaceLabelDeps: deps,
        clock: { now: () => now },
      });
      const ws = (id: string, cwd: string) => ({
        id,
        label: "1",
        cwd,
        activeTabId: `t-${id}`,
        tabs: [{ id: `t-${id}`, label: "1", focusedPaneId: `p-${id}`, zoomedPaneId: null, layout: { type: "pane" as const, paneId: `p-${id}` }, panes: [{ id: `p-${id}`, label: null, cwd, shell: "/bin/sh" }] }],
      });
      await service.restore({
        schema: 1,
        savedAt: "2026-09-21T00:00:00Z",
        groups: [],
        // w3 は付けた名前（期限を過ぎても決め直さない・フォルダ名にしない——期限は自動の名前のときだけ見る。review ラウンド 4）。
        workspaces: [ws("w1", "/r/a"), ws("w2", "/r/b"), { ...ws("w3", "/r/c"), label: "mine", autoLabel: false }, ws("w4", "/r/d")],
        focus: null,
      });
      expect(service.snapshot().workspaces.map((w) => w.label), "w1 は根を探して r、期限を過ぎた w2・w4 はフォルダ名、w3 は付けた名前").toEqual(["r", "b", "mine", "d"]);
      expect(calls.every((p) => p.startsWith("/r/a") || p === "/r/.git" || p === "/r/.git/HEAD"), "w2・w3 は問い合わせない").toBe(true);
      const overBudget = logger.lines.filter((l) => l.level === "warn" && l.msg.startsWith("workspace label lookup over restore budget"));
      expect(overBudget, "期限を過ぎたら警告を 1 度だけ（w2・w3 の 2 つとも過ぎているが 1 度）").toEqual([
        { level: "warn", msg: "workspace label lookup over restore budget; using folder names for the rest", fields: { budgetMs: 1000, remaining: 2 } },
      ]);
    });

    it("復元では 1 つずつ決め、1 つが上限を超えたら残りは問い合わせずフォルダ名にする", async () => {
      const s = stuckDeps();
      const service = makeService(new FakeTerminalManager(), new EventBus(), new FakePersistScheduler(), undefined, s.deps);
      const ws = (id: string, cwd: string) => ({
        id,
        label: "1",
        cwd,
        activeTabId: `t-${id}`,
        tabs: [{ id: `t-${id}`, label: "1", focusedPaneId: `p-${id}`, zoomedPaneId: null, layout: { type: "pane" as const, paneId: `p-${id}` }, panes: [{ id: `p-${id}`, label: null, cwd, shell: "/bin/sh" }] }],
      });
      await service.restore({
        schema: 1,
        savedAt: "2026-09-21T00:00:00Z",
        groups: [],
        workspaces: [ws("w1", "/r/a"), ws("w2", "/r/b"), ws("w3", "/r/c")],
        focus: null,
      });
      expect(service.snapshot().workspaces.map((w) => w.label)).toEqual(["a", "b", "c"]);
      expect(s.calls, "止まった 1 つ（w1 の最初の stat）の後は問い合わせない").toEqual(["/r/a"]);
    });
  });
});

// 20260926-workspace-label-follow-cwd：自動の名前を、最初の tab の最初の pane のいまの場所から決め直す（design D1〜D7）。
describe("SessionService — 最初の pane のいまの場所（名前の追従）", () => {
  const GIT: GitInfo = { branch: "main", ahead: 0, behind: 0, repoKey: "/q/.git", isLinkedWorktree: false };

  function setup(deps: WorkspaceLabelDeps = fakeLabelDeps(["/r", "/q"])) {
    const terminals = new FakeTerminalManager();
    const bus = new EventBus();
    const persist = new FakePersistScheduler();
    const updated: Workspace[] = [];
    bus.subscribe((e) => {
      if (e.event === "workspace.updated") updated.push(e.data.workspace);
    });
    const service = makeService(terminals, bus, persist, undefined, deps);
    return { service, bus, persist, updated };
  }

  /** stat を数える deps。 */
  function countingDeps(gitRoots: string[] = ["/r", "/q"]) {
    const base = fakeLabelDeps(gitRoots);
    const calls: string[] = [];
    const deps: WorkspaceLabelDeps = { ...base, stat: (p) => (calls.push(p), base.stat(p)) };
    return { deps, calls };
  }

  it("いまの場所は最初の tab の、画面の並びで先頭の pane の場所。ほかの pane・ほかの tab の場所では変わらず、開いた場所も変えない（AC4・AC9）", async () => {
    const h = setup();
    const { workspace, pane } = await h.service.createWorkspace("/r/src", undefined);
    const right = await h.service.splitPane(pane.id, "right", undefined);
    const { pane: second } = await h.service.createTab(workspace.id, undefined);
    expect(h.service.identityCwdOf(workspace.id)).toBe("/r/src");
    h.service.updatePaneRuntime(right.pane.id, { cwd: "/q/a" });
    h.service.updatePaneRuntime(second.id, { cwd: "/q/b" });
    expect(h.service.identityCwdOf(workspace.id), "分割した pane・2 つ目の tab の pane では変わらない").toBe("/r/src");
    h.service.updatePaneRuntime(pane.id, { cwd: "/q/c" });
    expect(h.service.identityCwdOf(workspace.id)).toBe("/q/c");
    expect(h.service.getWorkspace(workspace.id)!.cwd, "開いた場所は変えない").toBe("/r/src");
    expect(h.service.identityCwdOf("w999")).toBeUndefined();
  });

  it("最初の pane を閉じる・入れ替える・先頭の tab を並べ替えると、新しい最初の pane の場所になる（AC5）", async () => {
    const h = setup();
    const { workspace, pane } = await h.service.createWorkspace("/r/src", undefined);
    const right = await h.service.splitPane(pane.id, "right", undefined);
    h.service.updatePaneRuntime(right.pane.id, { cwd: "/q/right" });
    h.service.swapPaneWith(pane.id, right.pane.id);
    expect(h.service.identityCwdOf(workspace.id), "入れ替えで左上に来た pane").toBe("/q/right");
    h.service.swapPaneWith(pane.id, right.pane.id);
    await h.service.closePane(pane.id);
    expect(h.service.identityCwdOf(workspace.id), "閉じたら残りの先頭").toBe("/q/right");
    const { tab: tab2, pane: p2 } = await h.service.createTab(workspace.id, undefined);
    h.service.updatePaneRuntime(p2.id, { cwd: "/srv/two" });
    h.service.moveTab(tab2.id, "previous");
    expect(h.service.identityCwdOf(workspace.id), "並べ替えで先頭になった tab").toBe("/srv/two");
  });

  it("最初の pane が別のリポジトリへ移ると、その根の名前と git を 1 つの workspace.updated で入れて保存を予約する（AC1・AC2・AC10）", async () => {
    const h = setup();
    const { workspace, pane } = await h.service.createWorkspace("/r/src", undefined);
    h.service.updatePaneRuntime(pane.id, { cwd: "/q/pkg/deep" });
    const label = await h.service.followedLabel(workspace.id, "/q/pkg/deep");
    expect(label).toMatchObject({ label: "q", degraded: false });
    const touches = h.persist.touchCount;
    h.updated.length = 0;
    h.service.applyWorkspaceIdentity(workspace.id, "/q/pkg/deep", { kind: "git", git: GIT }, label);
    expect(h.updated.map((w) => [w.label, w.autoLabel, w.git?.branch])).toEqual([["q", true, "main"]]);
    expect(h.persist.touchCount - touches, "名前は保存にある").toBe(1);
    h.service.updatePaneRuntime(pane.id, { cwd: "/srv/plain" });
    h.service.applyWorkspaceIdentity(workspace.id, "/srv/plain", { kind: "unmanaged" }, await h.service.followedLabel(workspace.id, "/srv/plain"));
    expect(h.updated.at(-1)).toMatchObject({ label: "plain", autoLabel: true, git: null });
  });

  it("場所が変わっていなければ名前を決め直さない（fs に問い合わせない。AC11）", async () => {
    const c = countingDeps();
    const h = setup(c.deps);
    const { workspace } = await h.service.createWorkspace("/r/src", undefined);
    const asked = c.calls.length;
    expect(await h.service.followedLabel(workspace.id, "/r/src")).toBeNull();
    expect(c.calls.length).toBe(asked);
    const moved = await h.service.followedLabel(workspace.id, "/q/x");
    h.service.updatePaneRuntime(h.service.snapshot().panes[0]!.id, { cwd: "/q/x" });
    h.service.applyWorkspaceIdentity(workspace.id, "/q/x", { kind: "unmanaged" }, moved);
    const after = c.calls.length;
    expect(await h.service.followedLabel(workspace.id, "/q/x"), "決め直した場所も記録する").toBeNull();
    expect(c.calls.length).toBe(after);
  });

  // review ラウンド 1：監視は `/proc/<pid>/cwd` の実パスを入れる。リンクを含む論理パスで開いても、`cd` していなければ名前を変えない。
  it("開いた場所（リンクを含む論理パス）と監視が入れた実パスが同じディレクトリなら、名前を決め直さない", async () => {
    const base = fakeLabelDeps(["/r", "/q"]);
    const real: Record<string, string> = { "/link/proj": "/data/proj-2024", "/data/proj-2024": "/data/proj-2024", "/data/other": "/data/other" };
    const c = { calls: 0 };
    const h = setup({ ...base, stat: (p) => (c.calls++, base.stat(p)), realpath: async (p) => real[p] ?? null });
    const { workspace, pane } = await h.service.createWorkspace("/link/proj", undefined);
    expect(h.service.getWorkspace(workspace.id)!.label).toBe("proj");
    h.service.updatePaneRuntime(pane.id, { cwd: "/data/proj-2024" });
    const asked = c.calls;
    const same = await h.service.followedLabel(workspace.id, "/data/proj-2024");
    expect(same, "いまの名前のまま、場所だけ記録する").toMatchObject({ label: "proj", degraded: false });
    expect(c.calls, "名前を決めるために fs をたどらない").toBe(asked);
    h.service.applyWorkspaceIdentity(workspace.id, "/data/proj-2024", { kind: "unmanaged" }, same);
    expect(h.service.getWorkspace(workspace.id)!.label).toBe("proj");
    expect(await h.service.followedLabel(workspace.id, "/data/proj-2024"), "記録したので次は問い合わせもしない").toBeNull();
    h.service.updatePaneRuntime(pane.id, { cwd: "/data/other" });
    expect(await h.service.followedLabel(workspace.id, "/data/other"), "別のディレクトリなら決め直す").toMatchObject({ label: "other" });
  });

  it("リンクを解決できない場所どうしは同じとみなさず、決め直す", async () => {
    const h = setup({ ...fakeLabelDeps(["/r", "/q"]), realpath: async () => null });
    const { workspace, pane } = await h.service.createWorkspace("/srv/a", undefined);
    h.service.updatePaneRuntime(pane.id, { cwd: "/q/b" });
    expect(await h.service.followedLabel(workspace.id, "/q/b")).toMatchObject({ label: "q" });
  });

  it("fs が詰まっている間はリンクを解決しに行かない。解決が上限を超えたら詰まりとして数える", async () => {
    let hang = false;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const resolved: string[] = [];
    const base = fakeLabelDeps(["/r", "/q"]);
    const h = setup({ ...base, timeoutMs: 20, realpath: async (p) => (resolved.push(p), hang ? gate.then(() => p) : p) });
    const { workspace, pane } = await h.service.createWorkspace("/srv/a", undefined);
    hang = true;
    h.service.updatePaneRuntime(pane.id, { cwd: "/q/b" });
    const first = await h.service.followedLabel(workspace.id, "/q/b");
    expect(first, "解決が上限を超えた——決め直すが、詰まっているのでフォルダ名").toMatchObject({ label: "b", degraded: true });
    const asked = resolved.length;
    await h.service.followedLabel(workspace.id, "/q/b");
    expect(resolved.length, "詰まっている間は解決しに行かない").toBe(asked);
    hang = false;
    release();
  });

  it("付けた名前は変えず、git だけ入れる（AC3）", async () => {
    const h = setup();
    const { workspace, pane } = await h.service.createWorkspace("/r/src", "mine");
    h.service.updatePaneRuntime(pane.id, { cwd: "/q/x" });
    const label = await h.service.followedLabel(workspace.id, "/q/x");
    expect(label).toBeNull();
    h.service.applyWorkspaceIdentity(workspace.id, "/q/x", { kind: "git", git: GIT }, label);
    expect(h.service.getWorkspace(workspace.id)).toMatchObject({ label: "mine", autoLabel: false, git: GIT });
  });

  it("見直しの間に場所が変わったら、名前も git も捨てる（AC6）", async () => {
    const h = setup();
    const { workspace, pane } = await h.service.createWorkspace("/r/src", undefined);
    h.service.updatePaneRuntime(pane.id, { cwd: "/q/x" });
    const label = await h.service.followedLabel(workspace.id, "/q/x");
    h.service.updatePaneRuntime(pane.id, { cwd: "/srv/next" });
    h.updated.length = 0;
    h.service.applyWorkspaceIdentity(workspace.id, "/q/x", { kind: "git", git: GIT }, label);
    expect(h.updated).toEqual([]);
    expect(h.service.getWorkspace(workspace.id)).toMatchObject({ label: "r", git: null });
  });

  it("見直しの間に名前を付けたら、名前は捨てて付けた名前が勝つ（git は入れる。design D5）", async () => {
    const h = setup();
    const { workspace, pane } = await h.service.createWorkspace("/r/src", undefined);
    h.service.updatePaneRuntime(pane.id, { cwd: "/q/x" });
    const label = await h.service.followedLabel(workspace.id, "/q/x");
    await h.service.renameWorkspace(workspace.id, "mine");
    await h.service.renameWorkspace(workspace.id, null); // 自動に戻したが世代が進んでいる
    h.service.applyWorkspaceIdentity(workspace.id, "/q/x", { kind: "git", git: GIT }, { ...label!, label: "stale" });
    expect(h.service.getWorkspace(workspace.id)).toMatchObject({ label: "q", autoLabel: true, git: GIT });
  });

  it("名前を空にして確定すると、開いた場所ではなく最初の pane のいまの場所の名前になる（AC7）", async () => {
    const h = setup();
    const { workspace, pane } = await h.service.createWorkspace("/r/src", "mine");
    h.service.updatePaneRuntime(pane.id, { cwd: "/q/x" });
    await h.service.renameWorkspace(workspace.id, null);
    expect(h.service.getWorkspace(workspace.id)).toMatchObject({ label: "q", autoLabel: true });
  });

  it("名前を空にして確定した待ちの間に場所が変わったら、新しい場所で決め直す。決まらなければ名前は入れず自動の印だけ立てる（AC6）", async () => {
    const base = fakeLabelDeps(["/r", "/q"]);
    let onStat: (p: string) => void = () => undefined;
    const h = setup({ ...base, stat: (p) => (onStat(p), base.stat(p)) });
    const { workspace, pane } = await h.service.createWorkspace("/r/src", "mine");
    h.service.updatePaneRuntime(pane.id, { cwd: "/r/a" });
    let moves = 0;
    onStat = (p) => {
      if (p === "/r/a" && moves++ === 0) h.service.updatePaneRuntime(pane.id, { cwd: "/q/b" });
    };
    await h.service.renameWorkspace(workspace.id, null);
    expect(h.service.getWorkspace(workspace.id), "新しい場所 /q/b の名前").toMatchObject({ label: "q", autoLabel: true });

    await h.service.renameWorkspace(workspace.id, "named");
    let n = 0;
    onStat = () => h.service.updatePaneRuntime(pane.id, { cwd: `/srv/moving${n++}` }); // 決めるたびに場所が変わる
    await h.service.renameWorkspace(workspace.id, null);
    expect(h.service.getWorkspace(workspace.id), "古い場所の名前で上書きしない").toMatchObject({ label: "named", autoLabel: true });
    onStat = () => undefined;
    const cwd = h.service.identityCwdOf(workspace.id)!;
    expect(await h.service.followedLabel(workspace.id, cwd), "見直しが決め直す").toMatchObject({ label: cwd.split("/").at(-1) });
  });

  it("復元は、保存の最初の tab の先頭の pane の場所から名前を決める（以前の版の保存でも。AC8・AC14）", async () => {
    const c = countingDeps();
    const h = setup(c.deps);
    await h.service.restore({
      schema: 1,
      savedAt: "2026-09-21T00:00:00Z",
      groups: [],
      workspaces: [
        {
          id: "w1",
          label: "1", // 以前の版（autoLabel の印が無い）
          cwd: "/srv/opened",
          activeTabId: "t1",
          tabs: [
            {
              id: "t1",
              label: "1",
              focusedPaneId: "p2",
              zoomedPaneId: null,
              layout: { type: "split", id: "s1", dir: "right", ratio: 0.5, a: { type: "pane", paneId: "p1" }, b: { type: "pane", paneId: "p2" } },
              panes: [
                { id: "p2", label: null, cwd: "/srv/other", shell: "/bin/sh" },
                { id: "p1", label: null, cwd: "/q/deep", shell: "/bin/sh" },
              ],
            },
          ],
        },
      ],
      focus: null,
    });
    expect(h.service.getWorkspace("w1")).toMatchObject({ label: "q", autoLabel: true, cwd: "/srv/opened" });
    const asked = c.calls.length;
    expect(await h.service.followedLabel("w1", "/q/deep"), "復元で決めた場所も記録する").toBeNull();
    expect(c.calls.length).toBe(asked);
  });

  it("止まった fs のためにフォルダ名で代えた名前は、決め直し済みと記録しない（次の見直しで決め直す。AC15）", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    let hang = true;
    const base = fakeLabelDeps(["/r"]);
    const h = setup({ ...base, timeoutMs: 20, stat: (p) => (hang ? gate.then(() => base.stat(p)) : base.stat(p)) });
    const { workspace } = await h.service.createWorkspace("/r/src", undefined);
    expect(h.service.getWorkspace(workspace.id)!.label, "上限を超えたのでフォルダ名").toBe("src");
    hang = false;
    release();
    await new Promise((r) => setTimeout(r, 10));
    const label = await h.service.followedLabel(workspace.id, "/r/src");
    expect(label, "同じ場所でも決め直す").toMatchObject({ label: "r", degraded: false });
    h.service.applyWorkspaceIdentity(workspace.id, "/r/src", { kind: "unmanaged" }, label);
    expect(h.service.getWorkspace(workspace.id)!.label).toBe("r");
  });

  it("世代は待つ前に取る：見直しの待ちの間に名前を付けて自動に戻したら、見直しの名前は捨てる（design D5）", async () => {
    let hang = false;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const base = fakeLabelDeps(["/r", "/q"]);
    const h = setup({ ...base, timeoutMs: 60_000, stat: (p) => (hang ? gate.then(() => base.stat(p)) : base.stat(p)) });
    const { workspace, pane } = await h.service.createWorkspace("/r/src", undefined);
    h.service.updatePaneRuntime(pane.id, { cwd: "/q/x" });
    hang = true;
    const following = h.service.followedLabel(workspace.id, "/q/x");
    await h.service.renameWorkspace(workspace.id, "mine");
    hang = false;
    await h.service.renameWorkspace(workspace.id, null);
    release();
    const label = await following;
    h.service.applyWorkspaceIdentity(workspace.id, "/q/x", { kind: "unmanaged" }, { ...label!, label: "stale" });
    expect(h.service.getWorkspace(workspace.id)).toMatchObject({ label: "q", autoLabel: true });
  });

  it("名前を空にして確定した場所も記録し、同じ場所では決め直さない（AC11）", async () => {
    const c = countingDeps();
    const h = setup(c.deps);
    const { workspace, pane } = await h.service.createWorkspace("/r/src", "mine");
    h.service.updatePaneRuntime(pane.id, { cwd: "/q/x" });
    await h.service.renameWorkspace(workspace.id, null);
    const asked = c.calls.length;
    expect(await h.service.followedLabel(workspace.id, "/q/x")).toBeNull();
    expect(c.calls.length).toBe(asked);
  });

  it("追従で degraded の名前を入れたら、決め直し済みと記録しない（AC15）", async () => {
    const h = setup();
    const { workspace, pane } = await h.service.createWorkspace("/r/src", undefined);
    h.service.updatePaneRuntime(pane.id, { cwd: "/q/x" });
    h.service.applyWorkspaceIdentity(workspace.id, "/q/x", { kind: "unmanaged" }, { label: "x", gen: 0, degraded: true });
    expect(h.service.getWorkspace(workspace.id)!.label).toBe("x");
    expect(await h.service.followedLabel(workspace.id, "/q/x")).toMatchObject({ label: "q", degraded: false });
  });

  /** 最初の問い合わせを上限（20ms）を超えて止め、`release` で返す deps。 */
  function stuckOnce() {
    let hang = true;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const base = fakeLabelDeps(["/r", "/q"]);
    const deps: WorkspaceLabelDeps = { ...base, timeoutMs: 20, stat: (p) => (hang ? gate.then(() => base.stat(p)) : base.stat(p)) };
    return {
      deps,
      release: async () => {
        hang = false;
        release();
        await new Promise((r) => setTimeout(r, 10));
      },
    };
  }

  it("待つ前から詰まっていてフォルダ名にした名前も、決め直し済みと記録しない（AC15）", async () => {
    const s = stuckOnce();
    const h = setup(s.deps);
    await h.service.createWorkspace("/r/src", undefined); // 上限を超えて詰まる
    const { workspace } = await h.service.createWorkspace("/q/sub", undefined); // 詰まっている間：問い合わせずフォルダ名
    expect(h.service.getWorkspace(workspace.id)!.label).toBe("sub");
    await s.release();
    expect(await h.service.followedLabel(workspace.id, "/q/sub")).toMatchObject({ label: "q" });
  });

  it("復元で上限を超えてフォルダ名にした名前は、決め直し済みと記録しない（AC15）", async () => {
    const s = stuckOnce();
    const h = setup(s.deps);
    const paneTab = (id: string, cwd: string) => ({ id: `t-${id}`, label: "1", focusedPaneId: `p-${id}`, zoomedPaneId: null, layout: { type: "pane" as const, paneId: `p-${id}` }, panes: [{ id: `p-${id}`, label: null, cwd, shell: "/bin/sh" }] });
    await h.service.restore({
      schema: 1,
      savedAt: "2026-09-26T00:00:00Z",
      groups: [],
      workspaces: [{ id: "w1", label: "1", cwd: "/q/sub", activeTabId: "t-w1", tabs: [paneTab("w1", "/q/sub")] }],
      focus: null,
    });
    expect(h.service.getWorkspace("w1")!.label).toBe("sub");
    await s.release();
    expect(await h.service.followedLabel("w1", "/q/sub")).toMatchObject({ label: "q" });
  });

  // 待ち終える前に詰まりが解ける順序（上限超えの直後に止まっていた問い合わせが返る）は、マイクロタスクの順序に依るので単体では確実に作れない
  // （decisions D6）。ここでは上限を超えた問い合わせの結果が degraded になることだけを確かめる。
  it("待つ間に上限を超え、返る前に詰まりが解けても、代えたフォルダ名は degraded（待ち終えた時点の詰まりでは決めない。AC15）", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const base = fakeLabelDeps(["/r"]);
    // 上限を超えたらすぐ止まっていた stat を返す（待ち終える前に詰まりが解ける）。
    const h = setup({ ...base, timeoutMs: 20, stat: (p) => gate.then(() => base.stat(p)), onTimeout: () => release() });
    const { workspace } = await h.service.createWorkspace("/srv/x", "named");
    await h.service.renameWorkspace(workspace.id, null);
    await new Promise((r) => setTimeout(r, 10));
    const label = await h.service.followedLabel(workspace.id, "/srv/x");
    expect(label, "決め直し済みと記録していないので、もう一度決める").not.toBeNull();
  });
});

describe("SessionService — スクロールバックを $EDITOR で開く（20260926-edit-scrollback）", () => {
  let tmpRoot: string;
  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), "soda-edit-scrollback-svc-"));
  });
  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  function setup(opts: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv; root?: string } = {}) {
    const terminals = new FakeTerminalManager();
    const bus = new EventBus();
    const events: { event: string; data: unknown }[] = [];
    bus.subscribe((e) => events.push(e as { event: string; data: unknown }));
    const service = new SessionService({
      model: new SessionModel(),
      terminals,
      bus,
      persist: new FakePersistScheduler(),
      serverVersion: "0.1.0-test",
      host: HOST_INFO,
      scrollbackLines: 1000,
      spawnGraceMs: 5,
      defaultCwd: "/home/u",
      logger: new MemoryLogger(),
      scrollbackEditor: { tmpRoot: opts.root ?? tmpRoot, platform: opts.platform ?? "linux", env: opts.env ?? {} },
    });
    return { terminals, bus, events, service };
  }

  it("対象を分割した新しい pane でエディタを起動し、拡大表示にして焦点を移す。作業場所は対象の場所（AC1・AC2）", async () => {
    const { terminals, events, service } = setup();
    const { tab, pane: source } = await service.createWorkspace("/home/u/api", "api");
    events.length = 0;
    const { pane } = await service.editScrollback(source.id);

    const t = service.getTab(tab.id)!;
    expect(Layout.leaves(t.layout)).toEqual([source.id, pane.id]);
    expect(t.zoomedPaneId).toBe(pane.id);
    expect(t.focusedPaneId).toBe(pane.id);
    expect(pane.cwd).toBe("/home/u/api");
    const opts = terminals.createOptions[1]!;
    expect(opts.cwd).toBe("/home/u/api");
    expect(opts.shell).toBe("/bin/sh");
    expect(opts.args?.slice(0, 3)).toEqual(["-c", 'eval "${EDITOR:-vi} \\"\\$1\\""', "soda-edit-scrollback"]);
    expect(opts.trackCwd, "エディタには場所の知らせを差し込まない（20260928-windows-pane-cwd の decisions D2）").toBeUndefined();
    expect(terminals.createOptions[0]!.trackCwd, "元の対話の pane には差し込む").toBe(true);
    expect(events.map((e) => e.event)).toEqual(["pane.created", "layout.updated"]);
    expect((events[1]!.data as { tab: { zoomedPaneId: string | null } }).tab.zoomedPaneId).toBe(pane.id);
  });

  it("一時ファイルの中身は対象のミラーの平文で、専用の一時ディレクトリに置く（AC3・AC6）", async () => {
    const { terminals, service } = setup();
    const { pane: source } = await service.createWorkspace("/home/u/api", "api");
    terminals.hosts.get(source.id)!.scrollbackText = "line1\nline2\n";
    await service.editScrollback(source.id);
    const path = terminals.createOptions[1]!.args![3]!;
    const dirs = await readdir(tmpRoot);
    expect(dirs).toHaveLength(1);
    expect(dirs[0]!.startsWith("soda-scrollback-")).toBe(true);
    expect(path).toBe(join(tmpRoot, dirs[0]!, "scrollback.txt"));
    expect(await readFile(path, "utf8")).toBe("line1\nline2\n");
  });

  describe("失敗したら新しい pane も一時ファイルも残さない（AC5・AC8）", () => {
    async function expectNothingLeft(service: SessionService, before: number, events: { event: string }[]) {
      expect(service.snapshot().panes).toHaveLength(before);
      expect(events.filter((e) => e.event === "pane.created")).toEqual([]);
      expect(await readdir(tmpRoot)).toEqual([]);
    }

    it("pane が無い → not_found", async () => {
      const { events, service } = setup();
      await service.createWorkspace("/home/u", "w");
      events.length = 0;
      await expect(service.editScrollback("p999")).rejects.toMatchObject({ code: "not_found" });
      await expectNothingLeft(service, 1, events);
    });

    it("端末が無い（復元に失敗した pane 等） → not_found", async () => {
      const { terminals, events, service } = setup();
      const { pane } = await service.createWorkspace("/home/u", "w");
      terminals.dispose(pane.id);
      events.length = 0;
      await expect(service.editScrollback(pane.id)).rejects.toMatchObject({ code: "not_found" });
      await expectNothingLeft(service, 1, events);
    });

    it("Windows で VISUAL・EDITOR が無い → spawn_failed（一時ファイルを作る前）", async () => {
      const { events, service } = setup({ platform: "win32", env: {} });
      const { pane } = await service.createWorkspace("/home/u", "w");
      events.length = 0;
      await expect(service.editScrollback(pane.id)).rejects.toMatchObject({ code: "spawn_failed" });
      await expectNothingLeft(service, 1, events);
    });

    it("一時ファイルを作れない → 投げる（方式の層で internal になる）", async () => {
      const { events, service } = setup({ root: join(tmpRoot, "missing") });
      const { pane } = await service.createWorkspace("/home/u", "w");
      events.length = 0;
      await expect(service.editScrollback(pane.id)).rejects.toMatchObject({ code: "ENOENT" });
      await expectNothingLeft(service, 1, events);
    });

    it("エディタが猶予中に 0 以外で終わる（起動できない） → spawn_failed", async () => {
      const { terminals, events, service } = setup();
      const { pane } = await service.createWorkspace("/home/u", "w");
      events.length = 0;
      terminals.nextSpawnFailure = 127;
      await expect(service.editScrollback(pane.id)).rejects.toMatchObject({ code: "spawn_failed" });
      await expectNothingLeft(service, 1, events);
    });

    it("書いている間に対象が閉じられた → not_found", async () => {
      const { events, service } = setup();
      const { pane: first } = await service.createWorkspace("/home/u", "w");
      const { pane: second } = await service.splitPane(first.id, "right", undefined);
      events.length = 0;
      const pending = service.editScrollback(second.id);
      await service.closePane(second.id);
      await expect(pending).rejects.toMatchObject({ code: "not_found" });
      await expectNothingLeft(service, 1, events);
    });

    it("起動の猶予の間に対象が閉じられた（分割できない） → 端末を捨てて投げる", async () => {
      const { terminals, events, service } = setup();
      const { pane: first } = await service.createWorkspace("/home/u", "w");
      const { pane: second } = await service.splitPane(first.id, "right", undefined);
      events.length = 0;
      terminals.onCreate = () => {
        terminals.onCreate = null;
        void service.closePane(second.id);
      };
      await expect(service.editScrollback(second.id)).rejects.toBeInstanceOf(NotFoundError); // 方式の層で not_found になる
      expect(terminals.createOptions).toHaveLength(3); // エディタの端末は作られた
      expect(terminals.hosts.size).toBe(1); // 残っているのは first の端末だけ（エディタの端末は捨てた）
      await expectNothingLeft(service, 1, events);
    });
  });

  it("エディタが猶予中に 0 で終わったら、pane をコミットしてすぐ閉じる（拡大表示のまま残さない）", async () => {
    const { terminals, events, service } = setup();
    const { tab, pane: source } = await service.createWorkspace("/home/u", "w");
    events.length = 0;
    terminals.nextSpawnFailure = 0;
    const { pane } = await service.editScrollback(source.id);
    expect(service.getPane(pane.id)).toBeUndefined();
    expect(events.map((e) => e.event)).toContain("pane.exited");
    expect(Layout.leaves(service.getTab(tab.id)!.layout)).toEqual([source.id]);
    expect(service.getTab(tab.id)!.zoomedPaneId).toBeNull();
  });

  describe("閉じたとき（AC4・AC8）", () => {
    const gone = async () => vi.waitFor(async () => expect(await readdir(tmpRoot)).toEqual([]), { timeout: 5000 });

    it("エディタが終わると pane が閉じ、焦点は対象へ（最初の葉ではなく）・拡大表示は解除・一時ディレクトリは消える", async () => {
      const { terminals, events, service } = setup();
      const { tab, pane: first } = await service.createWorkspace("/home/u", "w");
      const { pane: source } = await service.splitPane(first.id, "right", undefined);
      const { pane: editor } = await service.editScrollback(source.id);
      expect(await readdir(tmpRoot)).toHaveLength(1);
      events.length = 0;
      terminals.hosts.get(editor.id)!.fireExit(0);
      await vi.waitFor(() => expect(service.getPane(editor.id)).toBeUndefined());
      const t = service.getTab(tab.id)!;
      expect(t.focusedPaneId).toBe(source.id);
      expect(t.zoomedPaneId).toBeNull();
      expect(service.snapshot().focus?.paneId).toBe(source.id);
      expect(events.find((e) => e.event === "pane.closed")?.data).toEqual({ paneId: editor.id, successorPaneId: source.id });
      await gone();
    });

    it("開く前に対象が拡大表示なら、利用者がエディタの pane を閉じたときに対象の拡大表示へ戻す（layout.updated に載る）", async () => {
      const { events, service } = setup();
      const { tab, pane: first } = await service.createWorkspace("/home/u", "w");
      const { pane: source } = await service.splitPane(first.id, "right", undefined);
      service.zoomPane(source.id, "on");
      const { pane: editor } = await service.editScrollback(source.id);
      expect(service.getTab(tab.id)!.zoomedPaneId).toBe(editor.id);
      events.length = 0;
      await service.closePane(editor.id);
      expect(service.getTab(tab.id)!.zoomedPaneId).toBe(source.id);
      expect(service.getTab(tab.id)!.focusedPaneId).toBe(source.id);
      const layout = events.filter((e) => e.event === "layout.updated");
      expect(layout).toHaveLength(1);
      expect((layout[0]!.data as { tab: { zoomedPaneId: string | null } }).tab.zoomedPaneId).toBe(source.id);
      await gone();
    });

    it("対象が先に閉じられていたら、焦点は既定の規則（最初の葉）で、拡大表示も戻さない", async () => {
      const { events, service } = setup();
      const { tab, pane: first } = await service.createWorkspace("/home/u", "w");
      const { pane: source } = await service.splitPane(first.id, "right", undefined);
      service.zoomPane(source.id, "on");
      const { pane: editor } = await service.editScrollback(source.id);
      await service.closePane(source.id);
      events.length = 0;
      await service.closePane(editor.id);
      expect(service.getTab(tab.id)!.focusedPaneId).toBe(first.id);
      expect(service.getTab(tab.id)!.zoomedPaneId).toBeNull();
      expect(events.find((e) => e.event === "pane.closed")?.data).toEqual({ paneId: editor.id });
      await gone();
    });

    it("元の pane が別の tab へ移っていたら、どちらの tab にも拡大表示をかけない", async () => {
      const { service } = setup();
      const { workspace, tab, pane: first } = await service.createWorkspace("/home/u", "w");
      const other = await service.createTab(workspace.id, undefined);
      const { pane: source } = await service.splitPane(first.id, "right", undefined);
      service.zoomPane(source.id, "on");
      const { pane: editor } = await service.editScrollback(source.id);
      expect(service.moveToTab(source.id, other.tab.id)).toBe(true);
      await service.closePane(editor.id);
      expect(service.getTab(tab.id)!.zoomedPaneId).toBeNull();
      expect(service.getTab(other.tab.id)!.zoomedPaneId).toBeNull();
      await gone();
    });

    it("中央へのドロップ（replacePane）でエディタの pane が閉じられても一時ディレクトリは消える", async () => {
      const { service } = setup();
      const { pane: first } = await service.createWorkspace("/home/u", "w");
      const { pane: editor } = await service.editScrollback(first.id);
      expect(service.replacePane(first.id, editor.id)).toBe(true);
      await gone();
    });

    it("tab ごと・workspace ごと閉じても一時ディレクトリは消える", async () => {
      const { service } = setup();
      const { workspace, tab, pane } = await service.createWorkspace("/home/u", "w");
      const second = await service.createTab(workspace.id, undefined);
      await service.editScrollback(pane.id);
      await service.closeTab(tab.id);
      await gone();
      await service.editScrollback(second.pane.id);
      expect(await readdir(tmpRoot)).toHaveLength(1);
      await service.closeWorkspace(workspace.id);
      await gone();
    });

    it("猶予中に 0 で終わったエディタも一時ディレクトリを残さない", async () => {
      const { terminals, service } = setup();
      const { pane } = await service.createWorkspace("/home/u", "w");
      terminals.nextSpawnFailure = 0;
      await service.editScrollback(pane.id);
      await gone();
    });

    it("停止時（disposeScrollbackEditors）は開いたままのエディタの一時ディレクトリも消す。その後に閉じても投げない", async () => {
      const { service } = setup();
      const { pane } = await service.createWorkspace("/home/u", "w");
      const { pane: editor } = await service.editScrollback(pane.id);
      await service.disposeScrollbackEditors();
      expect(await readdir(tmpRoot)).toEqual([]);
      await service.closePane(editor.id);
    });

    it("停止時は、閉じた直後でまだ削除の途中のものも待つ", async () => {
      const { service } = setup();
      const { pane } = await service.createWorkspace("/home/u", "w");
      const { pane: first } = await service.editScrollback(pane.id);
      const { pane: second } = await service.editScrollback(pane.id);
      await service.closePane(first.id);
      await service.closePane(second.id);
      await service.disposeScrollbackEditors(); // waitFor で待たずに、戻った時点で空であること
      expect(await readdir(tmpRoot)).toEqual([]);
    });
  });

  it("再起動後はエディタの pane も既定のシェルで戻る（保存された shell も一時ファイルも使わない。AC12）", async () => {
    const { terminals, service } = setup();
    const data: SessionFileData = {
      schema: 1,
      savedAt: "2026-09-26T00:00:00Z",
      groups: [],
      workspaces: [
        {
          id: "w1",
          label: "api",
          cwd: "/home/u/api",
          activeTabId: "t1",
          tabs: [
            {
              id: "t1",
              label: "main",
              focusedPaneId: "p2",
              zoomedPaneId: "p2",
              layout: { type: "split", id: "s1", dir: "right", ratio: 0.5, a: { type: "pane", paneId: "p1" }, b: { type: "pane", paneId: "p2" } },
              panes: [
                { id: "p1", label: null, cwd: "/home/u/api", shell: "" },
                { id: "p2", label: null, cwd: "/home/u/api", shell: "/bin/sh" },
              ],
            },
          ],
        },
      ],
      focus: { workspaceId: "w1", tabId: "t1", paneId: "p2" },
    };
    await service.restore(data);
    expect(terminals.createOptions.map((o) => [o.shell, o.args])).toEqual([
      [undefined, undefined],
      [undefined, undefined],
    ]);
  });
});

describe("SessionService — 独自コマンドの pane 種・文脈・環境（20260927-custom-command-keys の AC8・AC10）", () => {
  function setupCmd() {
    const terminals = new FakeTerminalManager();
    const bus = new EventBus();
    const events: { event: string; data: unknown }[] = [];
    bus.subscribe((e) => events.push(e as { event: string; data: unknown }));
    const service = makeService(terminals, bus, new FakePersistScheduler());
    return { terminals, events, service };
  }
  const cmd = { shell: "/bin/sh", args: ["-c", "htop"], env: { SODA_COMMAND_ID: "htop", SODA_ACTIVE_PANE_ID: "p2" } };

  it("対象を分割した pane でコマンドを拡大表示で起動し、焦点を移す。環境は pane の環境に重ねる", async () => {
    const { terminals, events, service } = setupCmd();
    const { tab, pane: first } = await service.createWorkspace("/home/u", "w");
    const { pane: source } = await service.splitPane(first.id, "right", undefined);
    events.length = 0;
    const { pane } = await service.openCommandPane(source.id, "/srv/x", cmd);
    const t = service.getTab(tab.id)!;
    expect(Layout.leaves(t.layout)).toEqual([first.id, source.id, pane.id]);
    expect(t.zoomedPaneId).toBe(pane.id);
    expect(t.focusedPaneId).toBe(pane.id);
    expect(pane.cwd).toBe("/srv/x");
    const opts = terminals.createOptions.at(-1)!;
    expect(opts).toMatchObject({ cwd: "/srv/x", shell: "/bin/sh", args: ["-c", "htop"] });
    expect(opts.trackCwd, "独自コマンドの pane には場所の知らせを差し込まない（20260928-windows-pane-cwd の decisions D2）").toBeUndefined();
    expect(opts.env).toMatchObject({ SODA_PANE_ID: pane.id, SODA_COMMAND_ID: "htop", SODA_ACTIVE_PANE_ID: "p2" });
    expect(events.map((e) => e.event)).toEqual(["pane.created", "layout.updated"]);
  });

  it("コマンドが終わると pane が閉じ、焦点は対象へ・拡大表示は開く前（対象が拡大表示なら対象）へ戻る", async () => {
    const { terminals, events, service } = setupCmd();
    const { tab, pane: first } = await service.createWorkspace("/home/u", "w");
    const { pane: source } = await service.splitPane(first.id, "right", undefined);
    service.zoomPane(source.id, "on");
    const { pane } = await service.openCommandPane(source.id, "/home/u", cmd);
    events.length = 0;
    terminals.hosts.get(pane.id)!.fireExit(0);
    await vi.waitFor(() => expect(service.getPane(pane.id)).toBeUndefined());
    const t = service.getTab(tab.id)!;
    expect(t.focusedPaneId).toBe(source.id);
    expect(t.zoomedPaneId).toBe(source.id);
    expect(events.find((e) => e.event === "pane.closed")?.data).toEqual({ paneId: pane.id, successorPaneId: source.id });
  });

  it("利用者が閉じても戻る。閉じ方によらず戻し方の記録は消える（残さない）", async () => {
    const { service } = setupCmd();
    const records = () => (service as unknown as { commandPanes: Map<string, unknown> }).commandPanes;
    const { workspace, tab, pane: first } = await service.createWorkspace("/home/u", "w");
    const { pane: source } = await service.splitPane(first.id, "right", undefined);
    const { pane } = await service.openCommandPane(source.id, "/home/u", cmd);
    expect(records().size).toBe(1);
    await service.closePane(pane.id);
    expect(service.getTab(tab.id)!.focusedPaneId).toBe(source.id);
    expect(service.getTab(tab.id)!.zoomedPaneId).toBeNull();
    expect(records().size).toBe(0);
    // tab ごと閉じる経路（publishPaneClosed）でも消える
    const other = await service.createTab(workspace.id, undefined);
    await service.openCommandPane(other.pane.id, "/home/u", cmd);
    expect(records().size).toBe(1);
    await service.closeTab(other.tab.id);
    expect(records().size).toBe(0);
  });

  it("起動の失敗（猶予中の 0 以外の終了）は spawn_failed で、pane を残さない", async () => {
    const { terminals, events, service } = setupCmd();
    const { pane: source } = await service.createWorkspace("/home/u", "w");
    events.length = 0;
    terminals.nextSpawnFailure = 127;
    await expect(service.openCommandPane(source.id, "/home/u", cmd)).rejects.toMatchObject({ code: "spawn_failed" });
    expect(service.snapshot().panes).toHaveLength(1);
    expect(events.filter((e) => e.event === "pane.created")).toEqual([]);
  });

  it("pane が無ければ not_found", async () => {
    const { service } = setupCmd();
    await service.createWorkspace("/home/u", "w");
    await expect(service.openCommandPane("p999", "/home/u", cmd)).rejects.toMatchObject({ code: "not_found" });
  });

  it("commandContext はモデルから workspace・tab・cwd を引き、既定の場所も返す", async () => {
    const { service } = setupCmd();
    const { workspace, tab, pane } = await service.createWorkspace("/home/u/api", "w");
    expect(service.commandContext(pane.id)).toEqual({ workspaceId: workspace.id, tabId: tab.id, paneId: pane.id, cwd: "/home/u/api", defaultCwd: "/home/u" });
    expect(() => service.commandContext("p999")).toThrow(expect.objectContaining({ code: "not_found" }));
  });

  it("commandEnv は ownPaneId を省くと SODA_PANE_ID を入れず、extra を足す", () => {
    const { service } = setupCmd();
    const env = service.commandEnv(undefined, { SODA_ACTIVE_PANE_ID: "p1", SODA_COMMAND_ID: "x" });
    expect(env["SODA_PANE_ID"]).toBeUndefined();
    expect(env).toMatchObject({ SODA_ACTIVE_PANE_ID: "p1", SODA_COMMAND_ID: "x" });
    expect(service.commandEnv("p7", {})["SODA_PANE_ID"]).toBe("p7");
  });

  it("paneSocketPath を渡すと、pane の環境と独自コマンドの環境の SODA_PANE_SOCKET に入る。渡さなければ入らない（20261003-sodactl-ask-socket）", async () => {
    const build = (paneSocketPath: string | undefined) => {
      const terminals = new FakeTerminalManager();
      const service = new SessionService({
        model: new SessionModel(),
        terminals,
        bus: new EventBus(),
        persist: new FakePersistScheduler(),
        serverVersion: "0.1.0-test",
        host: HOST_INFO,
        scrollbackLines: 1000,
        spawnGraceMs: 5,
        defaultCwd: "/home/u",
        logger: new MemoryLogger(),
        paneSocketPath,
      });
      return { terminals, service };
    };
    const withPath = build("/s/pane.sock");
    await withPath.service.createWorkspace("/home/u", "w");
    expect(withPath.terminals.createOptions[0]?.env?.["SODA_PANE_SOCKET"]).toBe("/s/pane.sock");
    expect(withPath.service.commandEnv(undefined, {})["SODA_PANE_SOCKET"]).toBe("/s/pane.sock");
    expect(withPath.service.commandEnv("p7", {})["SODA_PANE_SOCKET"]).toBe("/s/pane.sock");

    const without = build(undefined);
    await without.service.createWorkspace("/home/u", "w");
    expect(without.terminals.createOptions[0]?.env).toBeDefined();
    expect("SODA_PANE_SOCKET" in (without.terminals.createOptions[0]?.env ?? {})).toBe(false);
    expect("SODA_PANE_SOCKET" in without.service.commandEnv(undefined, {})).toBe(false);
  });

  it("reservePaneId は pane と同じ番号の列から払い出す（衝突しない）", async () => {
    const { service } = setupCmd();
    const { pane } = await service.createWorkspace("/home/u", "w");
    const id = service.reservePaneId();
    const { pane: next } = await service.splitPane(pane.id, "right", undefined);
    expect(new Set([pane.id, id, next.id]).size).toBe(3);
  });
});

// 20261004-group-worktree-items（T9）：サイドバーの並びと所属の保存・復元。
describe("SessionService — layout の復元（保存と復元）", () => {
  const saved = (id: string, extra: Partial<SessionFileData["workspaces"][number]> = {}): SessionFileData["workspaces"][number] => ({
    id,
    label: id,
    cwd: `/home/u/${id}`,
    activeTabId: `t-${id}`,
    tabs: [
      {
        id: `t-${id}`,
        label: "1",
        focusedPaneId: `p-${id}`,
        zoomedPaneId: null,
        layout: { type: "pane", paneId: `p-${id}` },
        panes: [{ id: `p-${id}`, label: null, cwd: `/home/u/${id}`, shell: "" }],
      },
    ],
    ...extra,
  });
  const fileData = (over: Partial<SessionFileData>): SessionFileData => ({
    schema: 1,
    savedAt: "2026-10-04T00:00:00Z",
    groups: [],
    workspaces: [],
    focus: null,
    ...over,
  });
  const make = () => {
    const logger = new MemoryLogger();
    const service = new SessionService({
      model: new SessionModel(),
      terminals: new FakeTerminalManager(),
      bus: new EventBus(),
      persist: new FakePersistScheduler(),
      serverVersion: "0.1.0-test",
      host: HOST_INFO,
      scrollbackLines: 1000,
      spawnGraceMs: 5,
      defaultCwd: "/home/u",
      logger,
    });
    return { service, logger };
  };
  const K = "/repos/app/.git";
  const withGit = { repoKey: K } as const;

  it("layout と repoGroups を戻すと、停止前と同じ並び・所属になり、git は repoKey だけ戻る（ブランチ null・件数 0）", async () => {
    const { service } = make();
    await service.restore(
      fileData({
        groups: [{ id: "g1", label: "work", collapsed: false }],
        // 平らな順はレイアウトと違う（レイアウトが正）。「グループなし」（w3）がグループ g1（app のリポジトリ w1・w2）の前。
        workspaces: [
          saved("w1", { ...withGit, isLinkedWorktree: false, groupId: "g1" }),
          saved("w2", { ...withGit, isLinkedWorktree: true, groupId: "g1" }),
          saved("w3", { repoKey: null }),
        ],
        layout: { top: ["u", "g:g1"], groups: { g1: [`r:${K}`] }, ungrouped: ["w:w3"] },
        repoGroups: { [K]: "g1" },
      }),
    );
    const snap = service.snapshot();
    expect(snap.layout).toEqual({ top: ["u", "g:g1"], groups: { g1: [`r:${K}`] }, ungrouped: ["w:w3"] });
    expect(snap.workspaces.map((w) => w.id)).toEqual(["w3", "w1", "w2"]);
    expect(snap.workspaces.map((w) => w.groupId)).toEqual([null, "g1", "g1"]);
    expect(service.getWorkspace("w1")?.git).toEqual({ branch: null, ahead: 0, behind: 0, repoKey: K, isLinkedWorktree: false });
    expect(service.getWorkspace("w2")?.git?.isLinkedWorktree).toBe(true);
    expect(service.getWorkspace("w3")?.git).toBeNull();
    expect(service.persistedLayout()).toEqual({ layout: snap.layout, repoGroups: { [K]: "g1" } });
  });

  it("壊れた参照（実在しない workspace・グループ・重複・repoKey を持つのに w:）でも起動し、捨てた参照をログに出す", async () => {
    const { service, logger } = make();
    await service.restore(
      fileData({
        groups: [{ id: "g1", label: "work", collapsed: false }],
        workspaces: [saved("w1", { ...withGit }), saved("w2"), saved("w3")],
        layout: {
          top: ["w:gone", "g:g1", "g:g9", "u", "u", "w:w1"],
          groups: { g1: ["w:w3", "w:w3", "r:/gone/.git"], g9: ["w:w2"] },
          ungrouped: ["w:w2", "w:w2"],
        },
        repoGroups: { [K]: "g1", "/other/.git": "g9" },
      }),
    );
    // w:w1 は repoKey を持つので r: へ直る。レイアウトに無いので、覚えているグループ（repoGroups[K] = g1）の末尾へ入る。w3 は g1 の中に残る。
    expect(service.snapshot().layout).toEqual({ top: ["g:g1", "u"], groups: { g1: ["w:w3", `r:${K}`] }, ungrouped: ["w:w2"] });
    expect(service.persistedLayout()?.repoGroups).toEqual({ [K]: "g1" }); // 実在しないグループ行きは捨てる
    expect(service.getWorkspace("w1")?.groupId).toBe("g1");
    const warn = logger.lines.find((e) => e.msg.includes("sidebar layout"));
    expect(warn).toBeDefined();
    expect((warn!.fields?.["dropped"] as string[]).sort()).toEqual(["g:g9", "r:/gone/.git", "u", "w:gone", "w:w1", "w:w2", "w:w2", "w:w3"].sort());
  });

  it("管理外・代表でない workspace（w:<id>）の所属はレイアウトの入れ物が正で、groupId を合わせる。r:<repoKey> は repoGroups が正で、食い違えば覚えているグループへ入る", async () => {
    const { service } = make();
    await service.restore(
      fileData({
        groups: [
          { id: "g1", label: "one", collapsed: false },
          { id: "g2", label: "two", collapsed: false },
        ],
        // w2 は保存の groupId が無いのにレイアウトは g1 の中、w3 は groupId が g1 なのにレイアウトは「グループなし」。
        // w1（リポジトリ K）はレイアウトでは g1 の中だが、repoGroups は g2 を覚えている。
        workspaces: [saved("w1", { ...withGit, isLinkedWorktree: false }), saved("w2"), saved("w3", { groupId: "g1" })],
        layout: { top: ["g:g1", "g:g2", "u"], groups: { g1: [`r:${K}`, "w:w2"], g2: [] }, ungrouped: ["w:w3"] },
        repoGroups: { [K]: "g2" },
      }),
    );
    expect(service.snapshot().layout).toEqual({ top: ["g:g1", "g:g2", "u"], groups: { g1: ["w:w2"], g2: [`r:${K}`] }, ungrouped: ["w:w3"] });
    expect(service.snapshot().workspaces.map((w) => [w.id, w.groupId])).toEqual([
      ["w2", "g1"],
      ["w1", "g2"],
      ["w3", null],
    ]);
  });

  it("レイアウトに無い workspace は「グループなし」の末尾に足す", async () => {
    const { service } = make();
    await service.restore(fileData({ workspaces: [saved("w1"), saved("w2")], layout: { top: ["u"], groups: {}, ungrouped: ["w:w2"] } }));
    expect(service.snapshot().layout).toEqual({ top: ["u"], groups: {}, ungrouped: ["w:w2", "w:w1"] });
    expect(service.snapshot().workspaces.map((w) => w.id)).toEqual(["w2", "w1"]);
  });

  it("layout の無い保存は仮の状態のまま（導いた layout を載せ、書き出さない）。repoKey があれば起動直後から束ねる", async () => {
    const { service } = make();
    await service.restore(
      fileData({
        groups: [{ id: "g1", label: "work", collapsed: false }],
        workspaces: [saved("w1", { ...withGit, isLinkedWorktree: false, groupId: "g1" }), saved("w2"), saved("w3", { ...withGit, isLinkedWorktree: true })],
      }),
    );
    expect(service.persistedLayout()).toBeNull();
    // 本体 w1 の所属 g1 が項目 r:K の所属になる（w3 の groupId は見ない）。
    expect(service.snapshot().layout).toEqual({ top: ["g:g1", "u"], groups: { g1: [`r:${K}`] }, ungrouped: ["w:w2"] });
    expect(service.getWorkspace("w1")?.git?.repoKey).toBe(K);
  });
});

// 20261004-group-worktree-items（T10）：layout の無い保存の移行。仮の状態 → 最初の 1 周の合図（または最初の操作）で 1 回だけ確定する。
describe("SessionService — 移行の確定（仮の状態 → confirmLayout）", () => {
  const saved = (id: string, extra: Partial<SessionFileData["workspaces"][number]> = {}): SessionFileData["workspaces"][number] => ({
    id,
    label: id,
    cwd: `/home/u/${id}`,
    activeTabId: `t-${id}`,
    tabs: [
      {
        id: `t-${id}`,
        label: "1",
        focusedPaneId: `p-${id}`,
        zoomedPaneId: null,
        layout: { type: "pane", paneId: `p-${id}` },
        panes: [{ id: `p-${id}`, label: null, cwd: `/home/u/${id}`, shell: "" }],
      },
    ],
    ...extra,
  });
  const GROUPS = [
    { id: "g1", label: "one", collapsed: false },
    { id: "g2", label: "two", collapsed: false },
  ];
  const fileData = (workspaces: SessionFileData["workspaces"], over: Partial<SessionFileData> = {}): SessionFileData => ({
    schema: 1,
    savedAt: "2026-10-04T00:00:00Z",
    groups: GROUPS,
    workspaces,
    focus: null,
    ...over,
  });
  const K = "/repos/app/.git";
  const body = (id: string, groupId: string | null) => saved(id, { repoKey: K, isLinkedWorktree: false, groupId });
  const tree = (id: string, groupId: string | null) => saved(id, { repoKey: K, isLinkedWorktree: true, groupId });
  const make = () => {
    const bus = new EventBus();
    const persist = new FakePersistScheduler();
    const service = new SessionService({
      model: new SessionModel(),
      terminals: new FakeTerminalManager(),
      bus,
      persist,
      serverVersion: "0.1.0-test",
      host: HOST_INFO,
      scrollbackLines: 1000,
      spawnGraceMs: 5,
      defaultCwd: "/home/u",
      logger: new MemoryLogger(),
    });
    return { service, bus, persist };
  };
  const restored = async (workspaces: SessionFileData["workspaces"]) => {
    const t = make();
    await t.service.restore(fileData(workspaces));
    return t;
  };

  it("別々のグループに居る本体と worktree: 本体の所属に揃う（worktree の workspace.updated が出る）。保存は確定の後に layout を書く", async () => {
    const { service, bus, persist } = await restored([body("w1", "g1"), tree("w2", "g2"), saved("w3")]);
    expect(service.persistedLayout()).toBeNull();
    const events: { event: string; data: unknown }[] = [];
    bus.subscribe((e) => events.push(e));
    persist.touchCount = 0;
    service.confirmLayout();
    expect(service.snapshot().layout).toEqual({ top: ["g:g1", "g:g2", "u"], groups: { g1: [`r:${K}`], g2: [] }, ungrouped: ["w:w3"] });
    expect(service.persistedLayout()).toEqual({ layout: service.snapshot().layout, repoGroups: { [K]: "g1" } });
    expect(service.getWorkspace("w2")?.groupId).toBe("g1");
    // 導いたレイアウトと同じなので sidebar.layout_changed は出ない。groupId が変わった w2 だけ workspace.updated。保存は 1 回予約する。
    expect(events.map((e) => e.event)).toEqual(["workspace.updated"]);
    expect(persist.touchCount).toBe(1);
  });

  it("本体だけがグループに居る: worktree も同じグループに入る", async () => {
    const { service } = await restored([body("w1", "g1"), tree("w2", null)]);
    service.confirmLayout();
    expect(service.persistedLayout()?.repoGroups).toEqual({ [K]: "g1" });
    expect(service.getWorkspace("w2")?.groupId).toBe("g1");
  });

  it("worktree だけがグループに居る（本体は所属なし）: 本体の所属（なし）に揃い、一番上の項目になる", async () => {
    const { service } = await restored([body("w1", null), tree("w2", "g1")]);
    service.confirmLayout();
    expect(service.snapshot().layout).toEqual({ top: ["g:g1", "g:g2", "u"], groups: { g1: [], g2: [] }, ungrouped: [`r:${K}`] });
    expect(service.persistedLayout()?.repoGroups).toEqual({});
    expect(service.getWorkspace("w2")?.groupId).toBeNull();
  });

  it("本体が開かれていない: 最初に開いた worktree の所属になる", async () => {
    const { service } = await restored([tree("w2", "g2"), tree("w3", "g1")]);
    service.confirmLayout();
    expect(service.persistedLayout()?.repoGroups).toEqual({ [K]: "g2" });
    expect(service.getWorkspace("w3")?.groupId).toBe("g2");
  });

  it("単独の workspace（判定なし）は自分の groupId のまま", async () => {
    const { service } = await restored([saved("w1", { groupId: "g1" }), saved("w2")]);
    service.confirmLayout();
    expect(service.snapshot().layout).toEqual({ top: ["g:g1", "g:g2", "u"], groups: { g1: ["w:w1"], g2: [] }, ungrouped: ["w:w2"] });
    expect(service.getWorkspace("w1")?.groupId).toBe("g1");
  });

  it("本体の判定だけが 1 周目で取れなかった（D2）: 取れた worktree の所属で確定し、本体は後から判定が付いてリポジトリの所属に加わる", async () => {
    // 本体 w1 は repoKey を持たない保存（判定前）。worktree w2 は g2。F13 の「本体の g1」とは結果が違いうる場面。
    const { service } = await restored([saved("w1", { groupId: "g1" }), tree("w2", "g2")]);
    service.confirmLayout();
    expect(service.snapshot().layout).toEqual({ top: ["g:g1", "g:g2", "u"], groups: { g1: ["w:w1"], g2: [`r:${K}`] }, ungrouped: [] });
    expect(service.persistedLayout()?.repoGroups).toEqual({ [K]: "g2" });
    // 後から本体の判定が付く: repoGroups が先に見られ、本体は g2 の r:K へ加わる。
    service.updateWorkspaceGit("w1", { kind: "git", git: { branch: "main", ahead: 0, behind: 0, repoKey: K, isLinkedWorktree: false } });
    expect(service.getWorkspace("w1")?.groupId).toBe("g2");
    expect(service.snapshot().layout?.groups).toEqual({ g1: [], g2: [`r:${K}`] });
  });

  it("確定は 1 回だけ: 2 回目の合図は何も配らず、保存も予約しない", async () => {
    const { service, bus, persist } = await restored([body("w1", "g1"), tree("w2", "g2")]);
    service.confirmLayout();
    const events: string[] = [];
    bus.subscribe((e) => events.push(e.event));
    persist.touchCount = 0;
    service.confirmLayout();
    expect(events).toEqual([]);
    expect(persist.touchCount).toBe(0);
  });

  it("確定の前に止めても（layout を書いていない）、次の起動で同じ導き方になる", async () => {
    const files = [body("w1", "g1"), tree("w2", "g2"), saved("w3")];
    const first = await restored(files);
    expect(first.service.persistedLayout()).toBeNull();
    const second = await restored(files);
    expect(second.service.snapshot().layout).toEqual(first.service.snapshot().layout);
    expect(second.service.snapshot().workspaces.map((w) => w.groupId)).toEqual(first.service.snapshot().workspaces.map((w) => w.groupId));
  });

  it("確定の後の保存を復元すると移行はしない（グループの並びが保存のまま）", async () => {
    const { service } = await restored([body("w1", "g1"), tree("w2", "g2")]);
    service.confirmLayout();
    const persisted = service.persistedLayout()!;
    // 保存済みの layout・repoGroups を持つファイル。workspace の groupId は古い値（g2）のままでも、layout と repoGroups が正。
    const next = make();
    await next.service.restore(fileData([body("w1", "g1"), tree("w2", "g2")], { layout: persisted.layout, repoGroups: persisted.repoGroups }));
    expect(next.service.snapshot().layout).toEqual(persisted.layout);
    expect(next.service.getWorkspace("w2")?.groupId).toBe("g1");
    next.service.confirmLayout(); // 仮の状態ではないので何もしない
    expect(next.service.snapshot().layout).toEqual(persisted.layout);
  });

  it("確定のきっかけ (b): 受け付けた並べ替え・グループの操作は確定する。受け付けない移動と rename・畳みは確定しない", async () => {
    const make1 = async () => restored([body("w1", "g1"), tree("w2", "g2"), saved("w3")]);
    // 受け付けない移動（端での move_by・自分自身の前）は確定しない。
    const a = await make1();
    expect(a.service.moveItemBy({ kind: "group", groupId: "g1" }, "previous")).toEqual({ moved: false });
    expect(a.service.moveItem({ kind: "workspace", workspaceId: "w3" }, { kind: "workspace", workspaceId: "w3" })).toEqual({ moved: false });
    a.service.renameGroup("g1", "renamed");
    a.service.toggleGroupCollapsed("g1");
    expect(a.service.persistedLayout()).toBeNull();
    // 受け付けた操作は確定し、その操作の結果が layout に載る。
    const b = await make1();
    expect(b.service.moveItemBy({ kind: "group", groupId: "g2" }, "previous")).toEqual({ moved: true });
    expect(b.service.persistedLayout()).not.toBeNull();
    expect(b.service.snapshot().layout?.top).toEqual(["g:g2", "g:g1", "u"]);
    const c = await make1();
    c.service.addToGroup("w3", "g2");
    expect(c.service.persistedLayout()?.layout.groups["g2"]).toEqual(["w:w3"]);
    const d = await make1();
    d.service.createGroup("new", "w3");
    expect(d.service.persistedLayout()).not.toBeNull();
    const e = await make1();
    e.service.deleteGroup("g2");
    expect(e.service.persistedLayout()).not.toBeNull();
    const f = await make1();
    f.service.removeFromGroup("w1");
    expect(f.service.persistedLayout()?.repoGroups).toEqual({});
    const g = await make1();
    g.service.moveWorkspacesTo(["w3"], null);
    expect(g.service.persistedLayout()).not.toBeNull();
  });
});
