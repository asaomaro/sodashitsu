import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { HostInfo, Workspace } from "@sodashitsu/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Disposable } from "../util/Disposable.js";
import { MemoryLogger } from "../log/Logger.js";
import { EventBus } from "../bus/EventBus.js";
import type { CreatePaneOptions, TerminalManager } from "../terminal/TerminalManager.js";
import type { TerminalHost } from "../terminal/TerminalHost.js";
import type { PersistScheduler } from "../session/PersistScheduler.js";
import { SessionModel } from "../session/SessionModel.js";
import { SessionService } from "../session/SessionService.js";
import { defaultWorkspaceLabelDeps } from "../session/workspaceLabel.js";
import { makeTempDir } from "../persist/atomicFile.js";
import { ChildProcessGitRunner, type GitRunner } from "../infra/GitRunner.js";
import { DefaultGitInfoPoller } from "./GitInfoPoller.js";

class AlwaysUpHost implements TerminalHost {
  readonly pid = 1;
  readonly mirror = {} as TerminalHost["mirror"];
  readonly fanout = {} as TerminalHost["fanout"];
  constructor(readonly paneId: string) {}
  write(): void {}
  writeModal(): Promise<void> {
    return Promise.resolve();
  }
  resize(): void {}
  lastOutputAt(): number {
    return Date.now();
  }
  onExit(): Disposable {
    return { dispose: () => undefined };
  }
  dispose(): void {}
}
class AlwaysUpTerminalManager implements TerminalManager {
  create(paneId: string, _opts: CreatePaneOptions): TerminalHost {
    return new AlwaysUpHost(paneId);
  }
  get(): TerminalHost | undefined {
    return undefined;
  }
  resize(): void {}
  dispose(): void {}
}
class NoopPersist implements PersistScheduler {
  touch(): void {}
  async flush(): Promise<void> {}
  cancel(): void {}
}

const HOST_INFO: HostInfo = { os: "linux", windowsBuild: null, hostname: "test" };

async function runGit(cwd: string, args: string[]): Promise<void> {
  await new ChildProcessGitRunner().run(cwd, args, 5000);
}

