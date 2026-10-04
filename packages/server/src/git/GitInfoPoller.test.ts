import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import type { HostInfo, Workspace } from "@sodashitsu/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Disposable } from "../util/Disposable.js";
import { MemoryLogger } from "../log/Logger.js";
import { EventBus } from "../bus/EventBus.js";
import type { CreatePaneOptions, TerminalManager } from "../terminal/TerminalManager.js";
import type { TerminalHost } from "../terminal/TerminalHost.js";
import type { PersistScheduler } from "../session/PersistScheduler.js";
import { SessionModel, type GitJudgement } from "../session/SessionModel.js";
import { SessionService } from "../session/SessionService.js";
import { defaultWorkspaceLabelDeps } from "../session/workspaceLabel.js";
import { makeTempDir } from "../persist/atomicFile.js";
import { ChildProcessGitRunner, type GitRunner } from "../infra/GitRunner.js";
import { DefaultGitInfoPoller } from "./GitInfoPoller.js";
import { FsSessionFile } from "../persist/SessionFile.js";
import { toSessionFileData } from "../composeServer.js";
import { repoMembers, sidebarTree } from "@sodashitsu/client-core";

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

type GitRunResult = Awaited<ReturnType<GitRunner["run"]>>;

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

// 20261004-group-worktree-items T4：probe の 3 つの結果（git／管理外と確定／取れない）と、最初の 1 周の合図。
describe("DefaultGitInfoPoller — probe の結果と最初の 1 周の合図", { timeout: 15_000 }, () => {
  let service: SessionService;
  let dirs: string[];

  beforeEach(() => {
    dirs = [];
    service = new SessionService({
      model: new SessionModel(),
      terminals: new AlwaysUpTerminalManager(),
      bus: new EventBus(),
      persist: new NoopPersist(),
      serverVersion: "test",
      host: HOST_INFO,
      scrollbackLines: 1000,
      spawnGraceMs: 1,
      defaultCwd: tmpdir(),
      logger: new MemoryLogger(),
    });
  });

  afterEach(async () => {
    for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  });

  async function tempDir(): Promise<string> {
    const dir = await mkdirTemp();
    dirs.push(dir);
    return dir;
  }

  async function repoWithCommit(): Promise<string> {
    const dir = await tempDir();
    await runGit(dir, ["init", "-b", "main"]);
    await runGit(dir, ["config", "user.email", "t@example.com"]);
    await runGit(dir, ["config", "user.name", "t"]);
    await runGit(dir, ["commit", "--allow-empty", "-m", "init"]);
    return dir;
  }

  /** 引数の先頭に合う結果を返す偽の git。呼ばれた引数も控える。 */
  function fakeGit(handlers: Record<string, GitRunResult | Error>) {
    const calls: string[][] = [];
    const git: GitRunner = {
      run: async (_cwd, args) => {
        calls.push(args);
        const hit = handlers[args.filter((a) => !a.startsWith("--path-format")).join(" ")];
        if (hit instanceof Error) throw hit;
        return hit ?? { code: 1, stdout: "", stderr: "unexpected" };
      },
    };
    return { git, calls };
  }
  const ok = (stdout: string): GitRunResult => ({ code: 0, stdout, stderr: "" });
  const failed = (code: number): GitRunResult => ({ code, stdout: "", stderr: "fatal" });

  describe("単体（偽の git）", () => {
    it("repoKey まで取れたら git（本体は isLinkedWorktree=false。--path-format=absolute で聞く）", async () => {
      const { git, calls } = fakeGit({
        "rev-parse --abbrev-ref HEAD": ok("main\n"),
        "rev-parse --git-common-dir": ok("/r/.git\n"),
        "rev-parse --git-dir": ok("/r/.git\n"),
      });
      const result = await new DefaultGitInfoPoller(service, git).probe("/r");
      expect(result).toEqual({ kind: "git", git: { branch: "main", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: false, worktreeKey: "/r/.git" } });
      expect(calls.filter((a) => a.includes("--git-common-dir") || a.includes("--git-dir")).every((a) => a.includes("--path-format=absolute"))).toBe(true);
    });

    it("--git-dir が共通ディレクトリと違えば linked worktree", async () => {
      const { git } = fakeGit({
        "rev-parse --abbrev-ref HEAD": ok("f\n"),
        "rev-parse --git-common-dir": ok("/r/.git\n"),
        "rev-parse --git-dir": ok("/r/.git/worktrees/wt\n"),
      });
      const result = await new DefaultGitInfoPoller(service, git).probe("/wt");
      // `worktreeKey` は `--git-dir` の絶対パスそのもの（追補 01 A）。linked worktree は共通ディレクトリと違う値になる。
      expect(result).toMatchObject({ kind: "git", git: { repoKey: "/r/.git", isLinkedWorktree: true, worktreeKey: "/r/.git/worktrees/wt" } });
    });

    it("HEAD の終了コードが 0 でなければ unmanaged（管理外・コミットなしと確定）", async () => {
      const { git } = fakeGit({ "rev-parse --abbrev-ref HEAD": failed(128) });
      expect(await new DefaultGitInfoPoller(service, git).probe("/x")).toEqual({ kind: "unmanaged" });
    });

    it("時間切れ・git の起動失敗（reject）は unknown", async () => {
      const { git } = fakeGit({ "rev-parse --abbrev-ref HEAD": new Error("timed out") });
      expect(await new DefaultGitInfoPoller(service, git).probe("/x")).toEqual({ kind: "unknown" });
    });

    it("HEAD は取れたが --git-common-dir が失敗したら unknown（半端な git を作らない）", async () => {
      const { git } = fakeGit({
        "rev-parse --abbrev-ref HEAD": ok("main\n"),
        "rev-parse --git-common-dir": failed(129), // 古い git で --path-format が使えない場合もここ
        "rev-parse --git-dir": ok("/r/.git\n"),
      });
      expect(await new DefaultGitInfoPoller(service, git).probe("/r")).toEqual({ kind: "unknown" });
    });

    it("HEAD と --git-common-dir は取れたが --git-dir が失敗したら unknown", async () => {
      const { git } = fakeGit({
        "rev-parse --abbrev-ref HEAD": ok("main\n"),
        "rev-parse --git-common-dir": ok("/r/.git\n"),
        "rev-parse --git-dir": failed(129),
      });
      expect(await new DefaultGitInfoPoller(service, git).probe("/r")).toEqual({ kind: "unknown" });
    });

    // git は知らないオプションをそのまま出力して終了コード 0 を返す（2.31 未満の --path-format=absolute）。
    // 1 行目がそのまま --path-format=absolute なら古い git とみなし、残りの行を cwd から解決する（main と同じ決め方。decisions D48）。それ以外の壊れた値は repoKey・worktreeKey にしない（D44）。
    for (const [name, out] of [
      ["別のオプションがそのまま出る", "--bogus-option\n.git\n"],
      ["古い git で残りが無い", "--path-format=absolute\n"],
      ["古い git で残りの行が多い", "--path-format=absolute\n.git\n.git\n"],
      ["古い git で残りが別のオプション", "--path-format=absolute\n--bogus-option\n"],
      ["相対パスだけ", ".git\n"],
      ["行数が多い", "/r/.git\n/r/.git\n"],
      ["空", ""],
    ] as const) {
      it(`--git-common-dir の出力が壊れていれば unknown（${name}）`, async () => {
        const { git } = fakeGit({
          "rev-parse --abbrev-ref HEAD": ok("main\n"),
          "rev-parse --git-common-dir": ok(out),
          "rev-parse --git-dir": ok("/r/.git\n"),
        });
        expect(await new DefaultGitInfoPoller(service, git).probe("/r")).toEqual({ kind: "unknown" });
      });
      it(`--git-dir の出力が壊れていれば unknown（${name}）`, async () => {
        const { git } = fakeGit({
          "rev-parse --abbrev-ref HEAD": ok("main\n"),
          "rev-parse --git-common-dir": ok("/r/.git\n"),
          "rev-parse --git-dir": ok(out),
        });
        expect(await new DefaultGitInfoPoller(service, git).probe("/r")).toEqual({ kind: "unknown" });
      });
    }

    it("古い git（1 行目が --path-format=absolute）: 残りの相対／絶対パスを cwd から解決して git を返す（--git-common-dir・--git-dir の両方。本体）", async () => {
      const { git } = fakeGit({
        "rev-parse --abbrev-ref HEAD": ok("main\n"),
        "rev-parse --git-common-dir": ok("--path-format=absolute\n.git\n"),
        "rev-parse --git-dir": ok("--path-format=absolute\n.git\n"),
      });
      expect(await new DefaultGitInfoPoller(service, git).probe("/r")).toEqual({
        kind: "git",
        git: { branch: "main", ahead: 0, behind: 0, repoKey: resolve("/r/.git"), isLinkedWorktree: false, worktreeKey: resolve("/r/.git") },
      });
    });

    it("古い git: linked worktree（どちらも絶対）", async () => {
      const { git } = fakeGit({
        "rev-parse --abbrev-ref HEAD": ok("feat\n"),
        "rev-parse --git-common-dir": ok("--path-format=absolute\n/r/.git\n"),
        "rev-parse --git-dir": ok("--path-format=absolute\n/r/.git/worktrees/w\n"),
      });
      expect(await new DefaultGitInfoPoller(service, git).probe("/wt/w")).toEqual({
        kind: "git",
        git: { branch: "feat", ahead: 0, behind: 0, repoKey: resolve("/r/.git"), isLinkedWorktree: true, worktreeKey: resolve("/r/.git/worktrees/w") },
      });
    });

    it("古い git: linked worktree の相対パス（../ を cwd から解決。--git-common-dir・--git-dir の両方。isLinkedWorktree が true）", async () => {
      const { git } = fakeGit({
        "rev-parse --abbrev-ref HEAD": ok("feat\n"),
        "rev-parse --git-common-dir": ok("--path-format=absolute\n../../r/.git\n"),
        "rev-parse --git-dir": ok("--path-format=absolute\n../../r/.git/worktrees/w\n"),
      });
      expect(await new DefaultGitInfoPoller(service, git).probe("/wt/w")).toEqual({
        kind: "git",
        git: { branch: "feat", ahead: 0, behind: 0, repoKey: resolve("/r/.git"), isLinkedWorktree: true, worktreeKey: resolve("/r/.git/worktrees/w") },
      });
    });

    it("実物の linked worktree + 古い git の再現（出力を相対パスに差し替える）: 本体と同じ repoKey で isLinkedWorktree=true", async () => {
      const main = await repoWithCommit();
      const wt = `${main}-wt`;
      const real = new ChildProcessGitRunner();
      expect((await real.run(main, ["worktree", "add", "-b", "feature", wt], 10_000)).code).toBe(0);
      const old: GitRunner = {
        run: async (cwd, args, t) => {
          const r = await real.run(cwd, args.filter((a) => a !== "--path-format=absolute"), t);
          if (!args.includes("--path-format=absolute") || r.code !== 0) return r;
          // 旧 git は --path-format を知らず、素の出力（本体は相対の `.git`、linked worktree は git の版により相対／絶対）を返す。絶対のときは cwd からの相対に直して、相対入力の形にする
          const raw = r.stdout.trim();
          return { ...r, stdout: `--path-format=absolute\n${isAbsolute(raw) ? relative(cwd, raw) : raw}\n` };
        },
      };
      const poller = new DefaultGitInfoPoller(service, old);
      const m = await poller.probe(main);
      const l = await poller.probe(wt);
      if (m.kind !== "git" || l.kind !== "git") throw new Error("unreachable");
      expect(l.git.isLinkedWorktree).toBe(true);
      expect(m.git.isLinkedWorktree).toBe(false);
      expect(l.git.repoKey).toBe(m.git.repoKey);
      expect(l.git.worktreeKey).not.toBe(m.git.worktreeKey);
    });

    it("実物の git: 知らないオプションは出力に混ざって終了コード 0 になる（前提）・古い git と同じ形なので残りを cwd から解決する", async () => {
      const dir = await repoWithCommit();
      const real = new ChildProcessGitRunner();
      const raw = await real.run(dir, ["rev-parse", "--bogus-option", "--git-common-dir"], 5000);
      expect(raw.code).toBe(0);
      expect(raw.stdout.split("\n")[0]).toBe("--bogus-option");
      // 古い git の再現: --path-format=absolute を、知らないオプションとして git が出力に返す形にする（`--path-format=absolute` と同じ綴りの未知のオプションは作れないので、出力を差し替える）。
      const old: GitRunner = {
        run: async (cwd, args, t) => {
          const r = await real.run(cwd, args.filter((a) => a !== "--path-format=absolute"), t);
          return args.includes("--path-format=absolute") && r.code === 0 ? { ...r, stdout: `--path-format=absolute\n${r.stdout}` } : r;
        },
      };
      const result = await new DefaultGitInfoPoller(service, old).probe(dir);
      expect(result).toMatchObject({ kind: "git", git: { branch: "main", isLinkedWorktree: false } });
      // 別のオプションが 1 行目に出る壊れた出力は unknown
      const bogus: GitRunner = { run: (cwd, args, t) => real.run(cwd, args.map((a) => (a === "--path-format=absolute" ? "--bogus-option" : a)), t) };
      expect(await new DefaultGitInfoPoller(service, bogus).probe(dir)).toEqual({ kind: "unknown" });
    });

    it("最初の 1 周の合図: start() ごとに来る（再開で 2 回以上）・dispose した受け手には来ない・受け手が投げても他へ届く", async () => {
      const { git } = fakeGit({ "rev-parse --abbrev-ref HEAD": failed(128) });
      const poller = new DefaultGitInfoPoller(service, git, 60_000);
      let a = 0;
      let b = 0;
      let gone = 0;
      poller.onFirstRoundDone(() => {
        a++;
        throw new Error("受け手の失敗");
      });
      poller.onFirstRoundDone(() => b++);
      poller.onFirstRoundDone(() => gone++).dispose();
      poller.start();
      await vi.waitFor(() => expect([a, b]).toEqual([1, 1]));
      poller.stop();
      poller.start(); // 引き継ぎの一時停止からの再開
      await vi.waitFor(() => expect([a, b]).toEqual([2, 2]));
      poller.stop();
      expect(gone).toBe(0);
    });

    it("isRunning: start() の後で stop() の前だけ true（一時停止中に届いた合図を受け手が見分ける）", async () => {
      const { git } = fakeGit({ "rev-parse --abbrev-ref HEAD": failed(128) });
      const poller = new DefaultGitInfoPoller(service, git, 60_000);
      const atSignal: boolean[] = [];
      poller.onFirstRoundDone(() => atSignal.push(poller.isRunning()));
      expect(poller.isRunning()).toBe(false);
      poller.start();
      expect(poller.isRunning()).toBe(true);
      poller.stop(); // 1 周が終わる前に止める（引き継ぎの一時停止）。合図は stop の後に届く
      expect(poller.isRunning()).toBe(false);
      await vi.waitFor(() => expect(atSignal).toEqual([false]));
    });

    it("最初の 1 周が失敗しても合図は出る", async () => {
      const { git } = fakeGit({});
      const poller = new DefaultGitInfoPoller(service, git, 60_000);
      vi.spyOn(poller, "pollNow").mockRejectedValue(new Error("boom"));
      let n = 0;
      poller.onFirstRoundDone(() => n++);
      poller.start();
      await vi.waitFor(() => expect(n).toBe(1));
      poller.stop();
    });
  });

  describe("結合（実物の git）", () => {
    const probe = (cwd: string) => new DefaultGitInfoPoller(service, new ChildProcessGitRunner()).probe(cwd);

    it("git 管理外のフォルダは unmanaged", async () => {
      expect(await probe(await tempDir())).toEqual({ kind: "unmanaged" });
    });

    it("コミットが 1 つも無いリポジトリは unmanaged（HEAD が取れない）", async () => {
      const dir = await tempDir();
      await runGit(dir, ["init", "-b", "main"]);
      expect(await probe(dir)).toEqual({ kind: "unmanaged" });
    });

    it("消えたフォルダは unknown（git の起動が失敗する）", async () => {
      const dir = await tempDir();
      await rm(dir, { recursive: true, force: true });
      expect(await probe(dir)).toEqual({ kind: "unknown" });
    });

    it("本体と linked worktree は同じ repoKey（絶対パス）で、isLinkedWorktree だけ違う", async () => {
      const repo = await repoWithCommit();
      const wt = `${repo}-wt`;
      dirs.push(wt);
      await runGit(repo, ["worktree", "add", "-b", "feature", wt]);
      const main = await probe(repo);
      const linked = await probe(wt);
      expect(main).toMatchObject({ kind: "git", git: { branch: "main", isLinkedWorktree: false } });
      expect(linked).toMatchObject({ kind: "git", git: { branch: "feature", isLinkedWorktree: true } });
      if (main.kind !== "git" || linked.kind !== "git") throw new Error("unreachable");
      expect(isAbsolute(main.git.repoKey ?? "")).toBe(true);
      expect(linked.git.repoKey).toBe(main.git.repoKey);
    });

    it("worktreeKey は --git-dir の絶対パス: 同じフォルダ（とその下・symlink 経由）なら同じ値、linked worktree は <共通ディレクトリ>/worktrees/<名前>（追補 01 A）", async () => {
      const base = await tempDir();
      const real = join(base, "real");
      await mkdir(real);
      await runGit(real, ["init", "-b", "main"]);
      await runGit(real, ["config", "user.email", "t@example.com"]);
      await runGit(real, ["config", "user.name", "t"]);
      await runGit(real, ["commit", "--allow-empty", "-m", "init"]);
      await mkdir(join(real, "deep", "dir"), { recursive: true });
      await symlink(real, join(base, "link"));
      await runGit(real, ["worktree", "add", "-b", "feature", join(base, "wt")]);
      const keyOf = async (dir: string): Promise<string | null> => {
        const r = await probe(dir);
        return r.kind === "git" ? (r.git.worktreeKey ?? null) : null;
      };
      const main = await keyOf(real);
      expect(main).toMatch(/\/real\/\.git$/);
      expect(await keyOf(join(base, "link"))).toBe(main);
      expect(await keyOf(join(real, "deep", "dir"))).toBe(main);
      const linked = await keyOf(join(base, "wt"));
      expect(linked).toMatch(/\/real\/\.git\/worktrees\/[^/]+$/);
      expect(linked).not.toBe(main);
    });

    it("symlink を通った本体・その下の深い場所・symlink 経由の worktree が、実体の worktree と同じ repoKey になる（decisions D9）", async () => {
      const base = await tempDir();
      const real = join(base, "real");
      await mkdir(real);
      await runGit(real, ["init", "-b", "main"]);
      await runGit(real, ["config", "user.email", "t@example.com"]);
      await runGit(real, ["config", "user.name", "t"]);
      await runGit(real, ["commit", "--allow-empty", "-m", "init"]);
      await mkdir(join(real, "deep", "dir"), { recursive: true });
      await symlink(real, join(base, "link"));
      await runGit(real, ["worktree", "add", "-b", "feature", join(base, "wt")]);
      await symlink(join(base, "wt"), join(base, "wtlink"));

      const results = await Promise.all([real, join(base, "link"), join(base, "link", "deep", "dir"), join(base, "wt"), join(base, "wtlink")].map(probe));
      const keys = results.map((r) => (r.kind === "git" ? r.git.repoKey : r.kind));
      expect(new Set(keys).size, `repoKey: ${JSON.stringify(keys)}`).toBe(1);
      expect(keys[0]).toMatch(/\/real\/\.git$/);
      expect(results.map((r) => r.kind === "git" && r.git.isLinkedWorktree)).toEqual([false, false, false, true, true]);
    });

    it("bare リポジトリの worktree は bare の場所を repoKey にし、サブモジュールは親と別のリポジトリ", async () => {
      const source = await repoWithCommit();
      const base = await tempDir();
      const bare = join(base, "bare.git");
      await runGit(base, ["clone", "--bare", source, bare]);
      await runGit(bare, ["worktree", "add", "-b", "fb", join(base, "wtb")]);
      const wtb = await probe(join(base, "wtb"));
      const bareResult = await probe(bare);
      expect(wtb).toMatchObject({ kind: "git", git: { repoKey: bare, isLinkedWorktree: true } });
      expect(bareResult).toMatchObject({ kind: "git", git: { repoKey: bare, isLinkedWorktree: false } });

      const outer = await repoWithCommit();
      await new ChildProcessGitRunner().run(outer, ["-c", "protocol.file.allow=always", "submodule", "add", source, "subm"], 10_000);
      await runGit(outer, ["commit", "-m", "sub"]);
      const sub = await probe(join(outer, "subm"));
      const parent = await probe(outer);
      if (sub.kind !== "git" || parent.kind !== "git") throw new Error("unreachable");
      expect(sub.git.repoKey).toMatch(/\.git\/modules\/subm$/);
      expect(sub.git.repoKey).not.toBe(parent.git.repoKey);
    });
  });
});

