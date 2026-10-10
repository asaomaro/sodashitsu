import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { open as fsOpen } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerEvent } from "@sodashitsu/protocol";
import { EventBus } from "../bus/EventBus.js";
import { DisplayService } from "../display/DisplayService.js";
import { MemoryLogger } from "../log/Logger.js";
import { ManualClock } from "../machine/testing.js";
import { ApprovalStore } from "./ApprovalStore.js";
import { ExtensionHost, type ExtensionHostOptions } from "./ExtensionHost.js";
import { FakeExtChild, FakeGroups } from "./testing.js";

/** ExtensionHost の単体テスト用の組み立て（偽の子・偽の時計・本物の台帳と bus・一時ディレクトリの設定）。 */
export const sleep = (ms = 5): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** ファイルの I/O（`fs`・`fs/promises` の未完了の要求）。 */
const FS_RESOURCES: ReadonlySet<string> = new Set(["FSReqPromise", "FSReqCallback", "CloseReq"]);

/**
 * ファイルの I/O が落ち着くのを待つ（要求が 1 つも残らない状態が、続けて 3 回の macrotask の間続くまで。上限 10 秒）。
 * 偽の時計を進めたあとの、`ApprovalStore` などの実ファイルの読み書き（reconcile・見張りの 1 回）は、実時間で終わる。固定の短い待ち（`sleep(2)`）だけでは、
 * 負荷が高い（ディスク・CPU を取り合っている）と、終わる前に次の確認に進んで落ちる。「終わった」を、待つ側が見て決める。
 */
export async function settleIo(maxMs = 10_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  let quiet = 0;
  while (quiet < 3 && Date.now() < deadline) {
    await new Promise<void>((r) => setImmediate(r));
    quiet = process.getActiveResourcesInfo().some((n) => FS_RESOURCES.has(n)) ? 0 : quiet + 1;
  }
}

export interface HostHarness {
  dir: string;
  clock: ManualClock;
  groups: FakeGroups;
  children: FakeExtChild[];
  spawnCalls: { file: string; args: string[]; cwd: string; env: Record<string, string> }[];
  bus: EventBus;
  events: ServerEvent[];
  displays: DisplayService;
  logger: MemoryLogger;
  host: ExtensionHost;
  panes: Map<string, { workspaceId: string; label?: string }>;
  /** workspace（id → 開いた場所）。`snapshot()` が返す。 */
  workspaces: Map<string, { cwd: string }>;
  scriptEnabled: { value: boolean };
  /** 同じ session の承認の記録（直接書く・読む）。 */
  approvalStore: ApprovalStore;
  /** リポジトリ（`.git/HEAD` と、あれば `.soda/extensions.json`）を作り、根の実体のパスを返す。 */
  makeRepo(name: string, entries?: unknown[] | null, mode?: number): Promise<string>;
  /** プロジェクトの設定を書き換える（0600）。 */
  writeProjectConfig(root: string, entries: unknown[], mode?: number): Promise<void>;
  /** workspace と pane を足し、bus に `workspace.created` を出す。 */
  addWorkspace(id: string, cwd: string, paneId?: string): void;
  /** workspace を消し（pane も）、bus に `workspace.closed` を出す。 */
  removeWorkspace(id: string): void;
  /** 設定を書く（0600）。 */
  writeConfig(entries: unknown[], raw?: string): Promise<void>;
  /** 条件が成り立つまで、実時間を少しずつ進めて待つ（`advanceMs` があれば、偽の時計も進める）。 */
  until(cond: () => boolean, advanceMs?: number): Promise<void>;
  /** Promise が決まるまで、偽の時計を 50 ミリ秒ずつ進めながら待つ（止める処理の待ちは、偽の時計に依る）。 */
  run<T>(p: Promise<T>): Promise<T>;
  /** 偽の時計を進めながら、I/O を流す。 */
  drive(ms: number, step?: number): Promise<void>;
  cleanup(): Promise<void>;
}

