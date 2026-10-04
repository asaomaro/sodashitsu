import { TERMINAL_PALETTES, type HostInfo } from "@sodashitsu/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Disposable } from "../../util/Disposable.js";
import { MemoryLogger } from "../../log/Logger.js";
import { EventBus } from "../../bus/EventBus.js";
import type { CreatePaneOptions, TerminalManager } from "../../terminal/TerminalManager.js";
import type { TerminalHost } from "../../terminal/TerminalHost.js";
import type { OutputFanout, ClientSink } from "../../terminal/OutputFanout.js";
import type { PersistScheduler } from "../../session/PersistScheduler.js";
import { SessionModel } from "../../session/SessionModel.js";
import { SessionService } from "../../session/SessionService.js";
import { DefaultClientRegistry } from "../../clients/ClientRegistry.js";
import { DefaultSizeAuthority } from "../../clients/SizeAuthority.js";
import { answerPaletteFor } from "../../clients/answerPalette.js";
import { ControlSurface } from "../ControlSurface.js";
import { registerAllMethods } from "./index.js";
import type { GitInfoPoller } from "../../git/GitInfoPoller.js";
import type { WorktreeService } from "../../git/WorktreeService.js";
import type { AgentIntegrationService } from "../../agent/AgentIntegrationService.js";
import type { NewCwdDeps } from "../../session/newCwd.js";
import type { WorkspaceLabelDeps } from "../../session/workspaceLabel.js";

class FakeFanout implements OutputFanout {
  readonly subscribed: string[] = [];
  readonly unsubscribed: string[] = [];
  subscribe(sink: ClientSink): void {
    this.subscribed.push(sink.clientId);
  }
  unsubscribe(clientId: string): void {
    this.unsubscribed.push(clientId);
  }
  push(): void {
    // no-op
  }
  retryStale(): void {
    // no-op
  }
}

/** 20260924-dark-mode-report。呼ばれた回数だけ数える——`Mirror` 全体を実装する必要は無い。 */
class FakeMirror {
  notifyAppearanceMayHaveChangedCalls = 0;
  plainText(): string {
    return "";
  }
  notifyAppearanceMayHaveChanged(): void {
    this.notifyAppearanceMayHaveChangedCalls++;
  }
}

class FakeHost implements TerminalHost {
  readonly pid = 1;
  readonly mirror = new FakeMirror() as unknown as TerminalHost["mirror"];
  readonly fanout = new FakeFanout();
  private readonly exitListeners = new Set<(code: number) => void>();
  constructor(
    readonly paneId: string,
    failWithCode: number | null,
  ) {
    if (failWithCode !== null) {
      queueMicrotask(() => this.fireExit(failWithCode));
    }
  }
  write(): void {}
  writeModal(): Promise<void> {
    return Promise.resolve();
  }
  resize(): void {}
  lastOutputAt(): number {
    return Date.now();
  }
  onExit(cb: (code: number) => void): Disposable {
    this.exitListeners.add(cb);
    return { dispose: () => this.exitListeners.delete(cb) };
  }
  dispose(): void {}
  fireExit(code: number): void {
    for (const fn of [...this.exitListeners]) fn(code);
  }
}

class FakeTerminalManager implements TerminalManager {
  readonly hosts = new Map<string, FakeHost>();
  /** 次に create するとき、この終了コードで即座に失敗させる（null なら成功）。 */
  nextSpawnFailure: number | null = null;
  create(paneId: string, _opts: CreatePaneOptions): TerminalHost {
    const host = new FakeHost(paneId, this.nextSpawnFailure);
    this.nextSpawnFailure = null;
    this.hosts.set(paneId, host);
    return host;
  }
  get(paneId: string): TerminalHost | undefined {
    return this.hosts.get(paneId);
  }
  resize(): void {
    // no-op
  }
  dispose(paneId: string): void {
    this.hosts.delete(paneId);
  }
}

class NoopPersist implements PersistScheduler {
  touch(): void {}
  async flush(): Promise<void> {}
  cancel(): void {}
}

const HOST_INFO: HostInfo = { os: "linux", windowsBuild: null, hostname: "test" };
const fakeSink = (clientId: string): ClientSink => ({ clientId, sendOutput: () => undefined, sendSnapshot: () => undefined, bufferedAmount: 0 });

