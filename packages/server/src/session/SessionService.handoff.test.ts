import type { HostInfo } from "@sodashitsu/protocol";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EventBus } from "../bus/EventBus.js";
import { MemoryLogger } from "../log/Logger.js";
import type { SessionFileData } from "../persist/SessionFile.js";
import type { PaneHistoryEntry } from "../persist/PaneHistoryFile.js";
import type { TerminalHost } from "../terminal/TerminalHost.js";
import type {
  AdoptPaneOptions,
  CreatePaneOptions,
  TerminalManager,
} from "../terminal/TerminalManager.js";
import type { PersistScheduler } from "./PersistScheduler.js";
import { SessionModel } from "./SessionModel.js";
import { type AdoptedPaneSpec, SessionService } from "./SessionService.js";

/** 引き継ぎ（20260926-live-handoff）の復元の分岐を見るための偽の端末。 */
class Host implements TerminalHost {
  readonly mirrorWrites: string[] = [];
  readonly writes: string[] = [];
  nudged = 0;
  disposed = false;
  private readonly exitListeners = new Set<(code: number) => void>();
  readonly mirror = {
    write: (c: string) => this.mirrorWrites.push(c),
  } as unknown as TerminalHost["mirror"];
  readonly fanout = {} as TerminalHost["fanout"];
  constructor(
    readonly paneId: string,
    readonly pid: number,
  ) {}
  write(input: string | Uint8Array): void {
    this.writes.push(typeof input === "string" ? input : new TextDecoder().decode(input));
  }
  writeModal(): Promise<void> {
    return Promise.resolve();
  }
  resize(): void {}
  lastOutputAt(): number {
    return Date.now();
  }
  onExit(cb: (code: number) => void) {
    this.exitListeners.add(cb);
    return { dispose: () => this.exitListeners.delete(cb) };
  }
  dispose(): void {
    this.disposed = true;
  }
  nudgeRedraw(): void {
    this.nudged++;
  }
  fireExit(code: number): void {
    for (const fn of [...this.exitListeners]) fn(code);
  }
}

class Terminals implements TerminalManager {
  readonly hosts = new Map<string, Host>();
  readonly created: string[] = [];
  readonly adopted: { paneId: string; opts: AdoptPaneOptions }[] = [];
  /** この fd の adopt を失敗させる。 */
  failFds = new Set<number>();
  create(paneId: string, _opts: CreatePaneOptions): TerminalHost {
    this.created.push(paneId);
    const h = new Host(paneId, 1000);
    this.hosts.set(paneId, h);
    return h;
  }
  adopt(paneId: string, opts: AdoptPaneOptions): TerminalHost {
    if (this.failFds.has(opts.fd)) throw new Error("bad fd");
    this.adopted.push({ paneId, opts });
    const h = new Host(paneId, opts.pid);
    this.hosts.set(paneId, h);
    return h;
  }
  get(paneId: string): TerminalHost | undefined {
    return this.hosts.get(paneId);
  }
  resize(): void {}
  dispose(paneId: string): void {
    this.hosts.get(paneId)?.dispose();
    this.hosts.delete(paneId);
  }
}

class Persist implements PersistScheduler {
  touch(): void {}
  async flush(): Promise<void> {}
  cancel(): void {}
}

const HOST_INFO: HostInfo = { os: "linux", windowsBuild: null, hostname: "test-host" };

function makeService(terminals: TerminalManager, tmpRoot?: string) {
  return new SessionService({
    model: new SessionModel(),
    terminals,
    bus: new EventBus(),
    persist: new Persist(),
    serverVersion: "0.1.0-test",
    host: HOST_INFO,
    scrollbackLines: 1000,
    spawnGraceMs: 5,
    defaultCwd: "/home/u",
    logger: new MemoryLogger(),
    getAutoResumeEnabled: () => true,
    ...(tmpRoot !== undefined ? { scrollbackEditor: { tmpRoot } } : {}),
  });
}

function sessionData(): SessionFileData {
  return {
    schema: 1,
    savedAt: "2026-09-27T00:00:00Z",
    nextId: { w: 2, t: 2, p: 4, s: 3, a: 1, g: 1 },
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
            zoomedPaneId: null,
            layout: {
              type: "split",
              id: "s1",
              direction: "right",
              ratio: 0.5,
              a: { type: "pane", paneId: "p1" },
              b: {
                type: "split",
                id: "s2",
                direction: "down",
                ratio: 0.5,
                a: { type: "pane", paneId: "p2" },
                b: { type: "pane", paneId: "p3" },
              },
            },
            panes: [
              // p1 は会話の再開の対象（引き継いだら打ち込まない）
              {
                id: "p1",
                label: null,
                cwd: "/home/u/api",
                shell: "",
                agentSession: { kind: "claude", sessionId: "abc", reportedAt: 1 },
              },
              { id: "p2", label: null, cwd: "/home/u/api", shell: "" },
              { id: "p3", label: null, cwd: "/home/u/api", shell: "" },
            ],
          },
        ],
      },
    ],
    focus: { workspaceId: "w1", tabId: "t1", paneId: "p2" },
  } as unknown as SessionFileData;
}

