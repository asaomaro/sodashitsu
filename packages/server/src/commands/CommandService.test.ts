import type { Pane, ServerEvent } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import type { CreatePaneOptions } from "../terminal/TerminalManager.js";
import { MemoryLogger } from "../log/Logger.js";
import type { CommandCatalog, CommandDef } from "./commandConfig.js";
import { CommandService, type CommandServiceOptions } from "./CommandService.js";

const SECRET_CMD = "lazygit --token SECRET-XYZ";

const DEFS: CommandDef[] = [
  {
    id: "git",
    type: "popup",
    command: SECRET_CMD,
    description: "lazygit",
    width: "80%",
    height: 30,
  },
  { id: "htop", type: "pane", command: "htop" },
  { id: "build", type: "shell", command: "make" },
];

class FakeHost {
  exitListeners: ((code: number) => void)[] = [];
  disposed = false;
  onExit(cb: (code: number) => void) {
    this.exitListeners.push(cb);
    return { dispose: () => undefined };
  }
  fireExit(code: number) {
    for (const cb of this.exitListeners) cb(code);
  }
}

function setup(
  o: {
    catalog?: CommandCatalog;
    kind?: string;
    isDir?: boolean;
    createThrows?: boolean;
    spawnThrows?: boolean;
    maxDetached?: number;
    isDirectory?: () => Promise<boolean>;
    load?: CommandServiceOptions["load"];
    unknownClient?: boolean;
  } = {},
) {
  const events: ServerEvent[] = [];
  const created: { id: string; opts: CreatePaneOptions }[] = [];
  const hosts = new Map<string, FakeHost>();
  const disposed: string[] = [];
  const spawned: {
    argv: readonly string[];
    cwd: string;
    env: Record<string, string>;
    done: () => void;
    fail: (e: Error) => void;
  }[] = [];
  const panes: {
    paneId: string;
    cwd: string;
    command: { shell: string; args: string[]; env: Record<string, string> };
  }[] = [];
  let nextId = 100;
  let catalog: CommandCatalog = o.catalog ?? { commands: DEFS, problem: null };
  const logger = new MemoryLogger();
  const opts: CommandServiceOptions = {
    filePath: "/state/commands.json",
    session: {
      commandContext: (paneId: string) => {
        if (paneId !== "p1")
          throw Object.assign(new Error("pane not found"), { code: "not_found" });
        return {
          workspaceId: "w1",
          tabId: "t1",
          paneId: "p1",
          cwd: "/home/u/api",
          defaultCwd: "/start",
        };
      },
      commandEnv: (own: string | undefined, extra: Readonly<Record<string, string>>) => ({
        PATH: "/usr/bin",
        ...(own ? { SODA_PANE_ID: own } : {}),
        ...extra,
      }),
      openCommandPane: async (
        paneId: string,
        cwd: string,
        command: { shell: string; args: string[]; env: Record<string, string> },
      ) => {
        panes.push({ paneId, cwd, command });
        return { pane: { id: "p9" } as Pane };
      },
      reservePaneId: () => `p${nextId++}`,
    },
    terminals: {
      create: (id: string, cOpts: CreatePaneOptions) => {
        if (o.createThrows) throw new Error("pty failed");
        created.push({ id, opts: cOpts });
        const h = new FakeHost();
        hosts.set(id, h);
        return h as never;
      },
      dispose: (id: string) => {
        disposed.push(id);
      },
    },
    bus: { publish: (e: ServerEvent) => events.push(e) },
    clients: {
      get: (id: string) =>
        o.unknownClient
          ? undefined
          : ({ id, kind: (id === "ext" ? "external" : (o.kind ?? "desktop")) as never } as never),
    },
    logger,
    platform: "linux",
    env: {},
    load: o.load ?? (async () => catalog),
    spawnDetached: (argv, sOpts, done, fail) => {
      if (o.spawnThrows) throw new Error("spawn EAGAIN");
      spawned.push({ argv, cwd: sOpts.cwd, env: sOpts.env, done, fail });
    },
    isDirectory: o.isDirectory ?? (async () => o.isDir ?? true),
    ...(o.maxDetached !== undefined ? { maxDetached: o.maxDetached } : {}),
  };
  const service = new CommandService(opts);
  return {
    service,
    events,
    created,
    hosts,
    disposed,
    spawned,
    panes,
    logger,
    setCatalog: (c: CommandCatalog) => (catalog = c),
  };
}