function makeContext(newCwdDeps?: NewCwdDeps) {
  // 名前を確かめるテストがあるので、手元の fs に依存させない（20260921-workspace-auto-label。git のリポジトリは無い）。
  const workspaceLabelDeps: WorkspaceLabelDeps = { stat: async () => null, readFile: async () => null, home: () => "/home/u" };
  const terminals = new FakeTerminalManager();
  const session = new SessionService({
    model: new SessionModel(),
    terminals,
    bus: new EventBus(),
    persist: new NoopPersist(),
    serverVersion: "test",
    host: HOST_INFO,
    scrollbackLines: 1000,
    spawnGraceMs: 1,
    defaultCwd: "/home/u",
    newCwdDeps,
    workspaceLabelDeps,
    logger: new MemoryLogger(),
  });
  const clients = new DefaultClientRegistry();
  const sizeAuthority = new DefaultSizeAuthority(clients, session);
  const surface = new ControlSurface(new MemoryLogger());
  const gitPoller = new FakeGitInfoPoller();
  registerAllMethods(surface, { session, clients, sizeAuthority, terminals, worktrees: stubWorktrees(), agentIntegrations: stubAgentIntegrations(), gitPoller });
  return { terminals, session, clients, surface, gitPoller };
}

describe("registerAllMethods — client / workspace / tab / pane flow", () => {
  let ctx: Awaited<ReturnType<typeof makeContext>>;
  let clientId: string;

  beforeEach(() => {
    ctx = makeContext();
    clientId = ctx.clients.register();
  });

  it("client.theme は表示しているテーマを覚える。知らない名前は invalid_params（20260921-theme-settings）", async () => {
    const c = { clientId, sink: fakeSink(clientId) };
    expect(ctx.clients.get(clientId)?.theme).toBeNull();
    expect((await ctx.surface.invoke(c, "client.theme", { theme: "gruvbox-light" })).ok).toBe(true);
    expect(ctx.clients.get(clientId)?.theme).toBe("gruvbox-light");
    const bad = await ctx.surface.invoke(c, "client.theme", { theme: "terminal" });
    expect(bad.ok).toBe(false);
    if (bad.ok) throw new Error("unreachable");
    expect(bad.error.code).toBe("invalid_params");
    expect(ctx.clients.get(clientId)?.theme).toBe("gruvbox-light");
  });

  // 20260924-dark-mode-report。design「インターフェース / データ構造 > client.ts」。
  it("client.theme は、全 pane の Mirror.notifyAppearanceMayHaveChanged を呼ぶ（push のトリガー）", async () => {
    const c = { clientId, sink: fakeSink(clientId) };
    const { pane: p1 } = await ctx.session.createWorkspace("/home/u", "w1");
    const { pane: p2 } = await ctx.session.createWorkspace("/home/u2", "w2");
    const m1 = ctx.terminals.get(p1.id)!.mirror as unknown as FakeMirror;
    const m2 = ctx.terminals.get(p2.id)!.mirror as unknown as FakeMirror;

    await ctx.surface.invoke(c, "client.theme", { theme: "nord" });

    expect(m1.notifyAppearanceMayHaveChangedCalls).toBe(1);
    expect(m2.notifyAppearanceMayHaveChangedCalls).toBe(1);
  });

  it("client.theme が invalid_params で失敗しても、pane への通知は呼ばない（副作用が漏れない）", async () => {
    const c = { clientId, sink: fakeSink(clientId) };
    const { pane } = await ctx.session.createWorkspace("/home/u", "w1");
    const m = ctx.terminals.get(pane.id)!.mirror as unknown as FakeMirror;

    const bad = await ctx.surface.invoke(c, "client.theme", { theme: "terminal" });

    expect(bad.ok).toBe(false);
    expect(m.notifyAppearanceMayHaveChangedCalls).toBe(0);
  });

  it("作る方式（tab・workspace・分割）は、作る前に作った人の操作の時刻を進める——起動の猶予の間の色の問い合わせにも作った人の配色で答える（20260921-theme-settings の decisions D13）", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(1_000);
      const creator = ctx.clients.register("desktop");
      const other = ctx.clients.register("desktop");
      ctx.clients.setTheme(creator, "catppuccin-latte");
      ctx.clients.setTheme(other, "vesper");
      const { workspace, pane } = await ctx.session.createWorkspace("/home/u", "w");
      const deps = { getPane: (id: string) => ctx.session.getPane(id), getTab: (id: string) => ctx.session.getTab(id), clients: ctx.clients };
      for (const [method, params] of [
        ["tab.create", { workspaceId: workspace.id }],
        ["workspace.create", { cwd: "/home/u" }],
        ["pane.split", { paneId: pane.id, direction: "right" }],
        ["pane.edit_scrollback", { paneId: pane.id }], // 20260926-edit-scrollback
      ] as const) {
        vi.setSystemTime(Date.now() + 1_000);
        ctx.clients.touch(other); // 別の人が後から操作した
        vi.setSystemTime(Date.now() + 1_000);
        const pending = ctx.surface.invoke({ clientId: creator, sink: fakeSink(creator) }, method, params as never);
        // 作っている途中（まだモデルに入っていない pane）の問い合わせにも、作った人の配色で答える。
        expect(answerPaletteFor("not-yet-committed", deps), method).toBe(TERMINAL_PALETTES["catppuccin-latte"]);
        expect((await pending).ok, method).toBe(true);
      }
    } finally {
      vi.useRealTimers();
      await ctx.session.disposeScrollbackEditors();
    }
  });

  it("client.hello sets the kind and returns a snapshot", async () => {
    const result = await ctx.surface.invoke({ clientId, sink: fakeSink(clientId) }, "client.hello", { protocol: 1, kind: "mobile" });
    expect(result.ok).toBe(true);
    expect(ctx.clients.get(clientId)?.kind).toBe("mobile");
    if (!result.ok) throw new Error("unreachable");
    expect((result.result as { snapshot: { workspaces: unknown[] } }).snapshot.workspaces).toEqual([]);
  });

  it("モバイルは client.view だけでは権限を取らず、client.fit を有効にすると取り、無効にすると手放す（D13・D106）", async () => {
    const c = { clientId, sink: fakeSink(clientId) };
    await ctx.surface.invoke(c, "client.hello", { protocol: 1, kind: "mobile" });
    const { tab, pane } = await ctx.session.createWorkspace("/home/u", "api");
    const sizeBefore = { cols: ctx.session.getPane(pane.id)!.cols, rows: ctx.session.getPane(pane.id)!.rows };

    const view = { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 40, rows: 20 }] };
    expect((await ctx.surface.invoke(c, "client.view", view)).ok).toBe(true);
    expect(ctx.session.getTab(tab.id)?.sizeOwnerClientId).toBeNull();
    expect(ctx.session.getPane(pane.id)).toMatchObject(sizeBefore);

    expect((await ctx.surface.invoke(c, "client.fit", { enabled: true })).ok).toBe(true);
    expect(ctx.session.getTab(tab.id)?.sizeOwnerClientId).toBe(clientId);
    expect(ctx.session.getPane(pane.id)).toMatchObject({ cols: 40, rows: 20 });

    expect((await ctx.surface.invoke(c, "client.fit", { enabled: false })).ok).toBe(true);
    expect(ctx.session.getTab(tab.id)?.sizeOwnerClientId).toBeNull();
    await ctx.surface.invoke(c, "client.view", { ...view, visible: [{ paneId: pane.id, cols: 30, rows: 15 }] });
    expect(ctx.session.getPane(pane.id)).toMatchObject({ cols: 40, rows: 20 }); // 手放した後の申告では動かさない
  });

  it("client.hello で fit なしのモバイルに変わったら、デスクトップとして持っていた権限を手放す（D106）", async () => {
    const c = { clientId, sink: fakeSink(clientId) };
    await ctx.surface.invoke(c, "client.hello", { protocol: 1, kind: "desktop" });
    const { tab, pane } = await ctx.session.createWorkspace("/home/u", "api");
    await ctx.surface.invoke(c, "client.view", { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 60, rows: 30 }] });
    expect(ctx.session.getTab(tab.id)?.sizeOwnerClientId).toBe(clientId);

    expect((await ctx.surface.invoke(c, "client.hello", { protocol: 1, kind: "mobile" })).ok).toBe(true);

    expect(ctx.session.getTab(tab.id)?.sizeOwnerClientId).toBeNull();
    expect(ctx.session.getPane(pane.id)).toMatchObject({ cols: 60, rows: 30 });
  });

  it("workspace.create → tab.create → pane.split round trip, and pane.focus notes size ownership", async () => {
    const c = { clientId, sink: fakeSink(clientId) };
    const wsResult = await ctx.surface.invoke(c, "workspace.create", { cwd: "/home/u/api", label: "api" });
    expect(wsResult.ok).toBe(true);
    if (!wsResult.ok) throw new Error("unreachable");
    const { workspace, tab, pane } = wsResult.result as { workspace: { id: string }; tab: { id: string }; pane: { id: string } };

    const tabResult = await ctx.surface.invoke(c, "tab.create", { workspaceId: workspace.id, label: "logs" });
    expect(tabResult.ok).toBe(true);

    const splitResult = await ctx.surface.invoke(c, "pane.split", { paneId: pane.id, direction: "right" });
    expect(splitResult.ok).toBe(true);
    if (!splitResult.ok) throw new Error("unreachable");
    const newPane = (splitResult.result as { pane: { id: string } }).pane;

    const focusResult = await ctx.surface.invoke(c, "pane.focus", { paneId: newPane.id });
    expect(focusResult.ok).toBe(true);
    expect(ctx.session.getTab(tab.id)).toBeDefined();
  });

  it("workspace.create は gitPoller.pollWorkspaceNow の完了を待たずに応答する（fire-and-forget。20260925-workspace-git-immediate。AC1・AC3。taskcheck T3 round1 で強化）", async () => {
    const c = { clientId, sink: fakeSink(clientId) };
    const wsResult = await ctx.surface.invoke(c, "workspace.create", { cwd: "/home/u", label: "api" });
    expect(wsResult.ok).toBe(true);
    if (!wsResult.ok) throw new Error("unreachable");
    const { workspace } = wsResult.result as { workspace: { id: string } };
    // FakeGitInfoPoller.pollWorkspaceNow は releasePending() を呼ぶまで解決しない。
    // それでも invoke() が（ハングせずに）返ってきた＝応答は pollWorkspaceNow の完了を
    // 待っていないことの直接の証拠（await していれば invoke() 自体がここまで到達しない）。
    expect(ctx.gitPoller.polledWorkspaceIds).toEqual([]); // まだ完了させていない
    ctx.gitPoller.releasePending();
    await Promise.resolve();
    expect(ctx.gitPoller.polledWorkspaceIds).toEqual([workspace.id]); // 正しい id で呼ばれていた
  });

  it("tab.move reorders tabIds and emits workspace.updated; a second tab is required (20260923-missing-keybinding-actions)", async () => {
    const c = { clientId, sink: fakeSink(clientId) };
    const wsResult = await ctx.surface.invoke(c, "workspace.create", { cwd: "/home/u", label: "api" });
    if (!wsResult.ok) throw new Error("unreachable");
    const { workspace, tab: firstTab } = wsResult.result as { workspace: { id: string }; tab: { id: string } };
    const tabResult = await ctx.surface.invoke(c, "tab.create", { workspaceId: workspace.id, label: "second" });
    if (!tabResult.ok) throw new Error("unreachable");
    const { tab: secondTab } = tabResult.result as { tab: { id: string } };

    const moveResult = await ctx.surface.invoke(c, "tab.move", { tabId: firstTab.id, direction: "next" });
    expect(moveResult).toEqual({ ok: true, result: {} });
    expect(ctx.session.snapshot().workspaces.find((w) => w.id === workspace.id)?.tabIds).toEqual([secondTab.id, firstTab.id]);
  });

  it("tab.move on an unknown tab returns not_found", async () => {
    const c = { clientId, sink: fakeSink(clientId) };
    const result = await ctx.surface.invoke(c, "tab.move", { tabId: "t999", direction: "next" });
    expect(result).toEqual({ ok: false, error: { code: "not_found", message: expect.stringContaining("t999") } });
  });

  it("pane.focus on an unknown pane returns not_found", async () => {
    const c = { clientId, sink: fakeSink(clientId) };
    const result = await ctx.surface.invoke(c, "pane.focus", { paneId: "p999" });
    expect(result).toEqual({ ok: false, error: { code: "not_found", message: expect.stringContaining("p999") } });
  });

  it("a shell that fails to start turns workspace.create into spawn_failed", async () => {
    const c = { clientId, sink: fakeSink(clientId) };
    ctx.terminals.nextSpawnFailure = 1; // execvp 失敗を模する（D37）
    const result = await ctx.surface.invoke(c, "workspace.create", { cwd: "/home/u", label: "x" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("spawn_failed");
  });

  it("pane.subscribe wires the client sink into the pane's fanout and returns its size", async () => {
    const c = { clientId, sink: fakeSink(clientId) };
    const wsResult = await ctx.surface.invoke(c, "workspace.create", { cwd: "/home/u", label: "api" });
    if (!wsResult.ok) throw new Error("unreachable");
    const { pane } = wsResult.result as { pane: { id: string; cols: number; rows: number } };

    const subResult = await ctx.surface.invoke(c, "pane.subscribe", { paneId: pane.id, scrollbackLines: 500 });
    expect(subResult).toEqual({ ok: true, result: { cols: pane.cols, rows: pane.rows } });
    const fanout = ctx.terminals.get(pane.id)!.fanout as FakeFanout;
    expect(fanout.subscribed).toEqual([clientId]);
    expect(ctx.clients.subscriptions(clientId)).toEqual([pane.id]);

    await ctx.surface.invoke(c, "pane.unsubscribe", { paneId: pane.id });
    expect(fanout.unsubscribed).toEqual([clientId]);
    expect(ctx.clients.subscriptions(clientId)).toEqual([]);
  });

  it("pane.subscribe on an unknown pane returns not_found", async () => {
    const c = { clientId, sink: fakeSink(clientId) };
    const result = await ctx.surface.invoke(c, "pane.subscribe", { paneId: "p999", scrollbackLines: 100 });
    expect(result).toEqual({ ok: false, error: { code: "not_found", message: expect.stringContaining("p999") } });
  });

  it("pane.edit_scrollback はエディタの pane を作って返し、同じ tab で拡大表示にする（20260926-edit-scrollback の AC1）", async () => {
    const c = { clientId, sink: fakeSink(clientId) };
    const { tab, pane } = await ctx.session.createWorkspace("/home/u", "api");
    try {
      const result = await ctx.surface.invoke(c, "pane.edit_scrollback", { paneId: pane.id });
      if (!result.ok) throw new Error(`unexpected error: ${JSON.stringify(result.error)}`);
      const editor = (result.result as { pane: { id: string; tabId: string } }).pane;
      expect(editor.tabId).toBe(tab.id);
      expect(ctx.session.getTab(tab.id)?.zoomedPaneId).toBe(editor.id);
    } finally {
      await ctx.session.disposeScrollbackEditors();
    }
  });

  it("pane.edit_scrollback を送ったクライアントが、エディタの pane の tab のサイズ権限を取る（分割と同じ）", async () => {
    const owner = ctx.clients.register("desktop");
    const other = ctx.clients.register("desktop");
    const { tab, pane } = await ctx.session.createWorkspace("/home/u", "api");
    await ctx.surface.invoke({ clientId: owner, sink: fakeSink(owner) }, "client.view", { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 60, rows: 30 }] });
    expect(ctx.session.getTab(tab.id)?.sizeOwnerClientId).toBe(owner);
    try {
      expect((await ctx.surface.invoke({ clientId: other, sink: fakeSink(other) }, "pane.edit_scrollback", { paneId: pane.id })).ok).toBe(true);
      expect(ctx.session.getTab(tab.id)?.sizeOwnerClientId).toBe(other);
    } finally {
      await ctx.session.disposeScrollbackEditors();
    }
  });

  it("pane.edit_scrollback の失敗は既存のエラーコードで返す（無い pane は not_found・paneId が無ければ invalid_params）", async () => {
    const c = { clientId, sink: fakeSink(clientId) };
    expect(await ctx.surface.invoke(c, "pane.edit_scrollback", { paneId: "p999" })).toEqual({
      ok: false,
      error: { code: "not_found", message: expect.stringContaining("p999") },
    });
    expect(await ctx.surface.invoke(c, "pane.edit_scrollback", {})).toMatchObject({ ok: false, error: { code: "invalid_params" } });
  });

  it("workspace.close cascades and, when it was the last workspace, a new one appears (D24)", async () => {
    const c = { clientId, sink: fakeSink(clientId) };
    const wsResult = await ctx.surface.invoke(c, "workspace.create", { cwd: "/home/u", label: "api" });
    if (!wsResult.ok) throw new Error("unreachable");
    const { workspace } = wsResult.result as { workspace: { id: string } };

    const closeResult = await ctx.surface.invoke(c, "workspace.close", { workspaceId: workspace.id });
    expect(closeResult).toEqual({ ok: true, result: {} });
    expect(ctx.session.snapshot().workspaces.length).toBe(1);
    expect(ctx.session.snapshot().workspaces[0]!.id).not.toBe(workspace.id);
  });

  // 20260923-workspace-grouping。
  it("workspace.move reorders workspaces (previous/next)", async () => {
    const c = { clientId, sink: fakeSink(clientId) };
    const r1 = await ctx.surface.invoke(c, "workspace.create", { cwd: "/a", label: "a" });
    const r2 = await ctx.surface.invoke(c, "workspace.create", { cwd: "/b", label: "b" });
    if (!r1.ok || !r2.ok) throw new Error("unreachable");
    const w1 = (r1.result as { workspace: { id: string } }).workspace;
    const w2 = (r2.result as { workspace: { id: string } }).workspace;

    const moveResult = await ctx.surface.invoke(c, "workspace.move", { workspaceId: w1.id, direction: "next" });
    expect(moveResult).toEqual({ ok: true, result: {} });
    expect(ctx.session.snapshot().workspaces.map((w) => w.id)).toEqual([w2.id, w1.id]);
  });

  it("workspace.move_to moves a block of workspace ids together", async () => {
    const c = { clientId, sink: fakeSink(clientId) };
    const r1 = await ctx.surface.invoke(c, "workspace.create", { cwd: "/a", label: "a" });
    const r2 = await ctx.surface.invoke(c, "workspace.create", { cwd: "/b", label: "b" });
    const r3 = await ctx.surface.invoke(c, "workspace.create", { cwd: "/c", label: "c" });
    if (!r1.ok || !r2.ok || !r3.ok) throw new Error("unreachable");
    const w1 = (r1.result as { workspace: { id: string } }).workspace;
    const w2 = (r2.result as { workspace: { id: string } }).workspace;
    const w3 = (r3.result as { workspace: { id: string } }).workspace;

    const moveResult = await ctx.surface.invoke(c, "workspace.move_to", { workspaceIds: [w2.id, w3.id], beforeWorkspaceId: w1.id });
    expect(moveResult).toEqual({ ok: true, result: {} });
    expect(ctx.session.snapshot().workspaces.map((w) => w.id)).toEqual([w2.id, w3.id, w1.id]);
  });

  it("workspace.close with closeLinkedWorktrees=true closes linked worktrees sharing the same repoKey", async () => {
    const c = { clientId, sink: fakeSink(clientId) };
    const r1 = await ctx.surface.invoke(c, "workspace.create", { cwd: "/repo", label: "main" });
    const r2 = await ctx.surface.invoke(c, "workspace.create", { cwd: "/repo-wt", label: "wt" });
    if (!r1.ok || !r2.ok) throw new Error("unreachable");
    const main = (r1.result as { workspace: { id: string } }).workspace;
    const wt = (r2.result as { workspace: { id: string } }).workspace;
    ctx.session.updateWorkspaceGit(main.id, { kind: "git", git: { branch: "main", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: false } });
    ctx.session.updateWorkspaceGit(wt.id, { kind: "git", git: { branch: "feature", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: true } });

    const closeResult = await ctx.surface.invoke(c, "workspace.close", { workspaceId: main.id, closeLinkedWorktrees: true });
    expect(closeResult).toEqual({ ok: true, result: {} });
    const remainingIds = ctx.session.snapshot().workspaces.map((w) => w.id);
    expect(remainingIds).not.toContain(main.id);
    expect(remainingIds).not.toContain(wt.id);
  });

  it("group.create / rename / add_member / remove_member / toggle_collapsed / delete round-trip", async () => {
    const c = { clientId, sink: fakeSink(clientId) };
    const wsResult = await ctx.surface.invoke(c, "workspace.create", { cwd: "/home/u", label: "api" });
    if (!wsResult.ok) throw new Error("unreachable");
    const { workspace } = wsResult.result as { workspace: { id: string } };

    const createResult = await ctx.surface.invoke(c, "group.create", { label: "backend" });
    if (!createResult.ok) throw new Error("unreachable");
    const group = (createResult.result as { group: { id: string; label: string; collapsed: boolean } }).group;
    expect(group).toEqual({ id: "g1", label: "backend", collapsed: false });

    expect(await ctx.surface.invoke(c, "group.rename", { groupId: group.id, label: "frontend" })).toEqual({ ok: true, result: {} });
    expect(await ctx.surface.invoke(c, "group.toggle_collapsed", { groupId: group.id })).toEqual({ ok: true, result: {} });
    expect(ctx.session.snapshot().groups.find((g) => g.id === group.id)?.collapsed).toBe(true);
    expect(await ctx.surface.invoke(c, "group.add_member", { groupId: group.id, workspaceId: workspace.id })).toEqual({ ok: true, result: {} });
    expect(ctx.session.snapshot().workspaces.find((w) => w.id === workspace.id)?.groupId).toBe(group.id);

    expect(await ctx.surface.invoke(c, "group.remove_member", { workspaceId: workspace.id })).toEqual({ ok: true, result: {} });
    expect(ctx.session.snapshot().workspaces.find((w) => w.id === workspace.id)?.groupId).toBeNull();

    expect(await ctx.surface.invoke(c, "group.delete", { groupId: group.id })).toEqual({ ok: true, result: {} });
    expect(ctx.session.snapshot().groups).toEqual([]);
  });

  it("group.rename on an unknown group returns not_found", async () => {
    const c = { clientId, sink: fakeSink(clientId) };
    const result = await ctx.surface.invoke(c, "group.rename", { groupId: "g999", label: "x" });
    expect(result).toEqual({ ok: false, error: { code: "not_found", message: expect.stringContaining("g999") } });
  });

  // 20261004-group-worktree-items T7。グループの入口は項目単位（リポジトリは worktree グループ丸ごと）。
  describe("項目単位のグループ操作と一括クローズ", () => {
    const git = (isLinkedWorktree: boolean) => ({ branch: "b", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree });
    async function repoWithTwo(c: { clientId: string; sink: ReturnType<typeof fakeSink> }) {
      const r1 = await ctx.surface.invoke(c, "workspace.create", { cwd: "/repo", label: "main" });
      const r2 = await ctx.surface.invoke(c, "workspace.create", { cwd: "/repo-wt", label: "wt" });
      const r3 = await ctx.surface.invoke(c, "workspace.create", { cwd: "/other", label: "other" });
      if (!r1.ok || !r2.ok || !r3.ok) throw new Error("unreachable");
      const id = (r: { result: unknown }) => (r.result as { workspace: { id: string } }).workspace.id;
      const [main, wt, other] = [id(r1), id(r2), id(r3)];
      ctx.session.updateWorkspaceGit(main, { kind: "git", git: git(false) });
      ctx.session.updateWorkspaceGit(wt, { kind: "git", git: git(true) });
      return { main, wt, other };
    }
    const groupIdsOf = (ids: string[]) => ids.map((i) => ctx.session.snapshot().workspaces.find((w) => w.id === i)?.groupId);

    it("group.create に workspaceId を渡すと、その項目（worktree グループ丸ごと）が新しいグループへ入り、位置にグループが立つ", async () => {
      const c = { clientId, sink: fakeSink(clientId) };
      const { main, wt, other } = await repoWithTwo(c);
      const result = await ctx.surface.invoke(c, "group.create", { label: "work", workspaceId: wt });
      if (!result.ok) throw new Error("unreachable");
      const group = (result.result as { group: { id: string } }).group;
      expect(groupIdsOf([main, wt, other])).toEqual([group.id, group.id, null]);
      expect(ctx.session.snapshot().layout).toEqual({ top: [`g:${group.id}`, `w:${other}`], groups: { [group.id]: ["r:/repo/.git"] } });
    });

    it("group.create に実在しない workspaceId を渡すと not_found で、グループは作られない", async () => {
      const c = { clientId, sink: fakeSink(clientId) };
      const result = await ctx.surface.invoke(c, "group.create", { label: "x", workspaceId: "w999" });
      expect(result).toEqual({ ok: false, error: { code: "not_found", message: expect.stringContaining("w999") } });
      expect(ctx.session.snapshot().groups).toEqual([]);
    });

    it("group.add_member / remove_member は子を指しても項目丸ごと動かし、出した項目はグループの直後へ置く", async () => {
      const c = { clientId, sink: fakeSink(clientId) };
      const { main, wt, other } = await repoWithTwo(c);
      const created = await ctx.surface.invoke(c, "group.create", { label: "g" });
      if (!created.ok) throw new Error("unreachable");
      const gid = (created.result as { group: { id: string } }).group.id;

      expect(await ctx.surface.invoke(c, "group.add_member", { groupId: gid, workspaceId: wt })).toEqual({ ok: true, result: {} });
      expect(groupIdsOf([main, wt, other])).toEqual([gid, gid, null]);
      expect(ctx.session.snapshot().layout?.groups[gid]).toEqual(["r:/repo/.git"]);

      expect(await ctx.surface.invoke(c, "group.remove_member", { workspaceId: wt })).toEqual({ ok: true, result: {} });
      expect(groupIdsOf([main, wt, other])).toEqual([null, null, null]);
      expect(ctx.session.snapshot().layout?.top).toEqual([`w:${other}`, `g:${gid}`, "r:/repo/.git"]); // グループは作った時点で末尾（other の後ろ）。出した項目はその直後
    });

    it("group.delete は項目をグループのあった位置へ出し、同じリポジトリの所属も消える", async () => {
      const c = { clientId, sink: fakeSink(clientId) };
      const { main, wt, other } = await repoWithTwo(c);
      const created = await ctx.surface.invoke(c, "group.create", { label: "g", workspaceId: main });
      if (!created.ok) throw new Error("unreachable");
      const gid = (created.result as { group: { id: string } }).group.id;
      expect(await ctx.surface.invoke(c, "group.delete", { groupId: gid })).toEqual({ ok: true, result: {} });
      expect(groupIdsOf([main, wt, other])).toEqual([null, null, null]);
      expect(ctx.session.snapshot().layout).toEqual({ top: ["r:/repo/.git", `w:${other}`], groups: {} });
    });

    it("workspace.close の一括クローズは、worktree グループがグループに入っていても同じリポジトリを全部閉じる", async () => {
      const c = { clientId, sink: fakeSink(clientId) };
      const { main, wt, other } = await repoWithTwo(c);
      await ctx.surface.invoke(c, "group.create", { label: "g", workspaceId: main });
      const result = await ctx.surface.invoke(c, "workspace.close", { workspaceId: main, closeLinkedWorktrees: true });
      expect(result).toEqual({ ok: true, result: {} });
      expect(ctx.session.snapshot().workspaces.map((w) => w.id)).toEqual([other]);
      void wt;
    });

    it("workspace.close の一括クローズは、先頭でない子を指すと、その 1 つだけ閉じる", async () => {
      const c = { clientId, sink: fakeSink(clientId) };
      const { main, wt, other } = await repoWithTwo(c);
      const r4 = await ctx.surface.invoke(c, "workspace.create", { cwd: "/repo-wt2", label: "wt2" });
      if (!r4.ok) throw new Error("unreachable");
      const wt2 = (r4.result as { workspace: { id: string } }).workspace.id;
      ctx.session.updateWorkspaceGit(wt2, { kind: "git", git: git(true) });
      await ctx.surface.invoke(c, "workspace.close", { workspaceId: wt, closeLinkedWorktrees: true });
      expect(ctx.session.snapshot().workspaces.map((w) => w.id).sort()).toEqual([main, other, wt2].sort());
    });
  });
});