// 20261004-group-worktree-items（T6）。実物の git で、判定がレイアウトと所属に反映されることを見る（AC8・AC11）。
describe("DefaultGitInfoPoller — 判定のレイアウトへの反映（実物の git）", { timeout: 20_000 }, () => {
  let dirs: string[];
  let service: SessionService;
  let poller: DefaultGitInfoPoller;

  async function repo(): Promise<string> {
    const dir = await makeTempDir("soda-judge-");
    dirs.push(dir);
    await runGit(dir, ["init", "-b", "main"]);
    await runGit(dir, ["config", "user.email", "t@example.com"]);
    await runGit(dir, ["config", "user.name", "t"]);
    await runGit(dir, ["commit", "--allow-empty", "-m", "init"]);
    return dir;
  }

  beforeEach(() => {
    dirs = [];
    service = new SessionService({
      model: new SessionModel(),
      terminals: new AlwaysUpTerminalManager(),
      bus: new EventBus(),
      persist: new NoopPersist(),
      serverVersion: "test",
      host: HOST_INFO,
      scrollbackLines: 1000,
      spawnGraceMs: 1,
      defaultCwd: tmpdir(),
      logger: new MemoryLogger(),
      workspaceLabelDeps: { ...defaultWorkspaceLabelDeps, timeoutMs: 3_000 },
    });
    poller = new DefaultGitInfoPoller(service, new ChildProcessGitRunner());
  });

  afterEach(async () => {
    for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  });

  const layout = () => service.snapshot().layout!;
  const keyOf = (id: string) => service.getWorkspace(id)!.git!.repoKey!;

  it("後から開いた worktree は、同じ項目・同じグループに入る（AC8）", async () => {
    const main = await repo();
    const plain = await makeTempDir("soda-judge-plain-");
    dirs.push(plain);
    const a = (await service.createWorkspace(main, "main")).workspace;
    const p = (await service.createWorkspace(plain, "plain")).workspace;
    const group = service.createGroup("g", a.id);
    await poller.pollNow();
    const key = keyOf(a.id);
    expect(layout()).toEqual({ top: [`g:${group.id}`, "u"], groups: { [group.id]: [`r:${key}`] }, ungrouped: [`w:${p.id}`] });

    const wtDir = `${main}-wt`;
    dirs.push(wtDir);
    await runGit(main, ["worktree", "add", "-b", "feature", wtDir]);
    const wt = (await service.createWorkspace(wtDir, "wt")).workspace;
    expect(layout().ungrouped, "判定の前は「グループなし」の末尾").toEqual([`w:${p.id}`, `w:${wt.id}`]);
    await poller.pollNow();

    expect(keyOf(wt.id)).toBe(key);
    expect(layout()).toEqual({ top: [`g:${group.id}`, "u"], groups: { [group.id]: [`r:${key}`] }, ungrouped: [`w:${p.id}`] });
    expect(service.getWorkspace(wt.id)?.groupId).toBe(group.id);
    expect(service.snapshot().workspaces.map((w) => w.id)).toEqual([a.id, wt.id, p.id]);
  });

  it("2 つの workspace に同時に判定が付いても、届く順に依らず同じ結果になる（引き継ぎ）", async () => {
    const main = await repo();
    const wtDir = `${main}-wt2`;
    dirs.push(wtDir);
    await runGit(main, ["worktree", "add", "-b", "feature2", wtDir]);
    const a = (await service.createWorkspace(main, "main")).workspace;
    const b = (await service.createWorkspace(wtDir, "wt")).workspace;
    const group = service.createGroup("g", a.id); // 本体だけがグループ（b は「グループなし」）
    await poller.pollNow();
    expect(layout()).toEqual({ top: [`g:${group.id}`, "u"], groups: { [group.id]: [`r:${keyOf(a.id)}`] }, ungrouped: [] });
    expect(service.getWorkspace(b.id)?.groupId).toBe(group.id);
  });

  it("pane の場所を別のリポジトリへ・管理外へ・元へ移すと、レイアウトと所属が設計のとおりに変わる（AC11）", async () => {
    const repoA = await repo();
    const repoB = await repo();
    const plain = await makeTempDir("soda-judge-plain-");
    dirs.push(plain);
    const { workspace: a, pane } = await service.createWorkspace(repoA, "a");
    const group = service.createGroup("g", a.id);
    await poller.pollNow();
    const keyA = keyOf(a.id);
    expect(layout()).toEqual({ top: [`g:${group.id}`, "u"], groups: { [group.id]: [`r:${keyA}`] }, ungrouped: [] });

    service.updatePaneRuntime(pane.id, { cwd: repoB });
    await poller.pollNow();
    const keyB = keyOf(a.id);
    expect(keyB).not.toBe(keyA);
    expect(layout(), "別のリポジトリへ: 「グループなし」の末尾").toEqual({ top: [`g:${group.id}`, "u"], groups: { [group.id]: [] }, ungrouped: [`r:${keyB}`] });
    expect(service.getWorkspace(a.id)?.groupId).toBeNull();

    service.updatePaneRuntime(pane.id, { cwd: plain });
    await poller.pollNow();
    expect(service.getWorkspace(a.id)?.git).toBeNull();
    expect(layout(), "管理外へ: 項目が空になるので同じ場所で w:<id> に").toEqual({ top: [`g:${group.id}`, "u"], groups: { [group.id]: [] }, ungrouped: [`w:${a.id}`] });

    service.updatePaneRuntime(pane.id, { cwd: repoA });
    await poller.pollNow();
    expect(layout(), "元のリポジトリへ戻ると、覚えているグループへ").toEqual({ top: [`g:${group.id}`, "u"], groups: { [group.id]: [`r:${keyA}`] }, ungrouped: [] });
    expect(service.getWorkspace(a.id)?.groupId).toBe(group.id);
  });

  // 追補 01 A（同じフォルダの 2 つ目は通常の項目。代表を閉じると次が worktree グループに入る）。実物の git で、worktreeKey が同じ値になることから確かめる。
  describe("同じフォルダの workspace（代表）", () => {
    async function sameFolder() {
      const main = await repo();
      const wtDir = `${main}-wt`;
      dirs.push(wtDir);
      await runGit(main, ["worktree", "add", "-b", "feature", wtDir]);
      const a = (await service.createWorkspace(main, "main")).workspace;
      const wt = (await service.createWorkspace(wtDir, "wt")).workspace;
      await poller.pollNow();
      return { main, a, wt };
    }
    const tree = () => {
      const snap = service.snapshot();
      return sidebarTree(snap.workspaces, snap.groups, snap.layout!, "opened");
    };

    it("同じフォルダで 2 つ目を開くと、worktree グループには入らず通常の項目になる", async () => {
      const { main, a, wt } = await sameFolder();
      const key = keyOf(a.id);
      expect(service.getWorkspace(a.id)?.git?.worktreeKey).toMatch(/\.git$/);
      const a2 = (await service.createWorkspace(main, "main2")).workspace; // 「＋新規」と同じ: 同じフォルダで開く
      await poller.pollNow();
      expect(service.getWorkspace(a2.id)?.git?.worktreeKey).toBe(service.getWorkspace(a.id)?.git?.worktreeKey);
      expect(layout().ungrouped).toEqual([`r:${key}`, `w:${a2.id}`]);
      const snap = service.snapshot();
      expect(repoMembers(snap.workspaces, key).map((w) => w.id)).toEqual([a.id, wt.id]);
      const rows = tree().flatMap((r) => r.items);
      expect(rows.map((r) => (r.kind === "worktreeGroup" ? ["group", r.head.id, ...r.children.map((c) => c.id)] : ["plain", r.workspace.id]))).toEqual([
        ["group", a.id, wt.id],
        ["plain", a2.id],
      ]);
      // 2 つ目だけグループへ入れられる（worktree グループは動かない）。
      const g = service.createGroup("g", a2.id);
      expect(layout().groups[g.id]).toEqual([`w:${a2.id}`]);
      expect(layout().ungrouped).toEqual([`r:${key}`]);
    });

    it("代表を閉じると、同じフォルダの次の workspace が代表になり、worktree グループに入る（位置は項目のまま）", async () => {
      const { main, a, wt } = await sameFolder();
      const key = keyOf(a.id);
      const a2 = (await service.createWorkspace(main, "main2")).workspace;
      await poller.pollNow();
      await service.closeWorkspace(a.id);
      expect(layout().ungrouped).toEqual([`r:${key}`]);
      const snap = service.snapshot();
      expect(repoMembers(snap.workspaces, key).map((w) => w.id)).toEqual([a2.id, wt.id]); // a2 が本体の代表になり、worktree グループの先頭
      const items = tree().flatMap((r) => r.items);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ kind: "worktreeGroup", head: { id: a2.id }, children: [{ id: wt.id }] });
      // 次の周期の判定が来ても変わらない。
      await poller.pollNow();
      expect(layout().ungrouped).toEqual([`r:${key}`]);
    });

    it("pane の場所が別のフォルダへ移ると、代表が交代する: 移った workspace は元の項目を離れ、同じフォルダの次が代表になる", async () => {
      const { main, a } = await sameFolder();
      const key = keyOf(a.id);
      const plain = await makeTempDir("soda-judge-plain-");
      dirs.push(plain);
      const { workspace: a2 } = await service.createWorkspace(main, "main2");
      await poller.pollNow();
      const pane = service.snapshot().panes.find((p) => service.getTab(p.tabId)?.workspaceId === a.id)!;
      service.updatePaneRuntime(pane.id, { cwd: plain });
      await poller.pollNow();
      expect(service.getWorkspace(a.id)?.git).toBeNull();
      expect(layout().ungrouped).toEqual([`r:${key}`, `w:${a.id}`]); // a は管理外の通常の項目として、項目の直後へ
      const snap = service.snapshot();
      expect(repoMembers(snap.workspaces, key)[0]!.id).toBe(a2.id);
    });
  });

  it("消えたフォルダに居る pane（取れない）は何も変えない", async () => {
    const dir = await repo();
    const { workspace: a, pane } = await service.createWorkspace(dir, "a");
    await poller.pollNow();
    const before = layout();
    const gone = await makeTempDir("soda-judge-gone-");
    await rm(gone, { recursive: true, force: true });
    service.updatePaneRuntime(pane.id, { cwd: gone });
    await poller.pollNow();
    expect(layout()).toEqual(before);
    expect(service.getWorkspace(a.id)?.git?.repoKey).toBeTruthy();
  });
});