const spec = (fd: number, pid: number, screen = ""): AdoptedPaneSpec => ({
  fd,
  pid,
  cols: 90,
  rows: 30,
  screen,
});

describe("SessionService.restore の引き継ぎの分岐（20260926-live-handoff）", () => {
  it("引き継いだ pane は新しいシェルを起動せず、その PTY を使う。レイアウト・フォーカスは session.json のまま", async () => {
    const terminals = new Terminals();
    const service = makeService(terminals);
    const adopted = new Map([
      ["p1", spec(20, 501)],
      ["p2", spec(21, 502)],
    ]);
    const { adoptedPaneIds } = await service.restore(sessionData(), { adopted });
    expect([...adoptedPaneIds].sort()).toEqual(["p1", "p2"]);
    expect(terminals.adopted).toEqual([
      { paneId: "p1", opts: { fd: 20, pid: 501, cols: 90, rows: 30 } },
      { paneId: "p2", opts: { fd: 21, pid: 502, cols: 90, rows: 30 } },
    ]);
    expect(terminals.created).toEqual(["p3"]); // 渡されなかった pane は今までどおり
    expect(terminals.hosts.get("p1")!.pid).toBe(501);
    // model の pane の大きさも PTY（渡された大きさ）に合わせる
    expect(service.getPane("p1")).toMatchObject({ cols: 90, rows: 30 });
    const snap = service.snapshot();
    expect(snap.panes.map((p) => p.id).sort()).toEqual(["p1", "p2", "p3"]);
    expect(snap.focus?.paneId).toBe("p2");
  });

  it("引き継いだ pane には会話の再開も画面履歴も流さず、古い画面（安全化済み）を流して大きさでつつく（AC3・AC9）", async () => {
    const terminals = new Terminals();
    const service = makeService(terminals);
    const history = new Map<string, PaneHistoryEntry>([
      ["p1", { ansi: "old-history", savedAt: "2026-09-26T00:00:00Z" } as PaneHistoryEntry],
      ["p3", { ansi: "old-history-3", savedAt: "2026-09-26T00:00:00Z" } as PaneHistoryEntry],
    ]);
    await service.restore(sessionData(), {
      adopted: new Map([["p1", spec(20, 501, "live screen\r\n\x1b]0;evil\x07\x1b[31mred\x1b[0m")]]),
      paneHistory: history,
    });
    const h1 = terminals.hosts.get("p1")!;
    expect(h1.writes).toEqual([]); // `claude --resume` を打ち込まない
    expect(h1.mirrorWrites.join("")).toBe("live screen\r\n\x1b[31mred\x1b[0m"); // OSC は落とす
    expect(h1.mirrorWrites.join("")).not.toContain("old-history");
    expect(h1.nudged).toBe(1);
    // 引き継がなかった p3 は今までどおり画面履歴を流す
    expect(terminals.hosts.get("p3")!.mirrorWrites.join("")).toContain("old-history-3");
  });

  it("引き継いだ pane のプロセスが終わると pane を閉じる（AC7）", async () => {
    const terminals = new Terminals();
    const service = makeService(terminals);
    await service.restore(sessionData(), { adopted: new Map([["p2", spec(21, 502)]]) });
    terminals.hosts.get("p2")!.fireExit(0);
    await new Promise((r) => setTimeout(r, 10));
    expect(
      service
        .snapshot()
        .panes.map((p) => p.id)
        .sort(),
    ).toEqual(["p1", "p3"]);
  });

  it("adopt が投げたら（fd が使えない）その pane は新しいシェルで起動し、adoptedPaneIds に入れない", async () => {
    const terminals = new Terminals();
    terminals.failFds.add(20);
    const service = makeService(terminals);
    const { adoptedPaneIds } = await service.restore(sessionData(), {
      adopted: new Map([["p1", spec(20, 501)]]),
    });
    expect([...adoptedPaneIds]).toEqual([]);
    expect(terminals.created).toEqual(["p1", "p2", "p3"]);
    // 普通の復元なので会話の再開を打ち込む
    expect(terminals.hosts.get("p1")!.writes.join("")).toContain("abc");
  });

  it("adopt を持たない TerminalManager では、今までどおり新しいシェルで起動する", async () => {
    const terminals = new Terminals();
    const noAdopt: TerminalManager = {
      create: (id, o) => terminals.create(id, o),
      get: (id) => terminals.get(id),
      resize: () => undefined,
      dispose: (id) => terminals.dispose(id),
    };
    const service = makeService(noAdopt);
    const { adoptedPaneIds } = await service.restore(sessionData(), {
      adopted: new Map([["p1", spec(20, 501)]]),
    });
    expect(adoptedPaneIds.size).toBe(0);
    expect(terminals.created).toEqual(["p1", "p2", "p3"]);
  });
});