// 入口が `newCwd` を落とさず `SessionService` へ渡すこと（20260921-new-terminal-cwd の T4）。場所を決める規則そのものは
// `session/newCwd.test.ts`、作成との結び付きは `session/SessionService.test.ts` が見るので、ここは 3 つの入口の結線だけ。
describe("registerAllMethods — 新しく開く場所（newCwd）", () => {
  const deps: NewCwdDeps = {
    liveCwd: async () => null,
    hintCwd: () => null,
    recordedCwd: () => undefined,
    home: () => "/home/me",
    currentDir: "/srv/start",
    isUsableDir: async (path) => path !== "/nope",
  };

  it("3 つの入口が newCwd の場所で開き、使えない場所なら cwdFallback を返す", async () => {
    const ctx = makeContext(deps);
    const clientId = ctx.clients.register();
    const c = { clientId, sink: fakeSink(clientId) };
    const home = { policy: "home" } as const;

    const wsResult = await ctx.surface.invoke(c, "workspace.create", { label: "a", newCwd: home });
    if (!wsResult.ok) throw new Error(JSON.stringify(wsResult.error));
    const created = wsResult.result as {
      workspace: { id: string; cwd: string };
      pane: { id: string; cwd: string };
    };
    expect(created.pane.cwd).toBe("/home/me");
    expect(created.workspace.cwd).toBe("/home/me");

    const tabResult = await ctx.surface.invoke(c, "tab.create", {
      workspaceId: created.workspace.id,
      newCwd: { policy: "current" },
    });
    if (!tabResult.ok) throw new Error(JSON.stringify(tabResult.error));
    expect((tabResult.result as { pane: { cwd: string } }).pane.cwd).toBe("/srv/start");

    const splitResult = await ctx.surface.invoke(c, "pane.split", {
      paneId: created.pane.id,
      direction: "right",
      newCwd: { policy: "path", path: "/nope" },
    });
    if (!splitResult.ok) throw new Error(JSON.stringify(splitResult.error));
    // 使えない場所は分割の以前の場所（元の pane の記録された場所）で開き、知らせる印を返す（AC9）。
    expect(splitResult.result).toMatchObject({ pane: { cwd: "/home/me" }, cwdFallback: true });
  });
});

