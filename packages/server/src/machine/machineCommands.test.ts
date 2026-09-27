import { rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { parseArgs } from "../cliArgs.js";
import { ConfigError } from "../configError.js";
import { makeTempDir } from "../persist/atomicFile.js";
import { BRIDGE_FRAME, encodeBridgeFrame, encodeJson, markerBytes } from "./bridgeFrames.js";
import { loadCatalog, machinesFilePath, saveCatalog } from "./MachineCatalog.js";
import { parseMachineArgs } from "./machineArgs.js";
import { probeMachine, runMachineCommand, shellQuote } from "./machineCommands.js";
import { MAX_MACHINES } from "./MachineCatalog.js";
import { FakeChild, ManualClock } from "./testing.js";

/** `wtm machine …`（20260927-multi-host-machines の T9）。確かめは差し替え、登録簿は本物の一時ディレクトリ。 */
const ID_A = "a".repeat(32);

function io() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) } };
}

describe("wtm machine の引数（T9）", () => {
  it("サブコマンドごとの形", () => {
    expect(parseMachineArgs(["add", "you@build", "--label", "Build"])).toEqual({
      sub: "add",
      target: "you@build",
      label: "Build",
      session: undefined,
      stateDir: undefined,
    });
    expect(
      parseMachineArgs([
        "add",
        "b",
        "--label",
        "B",
        "--remote-session",
        "agents",
        "--state-dir",
        "/d",
      ]),
    ).toMatchObject({ session: "agents", stateDir: "/d" });
    expect(parseMachineArgs(["list", "--json"])).toEqual({
      sub: "list",
      json: true,
      stateDir: undefined,
    });
    expect(parseMachineArgs(["rename", ID_A, "--label", "X"])).toEqual({
      sub: "rename",
      id: ID_A,
      label: "X",
      stateDir: undefined,
    });
    for (const sub of ["enable", "disable", "remove"])
      expect(parseMachineArgs([sub, ID_A])).toEqual({ sub, id: ID_A, stateDir: undefined });
    expect(parseArgs(["machine", "list", "--state-dir", "/root"])).toMatchObject({
      command: "machine",
      stateDir: "/root",
      machine: { sub: "list" },
    });
  });

  it("誤りは ConfigError（終了コード 2）: サブコマンドなし・知らない・--label なし・余分・知らないオプション・- 始まりの宛先・重複", () => {
    for (const argv of [
      [],
      ["frob"],
      ["add", "you@build"],
      ["add", "--label", "B"],
      ["add", "a", "b", "--label", "B"],
      ["add", "-oProxyCommand=x", "--label", "B"],
      ["list", "--label", "x"],
      ["rename", ID_A],
      ["enable"],
      ["add", "h", "--label", "a", "--label", "b"],
      ["add", "h", "--label"],
    ])
      expect(() => parseMachineArgs(argv), argv.join(" ")).toThrow(ConfigError);
  });
});