describe("CommandService — 一覧・読み直し（20260927-custom-command-keys の AC1・AC2・AC15）", () => {
  it("読み込み前は 0 件。reload で一覧になり、command.updated を配る。一覧にコマンドの文字列は無い", async () => {
    const { service, events, logger } = setup();
    expect(service.list()).toEqual({ commands: [], problem: null });
    const r = await service.reload();
    expect(r.commands.map((c) => c.id)).toEqual(["git", "htop", "build"]);
    expect(JSON.stringify(r)).not.toContain("SECRET");
    expect(JSON.stringify(r)).not.toContain("make");
    expect(events).toEqual([{ event: "command.updated", data: r }]);
    expect(logger.lines.length).toBeGreaterThan(0);
    await service.run("c1", { commandId: "git", paneId: "p1", cols: 80, rows: 24 });
    expect(JSON.stringify(logger.lines)).toContain("custom command run");
    expect(JSON.stringify(logger.lines)).not.toContain("SECRET"); // コマンドの文字列をログに出さない
  });

  it("読み直しで採られなければ、直前の一覧も捨てて問題を返す", async () => {
    const { service, setCatalog } = setup();
    await service.reload();
    setCatalog({ commands: [], problem: "commands.json: 規則外" });
    const r = await service.reload();
    expect(r).toEqual({ commands: [], problem: "commands.json: 規則外" });
    await expect(service.run("c1", { commandId: "build", paneId: "p1" })).rejects.toMatchObject({
      code: "command_not_found",
    });
  });
});