describe("DefaultGitInfoPoller", () => {
  let repoDir: string;
  let service: SessionService;

  beforeEach(async () => {
    repoDir = await makeTempDir("soda-gitpoller-");
    await runGit(repoDir, ["init", "-b", "main"]);
    await runGit(repoDir, ["config", "user.email", "t@example.com"]);
    await runGit(repoDir, ["config", "user.name", "t"]);
    await writeFile(join(repoDir, "a.txt"), "hello");
    await runGit(repoDir, ["add", "a.txt"]);
    await runGit(repoDir, ["commit", "-m", "init"]);

    service = new SessionService({
      model: new SessionModel(),
      terminals: new AlwaysUpTerminalManager(),
      bus: new EventBus(),
      persist: new NoopPersist(),
      serverVersion: "test",
      host: HOST_INFO,
      scrollbackLines: 1000,
      spawnGraceMs: 1,
      defaultCwd: repoDir,
      logger: new MemoryLogger(),
    });
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it("sets the branch for a workspace whose cwd is a git repo", async () => {
    await service.createWorkspace(repoDir, "repo");
    const poller = new DefaultGitInfoPoller(service, new ChildProcessGitRunner());
    await poller.pollNow();
    const ws = service.snapshot().workspaces[0]!;
    expect(ws.git).toMatchObject({ branch: "main" });
  });

  it("leaves git null for a workspace whose cwd is not a git repo", async () => {
    const plainDir = await mkdirTemp();
    await service.createWorkspace(plainDir, "plain");
    const poller = new DefaultGitInfoPoller(service, new ChildProcessGitRunner());
    await poller.pollNow();
    const ws = service.snapshot().workspaces.find((w) => w.cwd === plainDir)!;
    expect(ws.git).toBeNull();
    await rm(plainDir, { recursive: true, force: true });
  });

  // 20260923-workspace-grouping（worktree 自動グループの判定キー）。
  it("sets repoKey to the resolved common dir and isLinkedWorktree=false for the main checkout", async () => {
    await service.createWorkspace(repoDir, "repo");
    const poller = new DefaultGitInfoPoller(service, new ChildProcessGitRunner());
    await poller.pollNow();
    const ws = service.snapshot().workspaces[0]!;
    expect(ws.git?.repoKey).toMatch(/\.git$/);
    expect(ws.git?.isLinkedWorktree).toBe(false);
  });

  it("leaves repoKey null and isLinkedWorktree false for a non-git workspace", async () => {
    const plainDir = await mkdirTemp();
    await service.createWorkspace(plainDir, "plain");
    const poller = new DefaultGitInfoPoller(service, new ChildProcessGitRunner());
    await poller.pollNow();
    expect(service.snapshot().workspaces.find((w) => w.cwd === plainDir)!.git).toBeNull();
    await rm(plainDir, { recursive: true, force: true });
  });

  it("gives a linked worktree the same repoKey as the main checkout, and isLinkedWorktree=true", async () => {
    const worktreeDir = `${repoDir}-wt`; // repoDir は mkdtemp が作った末尾スラッシュ無しの絶対パス
    await runGit(repoDir, ["worktree", "add", "-b", "feature", worktreeDir]);
    await service.createWorkspace(repoDir, "main");
    await service.createWorkspace(worktreeDir, "wt");
    const poller = new DefaultGitInfoPoller(service, new ChildProcessGitRunner());
    await poller.pollNow();
    const snapshot = service.snapshot();
    const main = snapshot.workspaces.find((w) => w.cwd === repoDir)!;
    const wt = snapshot.workspaces.find((w) => w.cwd === worktreeDir)!;
    expect(main.git?.repoKey).not.toBeNull();
    expect(wt.git?.repoKey).toBe(main.git?.repoKey); // 同じ共通ディレクトリ＝同じグループ判定キー
    expect(main.git?.isLinkedWorktree).toBe(false);
    expect(wt.git?.isLinkedWorktree).toBe(true);
    await rm(worktreeDir, { recursive: true, force: true });
  });

  it("reports ahead when a commit exists only on the local branch relative to its upstream", async () => {
    // 「上流」をローカルブランチ base（現在の HEAD）にし、main だけ 1 コミット進める
    // （リモートを使わずに ahead=1・behind=0 を作れる、最も単純な形）。
    await runGit(repoDir, ["branch", "base"]);
    await runGit(repoDir, ["branch", "--set-upstream-to=base", "main"]);
    await writeFile(join(repoDir, "b.txt"), "world");
    await runGit(repoDir, ["add", "b.txt"]);
    await runGit(repoDir, ["commit", "-m", "second"]);

    await service.createWorkspace(repoDir, "repo");
    const poller = new DefaultGitInfoPoller(service, new ChildProcessGitRunner());
    await poller.pollNow();
    const ws = service.snapshot().workspaces[0]!;
    expect(ws.git).toMatchObject({ branch: "main", ahead: 1, behind: 0 });
  });

  it("does not touch the workspace record when the git info has not changed (SessionService.updateWorkspaceGit の早期リターン)", async () => {
    await service.createWorkspace(repoDir, "repo");
    const poller = new DefaultGitInfoPoller(service, new ChildProcessGitRunner());
    await poller.pollNow();
    const first = service.snapshot().workspaces[0]!;
    await poller.pollNow();
    const second = service.snapshot().workspaces[0]!;
    expect(second).toBe(first); // 同一参照のまま＝モデルを書き換えていない
  });

  // 20260925-workspace-git-immediate（design「インターフェース / データ構造 > GitInfoPoller.ts」）。
  describe("pollWorkspaceNow", () => {
    it("sets the branch for the targeted workspace without waiting for the periodic interval (AC1)", async () => {
      const { workspace } = await service.createWorkspace(repoDir, "repo");
      const poller = new DefaultGitInfoPoller(service, new ChildProcessGitRunner());
      await poller.pollWorkspaceNow(workspace.id); // pollNow() を一度も呼んでいない
      const ws = service.snapshot().workspaces[0]!;
      expect(ws.git).toMatchObject({ branch: "main" });
    });

    it("leaves git null for a workspace whose cwd is not a git repo, without throwing (AC2)", async () => {
      const plainDir = await mkdirTemp();
      const { workspace } = await service.createWorkspace(plainDir, "plain");
      const poller = new DefaultGitInfoPoller(service, new ChildProcessGitRunner());
      await expect(poller.pollWorkspaceNow(workspace.id)).resolves.toBeUndefined();
      expect(service.snapshot().workspaces.find((w) => w.cwd === plainDir)!.git).toBeNull();
      await rm(plainDir, { recursive: true, force: true });
    });

    it("does nothing when the workspace id does not exist (already closed)", async () => {
      const poller = new DefaultGitInfoPoller(service, new ChildProcessGitRunner());
      await expect(poller.pollWorkspaceNow("bogus")).resolves.toBeUndefined();
    });

    it("does not touch other workspaces (targeted, unlike pollNow's full sweep)", async () => {
      // 両方とも実際の git リポジトリにする——非 git ディレクトリだと既定値も null で
      // 「ポーリングされたが非 git だった」のか「そもそもポーリングされていない」のか
      // 区別できないため。branch が付くかどうかで観測する。
      const otherRepoDir = await mkdirTemp();
      await runGit(otherRepoDir, ["init", "-b", "main"]);
      await runGit(otherRepoDir, ["config", "user.email", "t@example.com"]);
      await runGit(otherRepoDir, ["config", "user.name", "t"]);
      await runGit(otherRepoDir, ["commit", "--allow-empty", "-m", "init"]);

      const { workspace: repoWs } = await service.createWorkspace(repoDir, "repo");
      await service.createWorkspace(otherRepoDir, "other");
      const poller = new DefaultGitInfoPoller(service, new ChildProcessGitRunner());
      await poller.pollWorkspaceNow(repoWs.id);

      expect(service.snapshot().workspaces.find((w) => w.cwd === repoDir)!.git).toMatchObject({ branch: "main" });
      expect(service.snapshot().workspaces.find((w) => w.cwd === otherRepoDir)!.git).toBeNull(); // 対象外は一度もポーリングされていない
      await rm(otherRepoDir, { recursive: true, force: true });
    });

    it("does not overwrite the record when the git info has not changed (AC4。sameGit の早期リターンに乗る)", async () => {
      const { workspace } = await service.createWorkspace(repoDir, "repo");
      const poller = new DefaultGitInfoPoller(service, new ChildProcessGitRunner());
      await poller.pollWorkspaceNow(workspace.id);
      const first = service.snapshot().workspaces[0]!;
      await poller.pollWorkspaceNow(workspace.id); // 定期ポーリングとほぼ同時に走った場合を模す
      const second = service.snapshot().workspaces[0]!;
      expect(second).toBe(first); // 同一参照のまま＝モデルを書き換えていない・二重 publish もしない
    });
  });
});

// 20260926-workspace-label-follow-cwd：git の情報と自動の名前を、最初の tab の最初の pane のいまの場所から一緒に決め直す（design D1〜D4）。
// 実物の git を起動する（beforeEach で 2 つのリポジトリを作り、it の中でも問い合わせる）。負荷の下で最大 6.3 秒かかって、中の待ち（5 秒）と同じ
// 既定の上限（5 秒）で落ちた。上限を 15 秒、中の待ちをその半分にする（20260926-load-flaky-tests の D5）。
describe("DefaultGitInfoPoller — 最初の pane のいまの場所への追従", { timeout: 15_000 }, () => {
  let repoA: string;
  let repoB: string;
  let plain: string;
  let bus: EventBus;
  let service: SessionService;
  let runs: string[];
  let inFlight: number;
  let gate: { cwd: string; wait: Promise<void> } | null;
  let poller: DefaultGitInfoPoller;

  async function repo(branch: string): Promise<string> {
    const dir = await makeTempDir("soda-follow-");
    await runGit(dir, ["init", "-b", branch]);
    await runGit(dir, ["config", "user.email", "t@example.com"]);
    await runGit(dir, ["config", "user.name", "t"]);
    await runGit(dir, ["commit", "--allow-empty", "-m", "init"]);
    await mkdir(join(dir, "sub"), { recursive: true });
    return dir;
  }

  beforeEach(async () => {
    repoA = await repo("main");
    repoB = await repo("other");
    plain = await mkdirTemp();
    bus = new EventBus();
    service = new SessionService({
      model: new SessionModel(),
      terminals: new AlwaysUpTerminalManager(),
      bus,
      persist: new NoopPersist(),
      serverVersion: "test",
      host: HOST_INFO,
      scrollbackLines: 1000,
      spawnGraceMs: 1,
      defaultCwd: repoA,
      logger: new MemoryLogger(),
      // 名前を決める予算（既定 200ms）を負荷の下で超えると、設計どおりフォルダ名に代わり、次の見直し（この describe では 60 秒後）まで
      // 決め直さない。ここで確かめるのは追従で、予算を超えたときの振る舞いではない（それは workspaceLabel・SessionService のテスト）。
      // 予算を中の待ち（7.5 秒）の半分より短い 3 秒にする（20260926-load-flaky-tests の D9）。
      workspaceLabelDeps: { ...defaultWorkspaceLabelDeps, timeoutMs: 3_000 },
    });
    runs = [];
    inFlight = 0;
    gate = null;
    const real = new ChildProcessGitRunner();
    const git: GitRunner = {
      run: async (cwd, args, timeoutMs) => {
        runs.push(cwd);
        inFlight++;
        try {
          if (gate && cwd === gate.cwd) await gate.wait;
          return await real.run(cwd, args, timeoutMs);
        } finally {
          inFlight--;
        }
      },
    };
    poller = new DefaultGitInfoPoller(service, git, 60_000, bus); // 周期は待たない——追従はバスで起きることを見る
  });

  afterEach(async () => {
    poller.stop();
    for (const dir of [repoA, repoB, plain]) await rm(dir, { recursive: true, force: true });
  });

  const ws = (id: string) => service.getWorkspace(id)!;

  // start() は初回の見直しを待たずに投げるので、負荷が高いと pollNow() の後もその git が走り続ける。
  // 「問い合わせない」を数える前に、実行中の git が無く件数も増えない状態を待つ。
  async function gitQuiet(): Promise<void> {
    let last = -1;
    while (inFlight > 0 || runs.length !== last) {
      last = runs.length;
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  it("最初の pane が別のリポジトリへ移ると、名前と git が 1 つの workspace.updated でそのリポジトリのものになる（AC1・AC10）", async () => {
    const { workspace, pane } = await service.createWorkspace(repoA, undefined);
    poller.start();
    await poller.pollNow();
    expect(ws(workspace.id)).toMatchObject({ label: basename(repoA), git: { branch: "main" } });
    const updates: Workspace[] = [];
    bus.subscribe((e) => {
      if (e.event === "workspace.updated") updates.push(e.data.workspace);
    });
    service.updatePaneRuntime(pane.id, { cwd: join(repoB, "sub") });
    await vi.waitFor(() => expect(ws(workspace.id)).toMatchObject({ label: basename(repoB), git: { branch: "other" } }), { timeout: 7500 });
    expect(updates.map((w) => [w.label, w.git?.branch]), "名前と git は同じ 1 回で").toEqual([[basename(repoB), "other"]]);
    expect(ws(workspace.id).cwd, "開いた場所は変えない（AC9）").toBe(repoA);
  });

  it("git の外へ移ると、名前がフォルダ名になり git の情報が消える（AC2）", async () => {
    const { workspace, pane } = await service.createWorkspace(repoA, undefined);
    poller.start();
    await poller.pollNow();
    service.updatePaneRuntime(pane.id, { cwd: plain });
    await vi.waitFor(() => expect(ws(workspace.id)).toMatchObject({ label: basename(plain), git: null }), { timeout: 7500 });
  });

  it("付けた名前は変えず、git だけがいまの場所のものになる（AC3）", async () => {
    const { workspace, pane } = await service.createWorkspace(repoA, "mine");
    poller.start();
    await poller.pollNow();
    service.updatePaneRuntime(pane.id, { cwd: repoB });
    await vi.waitFor(() => expect(ws(workspace.id).git).toMatchObject({ branch: "other" }), { timeout: 7500 });
    expect(ws(workspace.id)).toMatchObject({ label: "mine", autoLabel: false });
  });

  it("最初の pane 以外の場所の変化・場所の変わらないイベントでは git に問い合わせない（AC4・AC11）", async () => {
    const { workspace, pane } = await service.createWorkspace(repoA, undefined);
    const right = await service.splitPane(pane.id, "right", undefined);
    const { pane: second } = await service.createTab(workspace.id, undefined);
    poller.start();
    await poller.pollNow();
    await gitQuiet();
    const before = runs.length;
    service.updatePaneRuntime(right.pane.id, { cwd: repoB });
    service.updatePaneRuntime(second.id, { cwd: repoB });
    service.updatePaneRuntime(pane.id, { title: "vim" }); // 題名だけの pane.updated
    await service.renameWorkspace(workspace.id, "named"); // 名前だけの workspace.updated
    await new Promise((r) => setTimeout(r, 50));
    expect(runs.length - before).toBe(0);
    expect(ws(workspace.id).git).toMatchObject({ branch: "main" });
  });

  // AC5：最初の pane が代わる操作ごとに 1 件。閉じる操作は `pane.closed`・`tab.closed` の後に必ず `layout.updated` か `workspace.updated` も
  // 出るので、この 2 種類の購読は念のためで、テストでは見分けられない（decisions D7）。
  describe("最初の pane が代わると、新しい最初の pane の場所に追従する（AC5）", () => {
    async function withSecondPaneInB() {
      const { workspace, pane } = await service.createWorkspace(repoA, undefined);
      const right = await service.splitPane(pane.id, "right", undefined);
      service.updatePaneRuntime(right.pane.id, { cwd: repoB });
      poller.start();
      await poller.pollNow();
      expect(ws(workspace.id).git).toMatchObject({ branch: "main" });
      return { workspace, pane, right: right.pane };
    }
    const followedB = (id: string) =>
      vi.waitFor(() => expect(ws(id)).toMatchObject({ label: basename(repoB), git: { branch: "other" } }), { timeout: 7500 });

    it("pane.closed：最初の pane を閉じる", async () => {
      const { workspace, pane } = await withSecondPaneInB();
      await service.closePane(pane.id);
      await followedB(workspace.id);
    });

    it("layout.updated：入れ替える", async () => {
      const { workspace, pane, right } = await withSecondPaneInB();
      service.swapPaneWith(pane.id, right.id);
      await followedB(workspace.id);
    });

    it("tab.closed：先頭の tab を閉じる", async () => {
      const { workspace, pane } = await service.createWorkspace(repoA, undefined);
      const { pane: second } = await service.createTab(workspace.id, undefined);
      service.updatePaneRuntime(second.id, { cwd: repoB });
      poller.start();
      await poller.pollNow();
      await service.closeTab(service.getPane(pane.id)!.tabId);
      await followedB(workspace.id);
    });

    it("workspace.updated：tab を並べ替える", async () => {
      const { workspace } = await service.createWorkspace(repoA, undefined);
      const { tab, pane: second } = await service.createTab(workspace.id, undefined);
      service.updatePaneRuntime(second.id, { cwd: repoB });
      poller.start();
      await poller.pollNow();
      service.moveTab(tab.id, "previous");
      await followedB(workspace.id);
    });
  });

  it("見直しの間に場所が変わったら、古い場所の結果で上書きしない（AC6）", async () => {
    const { workspace, pane } = await service.createWorkspace(repoA, undefined);
    let release: () => void = () => undefined;
    gate = { cwd: repoA, wait: new Promise<void>((r) => (release = r)) };
    poller.start(); // 1 周目は repoA の git で止まる
    await vi.waitFor(() => expect(runs).toContain(repoA));
    service.updatePaneRuntime(pane.id, { cwd: repoB });
    await vi.waitFor(() => expect(ws(workspace.id)).toMatchObject({ label: basename(repoB), git: { branch: "other" } }), { timeout: 7500 });
    release();
    // 止まっていた repoA の見直しが git を 4 本とも走らせ終える（＝古い結果を入れようとする）まで待つ。
    await vi.waitFor(() => expect(runs.filter((c) => c === repoA).length).toBeGreaterThanOrEqual(4), { timeout: 7500 });
    await new Promise((r) => setTimeout(r, 50));
    expect(ws(workspace.id)).toMatchObject({ label: basename(repoB), git: { branch: "other" } });
  });

  it("復元した workspace は、保存の最初の pane の場所で git と名前を取る（AC8）", async () => {
    await service.restore({
      schema: 1,
      savedAt: "2026-09-26T00:00:00Z",
      nextId: { w: 10, t: 10, p: 10, s: 1, a: 1, g: 1 },
      groups: [],
      workspaces: [
        {
          id: "w1",
          label: "1",
          cwd: repoA,
          activeTabId: "t1",
          tabs: [{ id: "t1", label: "1", focusedPaneId: "p1", zoomedPaneId: null, layout: { type: "pane", paneId: "p1" }, panes: [{ id: "p1", label: null, cwd: repoB, shell: "/bin/sh" }] }],
        },
      ],
      focus: null,
    });
    await poller.pollNow();
    expect(ws("w1")).toMatchObject({ label: basename(repoB), cwd: repoA, git: { branch: "other" } });
  });

  it("stop の後は場所が変わっても見直さない", async () => {
    const { pane } = await service.createWorkspace(repoA, undefined);
    poller.start();
    await poller.pollNow();
    poller.stop();
    await gitQuiet();
    const before = runs.length;
    service.updatePaneRuntime(pane.id, { cwd: repoB });
    await new Promise((r) => setTimeout(r, 50));
    expect(runs.length).toBe(before);
  });
});

async function mkdirTemp(): Promise<string> {
  const dir = await makeTempDir("soda-gitpoller-plain-");
  await mkdir(dir, { recursive: true });
  return dir;
}