describe("wtm machine の実行（T9）", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  });
  const tmp = async (): Promise<string> => {
    const d = await makeTempDir("wtm-machine-cmd-");
    dirs.push(d);
    return d;
  };

  it("add: 確かめてから保存し id を出す。list（テキスト・JSON）に出る", async () => {
    const root = await tmp();
    const t = io();
    const probed: unknown[] = [];
    const code = await runMachineCommand(
      { sub: "add", target: "you@build", label: "Build", session: "agents", stateDir: undefined },
      root,
      t.io,
      {
        probe: async (p) => {
          probed.push(p);
          return { ok: true };
        },
      },
    );
    expect(code).toBe(0);
    expect(probed).toMatchObject([{ target: "you@build", session: "agents", enabled: true }]);
    const loaded = await loadCatalog(root);
    expect(loaded.kind).toBe("ok");
    const m = loaded.kind === "ok" ? loaded.data.machines[0]! : undefined;
    expect(m).toMatchObject({
      label: "Build",
      target: "you@build",
      session: "agents",
      enabled: true,
    });
    expect(t.out.join("\n")).toContain(`saved machine ${m!.id} (Build)`);
    const l = io();
    expect(
      await runMachineCommand({ sub: "list", json: false, stateDir: undefined }, root, l.io),
    ).toBe(0);
    expect(l.out).toEqual([`${m!.id}\tBuild\tyou@build\tagents\tenabled`]);
    const j = io();
    await runMachineCommand({ sub: "list", json: true, stateDir: undefined }, root, j.io);
    expect(JSON.parse(j.out[0]!)).toEqual([
      { id: m!.id, label: "Build", target: "you@build", session: "agents", enabled: true },
    ]);
  });

  it("add: 確かめに失敗したら保存せず 1、理由と次の手を出す", async () => {
    const root = await tmp();
    const t = io();
    const code = await runMachineCommand(
      { sub: "add", target: "you@build", label: "Build", session: undefined, stateDir: undefined },
      root,
      t.io,
      {
        probe: async () => ({
          ok: false,
          failure: { kind: "attention", message: "SSH の認証に失敗しました" },
        }),
      },
    );
    expect(code).toBe(1);
    expect(t.err.join("\n")).toMatch(
      /認証に失敗[\s\S]*not saved[\s\S]*ssh you@build[\s\S]*wtm serve/,
    );
    expect(await loadCatalog(root)).toEqual({ kind: "missing" });
  });

  it("add: 宛先・session・名前（予約名・重複）の誤りは確かめる前に ConfigError。確かめの間に同じ名前が増えたら保存しない", async () => {
    const root = await tmp();
    const noProbe = { probe: async () => expect.unreachable() as never };
    await expect(
      runMachineCommand(
        { sub: "add", target: "a b", label: "X", session: undefined, stateDir: undefined },
        root,
        io().io,
        noProbe,
      ),
    ).rejects.toThrow(/invalid ssh target/);
    await expect(
      runMachineCommand(
        { sub: "add", target: "h", label: "X", session: "../x", stateDir: undefined },
        root,
        io().io,
        noProbe,
      ),
    ).rejects.toThrow(/remote-session/);
    await expect(
      runMachineCommand(
        { sub: "add", target: "h", label: "Local", session: undefined, stateDir: undefined },
        root,
        io().io,
        noProbe,
      ),
    ).rejects.toThrow(/予約名/);
    await saveCatalog(root, {
      version: 1,
      machines: [{ id: ID_A, label: "Taken", target: "t", enabled: true }],
    });
    await expect(
      runMachineCommand(
        { sub: "add", target: "h", label: "Taken", session: undefined, stateDir: undefined },
        root,
        io().io,
        noProbe,
      ),
    ).rejects.toThrow(/既に使われて/);
    // 確かめの間に同じ名前のマシンが保存された
    await expect(
      runMachineCommand(
        { sub: "add", target: "h", label: "Race", session: undefined, stateDir: undefined },
        root,
        io().io,
        {
          probe: async () => {
            await saveCatalog(root, {
              version: 1,
              machines: [{ id: ID_A, label: "Race", target: "t", enabled: true }],
            });
            return { ok: true };
          },
        },
      ),
    ).rejects.toThrow(/既に使われて/);
    const after = await loadCatalog(root);
    expect(after.kind === "ok" && after.data.machines.map((m) => m.label)).toEqual(["Race"]);
  });

  it("rename・disable・enable・remove は登録簿だけを変える（ssh を起こさない）。知らない id は ConfigError", async () => {
    const root = await tmp();
    await saveCatalog(root, {
      version: 1,
      machines: [{ id: ID_A, label: "Build", target: "you@build", enabled: true }],
    });
    const run = (cmd: Parameters<typeof runMachineCommand>[0]) =>
      runMachineCommand(cmd, root, io().io, { probe: async () => expect.unreachable() as never });
    expect(await run({ sub: "rename", id: ID_A, label: "New", stateDir: undefined })).toBe(0);
    expect(await run({ sub: "disable", id: ID_A, stateDir: undefined })).toBe(0);
    let l = await loadCatalog(root);
    expect(l.kind === "ok" && l.data.machines[0]).toMatchObject({ label: "New", enabled: false });
    expect(await run({ sub: "enable", id: ID_A, stateDir: undefined })).toBe(0);
    l = await loadCatalog(root);
    expect(l.kind === "ok" && l.data.machines[0]!.enabled).toBe(true);
    await expect(
      run({ sub: "rename", id: ID_A, label: "local", stateDir: undefined }),
    ).rejects.toThrow(ConfigError);
    await expect(run({ sub: "remove", id: "b".repeat(32), stateDir: undefined })).rejects.toThrow(
      /no such machine id/,
    );
    await expect(run({ sub: "remove", id: "New", stateDir: undefined })).rejects.toThrow(
      /no such machine id/,
    ); // 名前では指さない
    expect(await run({ sub: "remove", id: ID_A, stateDir: undefined })).toBe(0);
    l = await loadCatalog(root);
    expect(l.kind === "ok" && l.data.machines).toEqual([]);
  });

  it("--remote-session default は既定の session（保存しない）。上限の台数は ConfigError。名前の規則は登録簿が壊れていても先に 2", async () => {
    const root = await tmp();
    const probed: unknown[] = [];
    expect(
      await runMachineCommand(
        { sub: "add", target: "h", label: "D", session: "default", stateDir: undefined },
        root,
        io().io,
        {
          probe: async (p) => {
            probed.push(p);
            return { ok: true };
          },
        },
      ),
    ).toBe(0);
    expect(probed[0]).not.toHaveProperty("session");
    const l = await loadCatalog(root);
    expect(l.kind === "ok" && l.data.machines[0]).not.toHaveProperty("session");
    const many = Array.from({ length: MAX_MACHINES }, (_, i) => ({
      id: i.toString(16).padStart(32, "0"),
      label: `m${i}`,
      target: "t",
      enabled: true,
    }));
    await saveCatalog(root, { version: 1, machines: many });
    await expect(
      runMachineCommand(
        { sub: "add", target: "h", label: "One more", session: undefined, stateDir: undefined },
        root,
        io().io,
        { probe: async () => ({ ok: true }) },
      ),
    ).rejects.toThrow(/at most/);
    await writeFile(machinesFilePath(root), "{broken");
    await expect(
      runMachineCommand(
        { sub: "add", target: "h", label: "local", session: undefined, stateDir: undefined },
        root,
        io().io,
        { probe: async () => ({ ok: true }) },
      ),
    ).rejects.toThrow(ConfigError);
  });

  it("案内のコマンドは貼って打てる形（[ ] 等を含む宛先は引用する）", () => {
    expect(shellQuote("you@build")).toBe("you@build");
    expect(shellQuote("ssh://u@[::1]:22")).toBe("'ssh://u@[::1]:22'");
    expect(shellQuote("~host")).toBe("'~host'");
  });

  it("壊れた登録簿は上書きせず 1", async () => {
    const root = await tmp();
    await writeFile(machinesFilePath(root), "{broken");
    const t = io();
    expect(
      await runMachineCommand({ sub: "list", json: false, stateDir: undefined }, root, t.io),
    ).toBe(1);
    expect(t.err[0]).toMatch(/cannot use the machine list/);
    expect(
      await runMachineCommand(
        { sub: "add", target: "h", label: "X", session: undefined, stateDir: undefined },
        root,
        io().io,
        { probe: async () => ({ ok: true }) },
      ),
    ).toBe(1);
  });
});

