import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTempDir } from "./persist/atomicFile.js";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";
import type { ComposedServer } from "./composeServer.js";

vi.setConfig({ testTimeout: 30_000 });

const run = promisify(execFile);

async function waitFor(cond: () => boolean, what: string): Promise<void> {
  const until = Date.now() + 10_000;
  while (!cond()) {
    if (Date.now() > until) throw new Error(`timeout: ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

// 20261004-group-worktree-items（T10）：layout の無い保存から始めたサーバが、起動後の最初の 1 周の確認で移行を確定し、保存に layout を書く（実物の git・実物の session.json）。
describe("composeServer: 移行の確定（最初の 1 周の合図）", () => {
  const cleanups: (() => Promise<unknown> | unknown)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  async function temp(prefix: string): Promise<string> {
    const dir = await makeTempDir(prefix);
    cleanups.push(() => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    return dir;
  }

  async function start(stateDir: string): Promise<ComposedServer> {
    const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
    let closed = false;
    const close = server.close.bind(server);
    server.close = async () => {
      if (closed) return;
      closed = true;
      await close();
    };
    cleanups.push(() => server.close());
    return server;
  }

  it("本体だけがグループに居る古い保存: 最初の 1 周の後に確定し、worktree も同じグループへ入り、session.json に layout・repoGroups が書かれる", async () => {
    const main = await temp("soda-mig-repo-");
    const wt = `${main}-wt`;
    cleanups.push(() => rm(wt, { recursive: true, force: true }));
    await mkdir(main, { recursive: true });
    await run("git", ["init", "-b", "main"], { cwd: main });
    await run("git", ["config", "user.email", "t@example.com"], { cwd: main });
    await run("git", ["config", "user.name", "t"], { cwd: main });
    await run("git", ["commit", "--allow-empty", "-m", "init"], { cwd: main });
    await run("git", ["worktree", "add", "-b", "feature", wt], { cwd: main });

    // 1 回目の起動: 本体と worktree の workspace を作り、本体だけをグループへ入れ、判定（repoKey）を保存まで通す。
    const stateDir = await temp("soda-mig-state-");
    const first = await start(stateDir);
    const body = (await first.session.createWorkspace(main, "main")).workspace;
    const tree = (await first.session.createWorkspace(wt, "wt")).workspace;
    await first.gitPoller.pollNow();
    const group = first.session.createGroup("work", body.id);
    await first.persist.flush();
    await first.close();

    // 以前の版の保存に戻す（layout・repoGroups が無く、所属は本体の groupId だけ）。
    const file = join(stateDir, "session.json");
    const data = JSON.parse(await readFile(file, "utf8")) as {
      layout?: unknown;
      repoGroups?: unknown;
      workspaces: { id: string; groupId?: string | null; repoKey?: string | null }[];
    };
    expect(data.layout).toBeDefined(); // 1 回目は新しい保存
    delete data.layout;
    delete data.repoGroups;
    for (const w of data.workspaces) {
      if (w.id === body.id) w.groupId = group.id;
      if (w.id === tree.id) w.groupId = null;
      expect(w.repoKey).toBeTruthy();
    }
    await writeFile(file, JSON.stringify(data));

    // 2 回目の起動: 仮の状態で始まり、最初の 1 周の合図で確定する。
    const second = await start(stateDir);
    await waitFor(() => second.session.persistedLayout() !== null, "layout is confirmed after the first round");
    expect(second.session.getWorkspace(tree.id)?.groupId).toBe(group.id);
    expect(second.session.snapshot().layout?.groups[group.id]).toHaveLength(1);
    await second.persist.flush();
    const saved = JSON.parse(await readFile(file, "utf8")) as { layout?: { top: string[] }; repoGroups?: Record<string, string> };
    expect(saved.layout?.top).toContain(`g:${group.id}`); // 初めの workspace（このリポジトリの cwd）も別にある
    expect(Object.values(saved.repoGroups ?? {})).toEqual([group.id]);
  });
});