describe("スクロールバックのエディタの対応の受け渡し（AC14）", () => {
  let root: string;
  afterEach(async () => rm(root, { recursive: true, force: true }));

  it("引き継いだ pane の対応だけを登録し直し、それ以外の一時ディレクトリは消す。登録した pane を閉じると今までどおり消えて焦点が戻る", async () => {
    root = await mkdtemp(join(tmpdir(), "soda-handoff-editor-"));
    const kept = await mkdtemp(join(root, "soda-scrollback-"));
    const dropped = await mkdtemp(join(root, "soda-scrollback-"));
    const terminals = new Terminals();
    const service = makeService(terminals, root);
    const { adoptedPaneIds } = await service.restore(sessionData(), {
      adopted: new Map([["p3", spec(22, 503)]]),
    });
    await service.adoptScrollbackEditors(
      [
        { paneId: "p3", sourcePaneId: "p2", previousZoomedPaneId: null, dir: kept },
        { paneId: "p1", sourcePaneId: "p2", previousZoomedPaneId: null, dir: dropped }, // p1 は引き継いでいない
      ],
      adoptedPaneIds,
    );
    await expect(stat(dropped)).rejects.toThrow();
    expect((await stat(kept)).isDirectory()).toBe(true);
    expect(service.handoffScrollbackEditors()).toEqual([
      { paneId: "p3", sourcePaneId: "p2", previousZoomedPaneId: null, dir: kept },
    ]);
    await service.closePane("p3");
    await service.disposeScrollbackEditors(); // 削除の途中のものを待つ
    await expect(stat(kept)).rejects.toThrow();
    expect(service.snapshot().focus?.paneId).toBe("p2"); // 元の pane へ戻る
  });

  it("引き継いだが既に閉じた pane の一時ディレクトリは消し、登録しない", async () => {
    root = await mkdtemp(join(tmpdir(), "soda-handoff-editor-"));
    const dir = await mkdtemp(join(root, "soda-scrollback-"));
    const terminals = new Terminals();
    const service = makeService(terminals, root);
    const { adoptedPaneIds } = await service.restore(sessionData(), {
      adopted: new Map([["p3", spec(22, 503)]]),
    });
    terminals.hosts.get("p3")!.fireExit(0);
    await new Promise((r) => setTimeout(r, 10));
    await service.adoptScrollbackEditors(
      [{ paneId: "p3", sourcePaneId: "p2", previousZoomedPaneId: null, dir }],
      adoptedPaneIds,
    );
    await expect(stat(dir)).rejects.toThrow();
    expect(service.handoffScrollbackEditors()).toEqual([]);
  });

  it("一時ディレクトリの場所（tmpRoot の直下）でないものは、登録も削除もしない", async () => {
    root = await mkdtemp(join(tmpdir(), "soda-handoff-editor-"));
    const other = await mkdtemp(join(tmpdir(), "soda-scrollback-"));
    try {
      const terminals = new Terminals();
      const service = makeService(terminals, root);
      const { adoptedPaneIds } = await service.restore(sessionData(), {
        adopted: new Map([["p3", spec(22, 503)]]),
      });
      await service.adoptScrollbackEditors(
        [
          { paneId: "p3", sourcePaneId: "p2", previousZoomedPaneId: null, dir: other },
          { paneId: "p1", sourcePaneId: "p2", previousZoomedPaneId: null, dir: other },
        ],
        adoptedPaneIds,
      );
      expect((await stat(other)).isDirectory()).toBe(true);
      expect(service.handoffScrollbackEditors()).toEqual([]);
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  });

  it("引き継いだエディタの pane を閉じると、開く前の拡大表示に戻る", async () => {
    root = await mkdtemp(join(tmpdir(), "soda-handoff-editor-"));
    const dir = await mkdtemp(join(root, "soda-scrollback-"));
    const terminals = new Terminals();
    const service = makeService(terminals, root);
    const data = sessionData() as unknown as {
      workspaces: { tabs: { zoomedPaneId: string | null }[] }[];
    };
    data.workspaces[0]!.tabs[0]!.zoomedPaneId = "p3"; // エディタの pane を拡大表示している
    const { adoptedPaneIds } = await service.restore(data as unknown as SessionFileData, {
      adopted: new Map([["p3", spec(22, 503)]]),
    });
    await service.adoptScrollbackEditors(
      [{ paneId: "p3", sourcePaneId: "p2", previousZoomedPaneId: "p1", dir }],
      adoptedPaneIds,
    );
    await service.closePane("p3");
    expect(service.getTab("t1")?.zoomedPaneId).toBe("p1");
  });
});