describe("CommandService — run（AC4〜AC11）", () => {
  it("知らない id は command_not_found で何も起動しない", async () => {
    const { service, created, spawned, panes } = setup();
    await service.reload();
    await expect(service.run("c1", { commandId: "nope", paneId: "p1" })).rejects.toMatchObject({
      code: "command_not_found",
    });
    expect([created, spawned, panes].map((a) => a.length)).toEqual([0, 0, 0]);
  });

  it("pane が無ければ not_found で何も起動しない", async () => {
    const { service, spawned } = setup();
    await service.reload();
    await expect(service.run("c1", { commandId: "build", paneId: "p404" })).rejects.toMatchObject({
      code: "not_found",
    });
    expect(spawned).toEqual([]);
  });

  it("shell：/bin/sh -lc <設定の文字列> を作業場所・環境（SODA_PANE_ID なし）で裏に走らせる", async () => {
    const { service, spawned } = setup();
    await service.reload();
    expect(await service.run("c1", { commandId: "build", paneId: "p1" })).toEqual({
      type: "shell",
    });
    expect(spawned).toHaveLength(1);
    expect(spawned[0]!.argv).toEqual(["/bin/sh", "-lc", "make"]);
    expect(spawned[0]!.cwd).toBe("/home/u/api");
    expect(spawned[0]!.env).toEqual({
      PATH: "/usr/bin",
      SODA_ACTIVE_WORKSPACE_ID: "w1",
      SODA_ACTIVE_TAB_ID: "t1",
      SODA_ACTIVE_PANE_ID: "p1",
      SODA_ACTIVE_PANE_CWD: "/home/u/api",
      SODA_COMMAND_ID: "build",
    });
  });

  it("作業場所がディレクトリでなければサーバの既定の場所（SODA_ACTIVE_PANE_CWD はモデルの値のまま）", async () => {
    const { service, spawned } = setup({ isDir: false });
    await service.reload();
    await service.run("c1", { commandId: "build", paneId: "p1" });
    expect(spawned[0]!.cwd).toBe("/start");
    expect(spawned[0]!.env["SODA_ACTIVE_PANE_CWD"]).toBe("/home/u/api");
  });

  it("shell：上限に達したら command_busy。終われば（成功でも失敗でも）数が戻る", async () => {
    const { service, spawned } = setup({ maxDetached: 2 });
    await service.reload();
    await service.run("c1", { commandId: "build", paneId: "p1" });
    await service.run("c1", { commandId: "build", paneId: "p1" });
    await expect(service.run("c1", { commandId: "build", paneId: "p1" })).rejects.toMatchObject({
      code: "command_busy",
    });
    spawned[0]!.done();
    spawned[0]!.done(); // 二重に呼ばれても 1 つしか戻さない
    await service.run("c1", { commandId: "build", paneId: "p1" });
    await expect(service.run("c1", { commandId: "build", paneId: "p1" })).rejects.toMatchObject({
      code: "command_busy",
    });
    spawned[1]!.fail(new Error("ENOENT"));
    await service.run("c1", { commandId: "build", paneId: "p1" });
  });

  it("shell：spawn が投げたら command_failed で数も戻る", async () => {
    const { service } = setup({ spawnThrows: true, maxDetached: 1 });
    await service.reload();
    await expect(service.run("c1", { commandId: "build", paneId: "p1" })).rejects.toMatchObject({
      code: "command_failed",
    });
    await expect(service.run("c1", { commandId: "build", paneId: "p1" })).rejects.toMatchObject({
      code: "command_failed",
    }); // busy ではない
  });

  it("pane：/bin/sh -c <設定の文字列> と SODA_ACTIVE_* を SessionService の pane 種へ渡す", async () => {
    const { service, panes } = setup();
    await service.reload();
    expect(await service.run("c1", { commandId: "htop", paneId: "p1" })).toEqual({
      type: "pane",
      pane: { id: "p9" },
    });
    expect(panes).toEqual([
      {
        paneId: "p1",
        cwd: "/home/u/api",
        command: {
          shell: "/bin/sh",
          args: ["-c", "htop"],
          env: {
            SODA_ACTIVE_WORKSPACE_ID: "w1",
            SODA_ACTIVE_TAB_ID: "t1",
            SODA_ACTIVE_PANE_ID: "p1",
            SODA_ACTIVE_PANE_CWD: "/home/u/api",
            SODA_COMMAND_ID: "htop",
          },
        },
      },
    ]);
  });

  it("popup：モデルに入れない端末を大きさどおりに作り、SODA_PANE_ID を入れない。文字列は設定のまま", async () => {
    const { service, created } = setup();
    await service.reload();
    const r = await service.run("c1", { commandId: "git", paneId: "p1", cols: 90, rows: 30 });
    expect(r).toEqual({ type: "popup", popupId: "p100", cols: 90, rows: 30 });
    expect(created).toHaveLength(1);
    expect(created[0]!.id).toBe("p100");
    expect(created[0]!.opts).toMatchObject({
      shell: "/bin/sh",
      args: ["-c", SECRET_CMD],
      cwd: "/home/u/api",
      cols: 90,
      rows: 30,
    });
    expect(created[0]!.opts.env?.["SODA_PANE_ID"]).toBeUndefined();
    expect(created[0]!.opts.env?.["SODA_COMMAND_ID"]).toBe("git");
    expect(service.popupSize("c1", "p100")).toEqual({ cols: 90, rows: 30 });
  });

  it('Windows：popup・pane 種は PTY へ 1 本のコマンドライン（/d /s /c "<command>"）で渡す（review ラウンド 1）', async () => {
    const s = setup();
    const win = new CommandService({
      filePath: "x",
      session: {
        commandContext: () => ({
          workspaceId: "w1",
          tabId: "t1",
          paneId: "p1",
          cwd: "C:\\w",
          defaultCwd: "C:\\",
        }),
        commandEnv: () => ({}),
        openCommandPane: async (
          _p: string,
          _c: string,
          command: { shell: string; args: string[] | string; env: Record<string, string> },
        ) => {
          s.panes.push({ paneId: "p1", cwd: "", command: command as never });
          return { pane: { id: "p9" } as Pane };
        },
        reservePaneId: () => "p50",
      },
      terminals: {
        create: (id: string, o: CreatePaneOptions) => (
          s.created.push({ id, opts: o }),
          new FakeHost() as never
        ),
        dispose: () => undefined,
      },
      bus: { publish: () => undefined },
      clients: { get: (id: string) => ({ id, kind: "desktop" }) as never },
      logger: new MemoryLogger(),
      platform: "win32",
      env: { ComSpec: "C:\\cmd.exe" },
      load: async () => ({ commands: DEFS, problem: null }),
      isDirectory: async () => true,
    });
    await win.reload();
    await win.run("c1", { commandId: "git", paneId: "p1", cols: 80, rows: 24 });
    await win.run("c1", { commandId: "htop", paneId: "p1" });
    expect(s.created[0]!.opts).toMatchObject({
      shell: "C:\\cmd.exe",
      args: `/d /s /c "${SECRET_CMD}"`,
    });
    expect(s.panes[0]!.command).toMatchObject({ shell: "C:\\cmd.exe", args: '/d /s /c "htop"' });
  });

  it("popup：外部の接続（sodactl）・大きさが無い要求は invalid_params", async () => {
    const { service, created } = setup();
    await service.reload();
    await expect(
      service.run("ext", { commandId: "git", paneId: "p1", cols: 80, rows: 24 }),
    ).rejects.toMatchObject({ code: "invalid_params" });
    await expect(
      service.run("c1", { commandId: "git", paneId: "p1", cols: 80 }),
    ).rejects.toMatchObject({ code: "invalid_params" });
    expect(created).toEqual([]);
  });

  it("popup：同じ接続に 2 つ目は command_popup_open。別の接続は開ける", async () => {
    const { service, created } = setup();
    await service.reload();
    await service.run("c1", { commandId: "git", paneId: "p1", cols: 80, rows: 24 });
    await expect(
      service.run("c1", { commandId: "git", paneId: "p1", cols: 80, rows: 24 }),
    ).rejects.toMatchObject({ code: "command_popup_open" });
    await service.run("c2", { commandId: "git", paneId: "p1", cols: 80, rows: 24 });
    expect(created).toHaveLength(2);
  });

  it("popup：端末を作れなければ command_failed で記録を残さない", async () => {
    const { service } = setup({ createThrows: true });
    await service.reload();
    await expect(
      service.run("c1", { commandId: "git", paneId: "p1", cols: 80, rows: 24 }),
    ).rejects.toMatchObject({ code: "command_failed" });
    expect(service.popupSize("c1", "p100")).toBeUndefined();
  });

  it("ブラウザが名指しした paneId が何であれ、コマンドの文字列は設定のまま（AC9）", async () => {
    const { service, spawned } = setup();
    await service.reload();
    await service.run("c1", {
      commandId: "build",
      paneId: "p1",
      ...({ command: "rm -rf /" } as object),
    } as never);
    expect(spawned[0]!.argv.at(-1)).toBe("make");
  });
});