describe("probeMachine（T9）", () => {
  it("HELLO を受けたら閉じて成功、先に終われば分類つきで失敗", async () => {
    let child!: FakeChild;
    const clock = new ManualClock();
    const ok = probeMachine(
      { id: ID_A, label: "B", target: "b", enabled: true },
      {
        clock,
        spawn: (cmd, args) => {
          child = new FakeChild(cmd, args);
          setImmediate(() =>
            child.stdout.write(
              Buffer.concat([
                markerBytes(),
                encodeBridgeFrame(
                  BRIDGE_FRAME.HELLO,
                  0,
                  encodeJson({
                    bridge: 1,
                    protocol: 1,
                    version: "v",
                    hostname: "h",
                    sessionName: null,
                  }),
                ),
              ]),
            ),
          );
          return child;
        },
      },
    );
    expect(await ok).toEqual({ ok: true });
    expect(child.kills).toContain("SIGTERM");
    const bad = probeMachine(
      { id: ID_A, label: "B", target: "b", enabled: true },
      {
        clock,
        spawn: (cmd, args) => {
          const c = new FakeChild(cmd, args);
          setImmediate(() => {
            c.stderr.write("wtm: no running wtm serve for session default\n");
            c.exit(3);
          });
          return c;
        },
      },
    );
    expect(await bad).toMatchObject({
      ok: false,
      failure: { kind: "attention", message: expect.stringMatching(/動いていません/) },
    });
  });
});