// 20261004-group-worktree-items（T9）。実物の git と実物の session.json で、保存 → 復元 → 最初の 1 周で判定が戻り並びが変わらないことを見る（AC9）。
describe("DefaultGitInfoPoller — 保存 → 復元 → 最初の 1 周（実物の git・実物の session.json）", { timeout: 20_000 }, () => {
  let dirs: string[];
  const logger = new MemoryLogger();

  const makeService = () =>
    new SessionService({
      model: new SessionModel(),
      terminals: new AlwaysUpTerminalManager(),
      bus: new EventBus(),
      persist: new NoopPersist(),
      serverVersion: "test",
      host: HOST_INFO,
      scrollbackLines: 1000,
      spawnGraceMs: 1,
      defaultCwd: tmpdir(),
      logger,
      workspaceLabelDeps: { ...defaultWorkspaceLabelDeps, timeoutMs: 3_000 },
    });

  async function repo(): Promise<string> {
    const dir = await makeTempDir("soda-persist-");
    dirs.push(dir);
    await runGit(dir, ["init", "-b", "main"]);
    await runGit(dir, ["config", "user.email", "t@example.com"]);
    await runGit(dir, ["config", "user.name", "t"]);
    await runGit(dir, ["commit", "--allow-empty", "-m", "init"]);
    return dir;
  }

  /** 保存して読み直す（実物の `FsSessionFile`）。 */
  async function saveAndLoad(service: SessionService) {
    const stateDir = await makeTempDir("soda-persist-state-");
    dirs.push(stateDir);
    const file = new FsSessionFile(stateDir);
    await file.save(toSessionFileData(service));
    const loaded = await file.load();
    if (loaded.kind !== "ok") throw new Error(`load failed: ${loaded.kind}`);
    return loaded.data;
  }

  beforeEach(() => {
    dirs = [];
  });
  afterEach(async () => {
    for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  });

  it("グループ・worktree グループ・管理外が混ざった並びは、復元の直後も最初の 1 周の後も停止前と同じ", async () => {
    const main = await repo();
    const wtDir = `${main}-wt`;
    dirs.push(wtDir);
    await runGit(main, ["worktree", "add", "-b", "feature", wtDir]);
    const other = await repo();
    const plain = await makeTempDir("soda-persist-plain-");
    dirs.push(plain);

    const before = makeService();
    const a = (await before.createWorkspace(main, "main")).workspace;
    const w = (await before.createWorkspace(wtDir, "wt")).workspace;
    const o = (await before.createWorkspace(other, "other")).workspace;
    const p = (await before.createWorkspace(plain, "plain")).workspace;
    await new DefaultGitInfoPoller(before, new ChildProcessGitRunner()).pollNow();
    const group = before.createGroup("work", a.id); // main リポジトリ（本体 + worktree）をグループへ
    before.moveItem({ kind: "workspace", workspaceId: p.id }, { kind: "workspace", workspaceId: o.id }); // 管理外を other の前へ
    const key = before.getWorkspace(a.id)!.git!.repoKey!;
    const expectedLayout = before.snapshot().layout!;
    const expectedOrder = before.snapshot().workspaces.map((x) => x.id);
    expect(expectedLayout).toEqual({ top: [`g:${group.id}`, "u"], groups: { [group.id]: [`r:${key}`] }, ungrouped: [`w:${p.id}`, `r:${before.getWorkspace(o.id)!.git!.repoKey}`] });

    const data = await saveAndLoad(before);
    expect(data.layout).toEqual(expectedLayout);
    expect(data.repoGroups).toEqual({ [key]: group.id });

    const after = makeService();
    await after.restore(data);
    // 復元の直後（判定の確認の前）: 保存した repoKey で束ねて並ぶ。ブランチ名と件数はまだ無い。
    expect(after.snapshot().layout).toEqual(expectedLayout);
    expect(after.snapshot().workspaces.map((x) => x.id)).toEqual(expectedOrder);
    expect(after.getWorkspace(w.id)?.git).toEqual({ branch: null, ahead: 0, behind: 0, repoKey: key, isLinkedWorktree: true, worktreeKey: before.getWorkspace(w.id)!.git!.worktreeKey });
    expect(after.getWorkspace(w.id)?.groupId).toBe(group.id);
    expect(after.getWorkspace(p.id)?.git).toBeNull();

    // 最初の 1 周: 判定が戻る（ブランチが入る）が、並びは変わらない。
    await new DefaultGitInfoPoller(after, new ChildProcessGitRunner()).pollNow();
    expect(after.getWorkspace(a.id)?.git).toMatchObject({ branch: "main", repoKey: key, isLinkedWorktree: false });
    expect(after.getWorkspace(w.id)?.git).toMatchObject({ branch: "feature", repoKey: key, isLinkedWorktree: true });
    expect(after.snapshot().layout).toEqual(expectedLayout);
    expect(after.snapshot().workspaces.map((x) => x.id)).toEqual(expectedOrder);
  });

  it("T29: 後から同じフォルダへ来た workspace は代表にならず、再起動をまたいでも同じ代表（保存した representative が作った順に勝つ）。旗の無い保存は作った順", async () => {
    const dir = await makeTempDir("soda-persist-");
    dirs.push(dir);
    const git = (worktreeKey: string): GitJudgement => ({ kind: "git", git: { branch: "b", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: true, worktreeKey } });
    const before = makeService();
    const first = (await before.createWorkspace(dir, "first")).workspace; // 先に作った
    const second = (await before.createWorkspace(dir, "second")).workspace;
    before.updateWorkspaceGit(first.id, git("/r/.git/worktrees/elsewhere"));
    before.updateWorkspaceGit(second.id, git("/r/.git/worktrees/a")); // second が先にそのフォルダを持つ
    before.updateWorkspaceGit(first.id, git("/r/.git/worktrees/a")); // first は後から cd で来た（作ったのは先）
    expect(before.getWorkspace(second.id)?.representative).toBe(true);
    expect(before.getWorkspace(first.id)?.representative).toBe(false);

    const data = await saveAndLoad(before);
    expect(data.workspaces.map((w) => [w.id, w.representative])).toEqual([[second.id, true], [first.id, false]]) // 平らな順は代表が先;
    const after = makeService();
    await after.restore(data);
    expect(after.getWorkspace(second.id)?.representative).toBe(true);
    expect(after.getWorkspace(first.id)?.representative).toBe(false);
    expect(after.snapshot().layout).toEqual(before.snapshot().layout);

    // 旗の無い保存（古い版）は作った順（w<番号> の小さいほう）。
    const legacy = makeService();
    await legacy.restore({ ...data, workspaces: data.workspaces.map(({ representative: _r, ...rest }) => rest) });
    expect(legacy.getWorkspace(first.id)?.representative).toBe(true);
    expect(legacy.getWorkspace(second.id)?.representative).toBe(false);
  });

  it("同じフォルダの 2 つ目（通常の項目）は、復元の直後も最初の 1 周の後も代表にならない（worktreeKey を保存する）", async () => {
    const main = await repo();
    const before = makeService();
    const a = (await before.createWorkspace(main, "main")).workspace;
    const a2 = (await before.createWorkspace(main, "main2")).workspace;
    await new DefaultGitInfoPoller(before, new ChildProcessGitRunner()).pollNow();
    const key = before.getWorkspace(a.id)!.git!.repoKey!;
    expect(before.snapshot().layout).toEqual({ top: ["u"], groups: {}, ungrouped: [`r:${key}`, `w:${a2.id}`] });

    const data = await saveAndLoad(before);
    expect(data.workspaces.map((w) => w.worktreeKey)).toEqual([key, key]);
    const after = makeService();
    await after.restore(data);
    expect(after.snapshot().layout).toEqual(before.snapshot().layout);
    expect(repoMembers(after.snapshot().workspaces, key).map((w) => w.id)).toEqual([a.id]);
    await new DefaultGitInfoPoller(after, new ChildProcessGitRunner()).pollNow();
    expect(after.snapshot().layout).toEqual(before.snapshot().layout);
    expect(after.snapshot().workspaces.map((w) => w.id)).toEqual([a.id, a2.id]);
  });

  // 同じ周に入った判定は、届いた順ではなく作った順で反映する（decisions D49）。1 つ目の判定を遅らせる／2 つ目を遅らせる、の両方向で a が代表。
  for (const slow of ["first", "second"] as const) {
    it(`同じフォルダの 2 つの workspace の判定が同じ周で届く順（${slow === "first" ? "b が先" : "a が先"}）に依らず、作った順の a が代表になる`, async () => {
      const main = await repo();
      const svc = makeService();
      const a = (await svc.createWorkspace(main, "a")).workspace;
      const b = (await svc.createWorkspace(main, "b")).workspace;
      const real = new ChildProcessGitRunner();
      let heads = 0;
      const delayed: GitRunner = {
        run: async (cwd, args, t) => {
          if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
            const n = ++heads; // 1 つ目の workspace の probe が先に始まる
            if ((slow === "first" && n === 1) || (slow === "second" && n === 2)) await new Promise((r) => setTimeout(r, 150));
          }
          return real.run(cwd, args, t);
        },
      };
      await new DefaultGitInfoPoller(svc, delayed).pollNow();
      expect(heads).toBe(2);
      expect(svc.getWorkspace(a.id)?.representative).toBe(true);
      expect(svc.getWorkspace(b.id)?.representative).toBe(false);
      const key = svc.getWorkspace(a.id)!.git!.repoKey!;
      expect(svc.snapshot().layout).toEqual({ top: ["u"], groups: {}, ungrouped: [`r:${key}`, `w:${b.id}`] });
    });
  }

  // 項目の判定が変わらない結果（ブランチ名だけの更新）は、同じ周の遅い 1 件を待たずに反映する（decisions D51。再レビューの指摘）。
  it("遅い workspace があっても、ほかの workspace のブランチ名の更新は、その 1 件を待たずに反映される", async () => {
    const slowRepo = await repo();
    const fastRepo = await repo();
    const svc = makeService();
    const slow = (await svc.createWorkspace(slowRepo, "slow")).workspace;
    const fast = (await svc.createWorkspace(fastRepo, "fast")).workspace;
    const real = new ChildProcessGitRunner();
    await new DefaultGitInfoPoller(svc, real).pollNow(); // 1 周目で判定を確定させる
    await runGit(fastRepo, ["checkout", "-q", "-b", "topic"]);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const gated: GitRunner = {
      run: async (cwd, args, t) => {
        if (cwd === slowRepo) await gate; // slow の git は、門を開けるまで返らない
        return real.run(cwd, args, t);
      },
    };
    const round = new DefaultGitInfoPoller(svc, gated).pollNow();
    // 陽性の対照: 門を開ける前に、fast のブランチ名が変わる。
    await vi.waitFor(() => expect(svc.getWorkspace(fast.id)?.git?.branch).toBe("topic"));
    expect(svc.getWorkspace(slow.id)?.git?.branch).not.toBe("topic");
    release();
    await round;
  });

  it("平らな順で b が a より前に居ても（判定が届く順・平らな順に依らず）作った順の a が代表になる", async () => {
    const main = await repo();
    const svc = makeService();
    const a = (await svc.createWorkspace(main, "a")).workspace;
    const b = (await svc.createWorkspace(main, "b")).workspace;
    svc.moveItem({ kind: "workspace", workspaceId: b.id }, { kind: "workspace", workspaceId: a.id }); // b を a の前へ
    expect(svc.snapshot().workspaces.map((w) => w.id)).toEqual([b.id, a.id]);
    await new DefaultGitInfoPoller(svc, new ChildProcessGitRunner()).pollNow();
    expect(svc.getWorkspace(a.id)?.representative).toBe(true);
    expect(svc.getWorkspace(b.id)?.representative).toBe(false);
  });

  it("フォルダが消えて判定が取れない workspace は、復元した判定・並びのまま残る（取れない結果は何も変えない）", async () => {
    const main = await repo();
    const other = await repo();
    const before = makeService();
    const a = (await before.createWorkspace(main, "main")).workspace;
    const o = (await before.createWorkspace(other, "other")).workspace;
    await new DefaultGitInfoPoller(before, new ChildProcessGitRunner()).pollNow();
    const group = before.createGroup("work", a.id);
    const key = before.getWorkspace(a.id)!.git!.repoKey!;
    const data = await saveAndLoad(before);

    await rm(main, { recursive: true, force: true }); // 停止の間にフォルダが消えた
    const after = makeService();
    await after.restore(data);
    await new DefaultGitInfoPoller(after, new ChildProcessGitRunner()).pollNow();
    expect(after.getWorkspace(a.id)?.git).toMatchObject({ repoKey: key, branch: null });
    expect(after.getWorkspace(a.id)?.groupId).toBe(group.id);
    expect(after.snapshot().layout!.groups[group.id]).toEqual([`r:${key}`]);
    expect(after.getWorkspace(o.id)?.git).toMatchObject({ branch: "main" });
  });

  it("layout の無い古い保存（repoKey だけ有る）は仮の状態で始まり、起動直後から束ねて並び、保存にも layout を書かない", async () => {
    const main = await repo();
    const wtDir = `${main}-wt`;
    dirs.push(wtDir);
    await runGit(main, ["worktree", "add", "-b", "feature", wtDir]);
    const before = makeService();
    await before.createWorkspace(main, "main");
    await before.createWorkspace(wtDir, "wt");
    await new DefaultGitInfoPoller(before, new ChildProcessGitRunner()).pollNow();
    const full = await saveAndLoad(before);
    const legacy = { ...full }; // 以前の版の保存（repoKey だけ有る形）
    delete legacy.layout;
    delete legacy.repoGroups;

    const after = makeService();
    await after.restore(legacy);
    const key = full.workspaces[0]!.repoKey!;
    expect(after.persistedLayout()).toBeNull();
    expect(after.snapshot().layout).toEqual({ top: ["u"], groups: {}, ungrouped: [`r:${key}`] });
    await new DefaultGitInfoPoller(after, new ChildProcessGitRunner()).pollNow();
    expect(after.snapshot().layout).toEqual({ top: ["u"], groups: {}, ungrouped: [`r:${key}`] });
    const resaved = toSessionFileData(after);
    expect("layout" in resaved).toBe(false);
    expect("repoGroups" in resaved).toBe(false);
    expect(resaved.workspaces.map((x) => x.repoKey)).toEqual([key, key]);
  });
});

async function mkdirTemp(): Promise<string> {
  const dir = await makeTempDir("soda-gitpoller-plain-");
  await mkdir(dir, { recursive: true });
  return dir;
}