describe("CommandService — popup の終わり（AC5・AC-I1）", () => {
  async function opened() {
    const s = setup();
    await s.service.reload();
    await s.service.run("c1", { commandId: "git", paneId: "p1", cols: 80, rows: 24 });
    s.events.length = 0;
    return s;
  }

  it("コマンドが終わると記録を消し、終了コードつきで知らせる（1 度だけ）", async () => {
    const { service, events, hosts } = await opened();
    hosts.get("p100")!.fireExit(3);
    hosts.get("p100")!.fireExit(3);
    expect(events).toEqual([
      { event: "command.popup_closed", data: { popupId: "p100", exitCode: 3 } },
    ]);
    expect(service.popupSize("c1", "p100")).toBeUndefined();
    await service.run("c1", { commandId: "git", paneId: "p1", cols: 80, rows: 24 }); // 次を開ける
  });

  it("持ち主の閉じる要求で止め、終了コードなしで知らせる。後から来た終わりは知らせない", async () => {
    const { service, events, hosts, disposed } = await opened();
    service.closePopup("c1", "p100");
    hosts.get("p100")!.fireExit(0);
    expect(disposed).toEqual(["p100"]);
    expect(events).toEqual([{ event: "command.popup_closed", data: { popupId: "p100" } }]);
  });

  it("持ち主でない接続は閉じられず、購読の大きさも見えない（not_found）", async () => {
    const { service, disposed } = await opened();
    expect(() => service.closePopup("c2", "p100")).toThrow(
      expect.objectContaining({ code: "not_found" }),
    );
    expect(() => service.closePopup("c1", "p999")).toThrow(
      expect.objectContaining({ code: "not_found" }),
    );
    expect(service.popupSize("c2", "p100")).toBeUndefined();
    expect(disposed).toEqual([]);
  });

  it("持ち主の接続が切れたら止める。ほかの接続の popup は残す", async () => {
    const { service, disposed } = await opened();
    await service.run("c2", { commandId: "git", paneId: "p1", cols: 80, rows: 24 });
    service.onClientGone("c1");
    expect(disposed).toEqual(["p100"]);
    expect(service.popupSize("c2", "p101")).toEqual({ cols: 80, rows: 24 });
  });

  it("停止時は全 popup を止める", async () => {
    const { service, disposed } = await opened();
    await service.run("c2", { commandId: "git", paneId: "p1", cols: 80, rows: 24 });
    service.dispose();
    expect(disposed.sort()).toEqual(["p100", "p101"]);
  });
});

