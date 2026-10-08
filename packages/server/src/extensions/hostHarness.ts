import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { open as fsOpen } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerEvent } from "@sodashitsu/protocol";
import { EventBus } from "../bus/EventBus.js";
import { DisplayService } from "../display/DisplayService.js";
import { MemoryLogger } from "../log/Logger.js";
import { ManualClock } from "../machine/testing.js";
import { ExtensionHost, type ExtensionHostOptions } from "./ExtensionHost.js";
import { FakeExtChild, FakeGroups } from "./testing.js";

/** ExtensionHost の単体テスト用の組み立て（偽の子・偽の時計・本物の台帳と bus・一時ディレクトリの設定）。 */
export const sleep = (ms = 5): Promise<void> => new Promise((r) => setTimeout(r, ms));

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
  scriptEnabled: { value: boolean };
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
    inScope?: NonNullable<ExtensionHostOptions["deps"]>["inScope"];
    isScreenKind?: (id: string) => boolean;
    groupDiesOn?: "SIGTERM" | "SIGKILL" | "never";
    panes?: string[];
    platform?: NodeJS.Platform;
  } = {},
): Promise<HostHarness> {
  const dir = await mkdtemp(join(tmpdir(), "ext-host-"));
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
        workspaces: [{ id: "w1", label: "W1", cwd: "/w1" }],
        tabs: [{ id: "t1", workspaceId: "w1" }],
        panes: [...panes.entries()].map(([id, p]) => ({ id, tabId: "t1", label: p.label ?? null, agent: null })),
      }) as never,
    commandContext: ((id: string) => ({ workspaceId: panes.get(id)?.workspaceId ?? "w1", tabId: "t1", paneId: id, cwd: "/w1", defaultCwd: "/" })) as never,
    hasPane: (id: string) => panes.has(id),
  };
  const host = new ExtensionHost({
    stateDir: dir,
    sessionRoot: dir,
    session,
    displays,
    bus,
    isScreenKind: o.isScreenKind ?? ((id) => id !== "external"),
    baseEnv: { PATH: "/usr/bin", SODACTL_TOKEN: "TOKEN-SECRET", SODA_PANE_ID: "pane-x" },
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
    scriptEnabled,
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
      }
      if (!done) throw new Error("run: 決まりませんでした");
      if (failed) throw failure;
      return p;
    },
    async drive(ms, step = 50) {
      for (let t = 0; t < ms; t += step) {
        clock.advance(Math.min(step, ms - t));
        await sleep(2);
      }
      await sleep(5);
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