// 名前変更は await してから応答し、null は自動の名前に戻す（20260921-workspace-auto-label）。
describe("registerAllMethods — workspace.rename", () => {
  it("名前を付け、null で自動の名前に戻し、無い workspace は not_found を返す", async () => {
    const ctx = makeContext();
    const clientId = ctx.clients.register();
    const c = { clientId, sink: fakeSink(clientId) };
    const { workspace } = await ctx.session.createWorkspace("/srv/app", undefined);
    expect((await ctx.surface.invoke(c, "workspace.rename", { workspaceId: workspace.id, label: "mine" })).ok).toBe(true);
    expect(ctx.session.snapshot().workspaces[0]).toMatchObject({ label: "mine", autoLabel: false });
    const back = await ctx.surface.invoke(c, "workspace.rename", { workspaceId: workspace.id, label: null });
    expect(back).toEqual({ ok: true, result: {} });
    // 応答の時点で自動の名前に戻っている（await してから応答する）。
    expect(ctx.session.snapshot().workspaces[0]).toMatchObject({ label: "app", autoLabel: true });
    const missing = await ctx.surface.invoke(c, "workspace.rename", { workspaceId: "w999", label: null });
    expect(missing).toEqual({ ok: false, error: { code: "not_found", message: expect.stringContaining("w999") } });
  });
});