export async function makeHost(
  o: {
    timings?: NonNullable<NonNullable<ExtensionHostOptions["deps"]>["timings"]>;
    limits?: NonNullable<NonNullable<ExtensionHostOptions["deps"]>["limits"]>;
    open?: (path: string, flags: number) => Promise<import("node:fs/promises").FileHandle>;
    stateOpen?: (path: string, flags: number) => Promise<import("node:fs/promises").FileHandle>;
    inScope?: NonNullable<ExtensionHostOptions["deps"]>["inScope"];
    isScreenKind?: (id: string) => boolean;
    groupDiesOn?: "SIGTERM" | "SIGKILL" | "never";
    panes?: string[];
    platform?: NodeJS.Platform;
    approvalOpen?: (path: string, flags: number) => Promise<import("node:fs/promises").FileHandle>;
    approvalDeps?: Partial<import("./ApprovalStore.js").ApprovalFileDeps>;
    /** 拡張の起動に渡る元の環境変数（既定は PATH=/usr/bin と秘密）。 */
    baseEnv?: NodeJS.ProcessEnv;
    pathExists?: (path: string) => Promise<boolean>;
    projectFile?: NonNullable<ExtensionHostOptions["deps"]>["projectFile"];
    projectRoot?: NonNullable<ExtensionHostOptions["deps"]>["projectRoot"];
  } = {},
): Promise<HostHarness> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "ext-host-")));
  const clock = new ManualClock();
  const groups = new FakeGroups();
  const children: FakeExtChild[] = [];
  const spawnCalls: HostHarness["spawnCalls"] = [];
  const bus = new EventBus();
  const events: ServerEvent[] = [];
  bus.subscribe((e) => events.push(e));
  const logger = new MemoryLogger();
  const panes = new Map<string, { workspaceId: string; label?: string }>();
  for (const p of o.panes ?? ["p1", "p2"]) panes.set(p, { workspaceId: "w1" });
  const workspaces = new Map<string, { cwd: string }>([["w1", { cwd: "/w1" }]]);
  const scriptEnabled = { value: true };
  const displays = new DisplayService({ bus, paneExists: (id) => panes.has(id), isScreenKind: () => true, scriptEnabled: () => scriptEnabled.value });
  groups.onCall = (pid, sig) => {
    if (sig === 0) return;
    queueMicrotask(() => {
      const c = children.find((x) => x.pid === pid);
      if (c && !groups.has(pid)) c.exit(null, sig);
    });
  };
  let n = 0;
  const session = {
    snapshot: () =>
      ({
        workspaces: [...workspaces.entries()].map(([id, w]) => ({ id, label: id.toUpperCase(), cwd: w.cwd })),
        tabs: [...workspaces.keys()].map((id) => ({ id: `t-${id}`, workspaceId: id })),
        panes: [...panes.entries()].map(([id, p]) => ({ id, tabId: `t-${p.workspaceId}`, label: p.label ?? null, agent: null })),
      }) as never,
    commandContext: ((id: string) => {
      const ws = panes.get(id)?.workspaceId ?? "w1";
      return { workspaceId: ws, tabId: `t-${ws}`, paneId: id, cwd: workspaces.get(ws)?.cwd ?? "/w1", defaultCwd: "/" };
    }) as never,
    hasPane: (id: string) => panes.has(id),
  };
  const host = new ExtensionHost({
    stateDir: dir,
    sessionRoot: dir,
    session,
    displays,
    bus,
    isScreenKind: o.isScreenKind ?? ((id) => id !== "external"),
    baseEnv: o.baseEnv ?? { PATH: "/usr/bin", SODACTL_TOKEN: "TOKEN-SECRET", SODA_PANE_ID: "pane-x" },
    homeDir: "/home/test",
    logger,
    clock,
    newId: () => `run${++n}`,
    deps: {
      spawn: (file, args, opts) => {
        const c = new FakeExtChild(1000 + children.length);
        groups.add(c.pid!, o.groupDiesOn ?? "SIGTERM");
        children.push(c);
        spawnCalls.push({ file, args, cwd: opts.cwd, env: opts.env });
        return c;
      },
      killGroup: groups.kill,
      file: { open: o.open ?? ((p, f) => fsOpen(p, f)) },
      ...(o.stateOpen ? { stateFile: { open: o.stateOpen } } : {}),
      ...(o.approvalOpen || o.approvalDeps ? { approvalFile: { ...(o.approvalDeps ?? {}), ...(o.approvalOpen ? { open: o.approvalOpen } : {}) } } : {}),
      ...(o.projectFile ? { projectFile: o.projectFile } : {}),
      ...(o.projectRoot ? { projectRoot: o.projectRoot } : {}),
      ...(o.pathExists ? { pathExists: o.pathExists } : {}),
      ...(o.timings ? { timings: o.timings } : {}),
      ...(o.limits ? { limits: o.limits } : {}),
      ...(o.inScope ? { inScope: o.inScope } : {}),
      ...(o.platform ? { platform: o.platform } : {}),
    },
  });
  const h: HostHarness = {
    dir,
    clock,
    groups,
    children,
    spawnCalls,
    bus,
    events,
    displays,
    logger,
    host,
    panes,
    workspaces,
    scriptEnabled,
    approvalStore: new ApprovalStore(dir),
    async makeRepo(name, entries, mode = 0o600) {
      const root = join(dir, "repos", name);
      await mkdir(join(root, ".git"), { recursive: true });
      await writeFile(join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
      if (entries) await h.writeProjectConfig(root, entries, mode);
      return root;
    },
    async writeProjectConfig(root, entries, mode = 0o600) {
      await mkdir(join(root, ".soda"), { recursive: true });
      const p = join(root, ".soda", "extensions.json");
      await writeFile(p, JSON.stringify({ extensions: entries }), { mode });
      await chmod(p, mode);
    },
    addWorkspace(id, cwd, paneId) {
      workspaces.set(id, { cwd });
      if (paneId) panes.set(paneId, { workspaceId: id });
      bus.publish({ event: "workspace.created", data: { workspace: { id, label: id, cwd } as never } });
    },
    removeWorkspace(id) {
      workspaces.delete(id);
      for (const [pid, p] of [...panes]) if (p.workspaceId === id) panes.delete(pid);
      bus.publish({ event: "workspace.closed", data: { workspaceId: id } });
    },
    async writeConfig(entries, raw) {
      const p = join(dir, "extensions.json");
      await writeFile(p, raw ?? JSON.stringify({ extensions: entries }), { mode: 0o600 });
      await chmod(p, 0o600);
    },
    async until(cond, advanceMs = 0) {
      for (let i = 0; i < 600; i++) {
        if (cond()) return;
        if (advanceMs > 0) clock.advance(advanceMs);
        await sleep(3);
        await settleIo();
      }
      throw new Error("until: 条件が成り立ちませんでした");
    },
    async run<T>(p: Promise<T>): Promise<T> {
      let done = false;
      let failure: unknown;
      let failed = false;
      p.then(
        () => (done = true),
        (e) => {
          done = true;
          failed = true;
          failure = e;
        },
      );
      for (let i = 0; i < 1500 && !done; i++) {
        clock.advance(50);
        await sleep(2);
        await settleIo();
      }
      if (!done) throw new Error("run: 決まりませんでした");
      if (failed) throw failure;
      return p;
    },
    async drive(ms, step = 50) {
      for (let t = 0; t < ms; t += step) {
        clock.advance(Math.min(step, ms - t));
        await sleep(2);
        await settleIo(); // 偽の時計を進めて起きた実ファイルの I/O が終わってから、次の一歩へ（負荷が高くても、終わる前に進まない）
      }
      await sleep(5);
      await settleIo();
    },
    async cleanup() {
      host.dispose();
      for (const c of children) c.exit(0);
      await rm(dir, { recursive: true, force: true });
    },
  };
  return h;
}

export const ext = (id: string, extra: Record<string, unknown> = {}) => ({ id, command: `node ${id}.mjs`, ...extra });