describe("CommandService — 点検で足した場面（T5 の独立点検）", () => {
  it("作業場所を確かめている間に読み直されて定義が消えたら、捨てた定義を走らせない", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const s = setup({ isDirectory: async () => (await gate, true) });
    await s.service.reload();
    const pending = s.service.run("c1", { commandId: "build", paneId: "p1" });
    s.setCatalog({ commands: [], problem: "commands.json: 規則外" });
    await s.service.reload();
    release();
    await expect(pending).rejects.toMatchObject({ code: "command_not_found" });
    expect(s.spawned).toEqual([]);
  });

  it("待つ間に書き換わったら、新しい定義の文字列で走る", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const s = setup({ isDirectory: async () => (await gate, true) });
    await s.service.reload();
    const pending = s.service.run("c1", { commandId: "build", paneId: "p1" });
    s.setCatalog({
      commands: [{ id: "build", type: "shell", command: "make all" }],
      problem: null,
    });
    await s.service.reload();
    release();
    await pending;
    expect(s.spawned[0]!.argv).toEqual(["/bin/sh", "-lc", "make all"]);
  });

  it("重なった読み直しは最後に始めたものだけを採る", async () => {
    const resolvers: ((c: CommandCatalog) => void)[] = [];
    const s = setup({ load: () => new Promise((r) => resolvers.push(r)) });
    const first = s.service.reload();
    const second = s.service.reload();
    resolvers[1]!({ commands: [{ id: "new", type: "shell", command: "x" }], problem: null });
    await second;
    resolvers[0]!({ commands: [{ id: "old", type: "shell", command: "y" }], problem: null });
    await first;
    expect(s.service.list().commands.map((c) => c.id)).toEqual(["new"]);
    expect(s.events.filter((e) => e.event === "command.updated")).toHaveLength(1);
  });

  it("読み込みが投げても 0 件にして止まらず、読めることの警告はログに出す", async () => {
    const thrown = setup({ load: async () => Promise.reject(new Error("boom")) });
    expect(await thrown.service.reload()).toEqual({
      commands: [],
      problem: "commands.json: 読めません",
    });
    const warned = setup({
      load: async () => ({ commands: [], problem: null, warning: "readable" }),
    });
    await warned.service.reload();
    expect(
      warned.logger.lines.some((l) => l.level === "warn" && l.fields?.["warning"] === "readable"),
    ).toBe(true);
  });

  it("接続が切れた・停止のとき、止めた popup を終了コードなしで知らせる", async () => {
    const s = setup();
    await s.service.reload();
    await s.service.run("c1", { commandId: "git", paneId: "p1", cols: 80, rows: 24 });
    await s.service.run("c2", { commandId: "git", paneId: "p1", cols: 80, rows: 24 });
    s.events.length = 0;
    s.service.onClientGone("c1");
    s.service.dispose();
    expect(s.events).toEqual([
      { event: "command.popup_closed", data: { popupId: "p100" } },
      { event: "command.popup_closed", data: { popupId: "p101" } },
    ]);
  });

  it("要求の途中で接続が消えていたら（登録が無い）popup を作らない", async () => {
    const s = setup({ unknownClient: true });
    await s.service.reload();
    await expect(
      s.service.run("c1", { commandId: "git", paneId: "p1", cols: 80, rows: 24 }),
    ).rejects.toMatchObject({ code: "invalid_params" });
    expect(s.created).toEqual([]);
  });

  it("モバイルのブラウザからも popup を開ける", async () => {
    const s = setup({ kind: "mobile" });
    await s.service.reload();
    expect(
      (await s.service.run("c1", { commandId: "git", paneId: "p1", cols: 40, rows: 20 })).type,
    ).toBe("popup");
  });
});