/**
 * workspace.create の配線を確かめるための代役（20260925-workspace-git-immediate）。
 * `pollWorkspaceNow` を呼んだ workspaceId を記録するだけ（実際の git は呼ばない）。
 * 返す Promise は `releasePending()` を呼ぶまで解決しない——taskcheck T3 round1 の指摘
 * （同期的に解決する Fake では fire-and-forget と await の区別が付かない）を受けて、
 * 「応答が返った時点ではまだ完了させていない」ことを明示的に検証できる形にした。
 */
class FakeGitInfoPoller implements GitInfoPoller {
  readonly polledWorkspaceIds: string[] = [];
  private readonly pendingResolvers: (() => void)[] = [];
  start(): void {}
  stop(): void {}
  pollNow(): Promise<void> {
    return Promise.resolve();
  }
  pollWorkspaceNow(workspaceId: string): Promise<void> {
    return new Promise((resolve) => {
      this.pendingResolvers.push(() => {
        this.polledWorkspaceIds.push(workspaceId);
        resolve();
      });
    });
  }
  /** 保留中の `pollWorkspaceNow` を今すぐ完了させる（テストから明示的に呼ぶ）。 */
  releasePending(): void {
    for (const resolve of this.pendingResolvers.splice(0)) resolve();
  }
}

/**
 * worktree の方式は別のテストで確かめるので、ここでは呼ばれない代役を置く
 * （一覧・作成は 20260920-git-worktree-actions。削除は 20260924-worktree-remove）。
 */
function stubWorktrees(): WorktreeService {
  return {
    list: () => Promise.reject(new Error("not used in this test")),
    create: () => Promise.reject(new Error("not used in this test")),
    remove: () => Promise.reject(new Error("not used in this test")),
  };
}

function stubAgentIntegrations(): AgentIntegrationService {
  return {
    getAutoResumeEnabled: () => true,
    status: () => Promise.reject(new Error("not used in this test")),
    install: () => Promise.reject(new Error("not used in this test")),
    uninstall: () => Promise.reject(new Error("not used in this test")),
    setAutoResume: () => Promise.reject(new Error("not used in this test")),
  };
}
