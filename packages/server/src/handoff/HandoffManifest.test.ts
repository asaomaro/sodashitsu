import { existsSync, openSync, closeSync } from "node:fs";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as nodePty from "node-pty";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir } from "../persist/atomicFile.js";
import {
  HANDOFF_FILE_NAME,
  HANDOFF_FORMAT_VERSION,
  HANDOFF_MAX_AGE_MS,
  HANDOFF_NONCE_ENV,
  type HandoffManifest,
  closeOrphanPtyMasters,
  isPtyMaster,
  parseHandoffManifest,
  removeHandoffManifest,
  takeHandoff,
  writeHandoffManifest,
} from "./HandoffManifest.js";

const NONCE = "0123456789abcdef0123456789abcdef";
const NOW = Date.parse("2026-09-27T00:00:00.000Z");

function manifest(overrides: Partial<HandoffManifest> = {}): HandoffManifest {
  return {
    format: HANDOFF_FORMAT_VERSION,
    id: "abcdef0123456789",
    nonce: NONCE,
    pid: 4242,
    createdAt: new Date(NOW - 1000).toISOString(),
    port: 7780,
    panes: [
      { paneId: "p1", fd: 20, pid: 100, cols: 80, rows: 24, screen: "hello\r\n" },
      { paneId: "p2", fd: 21, pid: 101, cols: 120, rows: 40, screen: "" },
    ],
    scrollbackEditors: [
      {
        paneId: "p2",
        sourcePaneId: "p1",
        previousZoomedPaneId: null,
        dir: "/tmp/wtm-scrollback-abc",
      },
    ],
    ...overrides,
  };
}

describe("parseHandoffManifest", () => {
  it("正しい形を読む", () => {
    expect(parseHandoffManifest(JSON.stringify(manifest()))).toEqual(manifest());
  });

  it.each([
    ["JSON でない", "{"],
    ["format が違う", JSON.stringify({ ...manifest(), format: 2 })],
    ["id が 16 進でない", JSON.stringify(manifest({ id: "zz" }))],
    ["nonce が短い", JSON.stringify(manifest({ nonce: "abcd" }))],
    ["pid が 0", JSON.stringify(manifest({ pid: 0 }))],
    ["createdAt が日時でない", JSON.stringify(manifest({ createdAt: "yesterday" }))],
    ["port が範囲外", JSON.stringify(manifest({ port: 70000 }))],
    [
      "fd が標準入出力",
      JSON.stringify(
        manifest({ panes: [{ paneId: "p1", fd: 2, pid: 1, cols: 80, rows: 24, screen: "" }] }),
      ),
    ],
    [
      "fd が小数",
      JSON.stringify(
        manifest({ panes: [{ paneId: "p1", fd: 20.5, pid: 1, cols: 80, rows: 24, screen: "" }] }),
      ),
    ],
    [
      "cols が 0",
      JSON.stringify(
        manifest({ panes: [{ paneId: "p1", fd: 20, pid: 1, cols: 0, rows: 24, screen: "" }] }),
      ),
    ],
    [
      "同じ fd が 2 つ",
      JSON.stringify(
        manifest({
          panes: [
            { paneId: "p1", fd: 20, pid: 1, cols: 80, rows: 24, screen: "" },
            { paneId: "p2", fd: 20, pid: 2, cols: 80, rows: 24, screen: "" },
          ],
        }),
      ),
    ],
    [
      "同じ pane が 2 つ",
      JSON.stringify(
        manifest({
          panes: [
            { paneId: "p1", fd: 20, pid: 1, cols: 80, rows: 24, screen: "" },
            { paneId: "p1", fd: 21, pid: 2, cols: 80, rows: 24, screen: "" },
          ],
        }),
      ),
    ],
  ])("%s なら undefined", (_why, raw) => {
    expect(parseHandoffManifest(raw)).toBeUndefined();
  });

  it("合わないエディタの対応（一時ディレクトリの形でない・..・相対・空・同じ pane の 2 つ目）はその 1 件だけ落とす", () => {
    const ok = {
      paneId: "p9",
      sourcePaneId: "p1",
      previousZoomedPaneId: null,
      dir: "/tmp/wtm-scrollback-ok",
    };
    const bad = [
      { paneId: "p", sourcePaneId: "q", previousZoomedPaneId: null, dir: "/home/me" },
      {
        paneId: "p",
        sourcePaneId: "q",
        previousZoomedPaneId: null,
        dir: "/tmp/../home/wtm-scrollback-x",
      },
      { paneId: "p", sourcePaneId: "q", previousZoomedPaneId: null, dir: "wtm-scrollback-x" },
      { paneId: "p", sourcePaneId: "q", previousZoomedPaneId: null, dir: "" },
      { ...ok, dir: "/tmp/wtm-scrollback-dup" },
    ];
    const parsed = parseHandoffManifest(
      JSON.stringify(manifest({ scrollbackEditors: [ok, ...bad] })),
    );
    expect(parsed?.scrollbackEditors).toEqual([ok]);
    expect(parsed?.panes).toEqual(manifest().panes);
  });

  it("大きさは端末の上限（65535）まで受け付ける", () => {
    const wide = manifest({
      panes: [{ paneId: "p1", fd: 20, pid: 1, cols: 1200, rows: 400, screen: "" }],
    });
    expect(parseHandoffManifest(JSON.stringify(wide))?.panes[0]).toMatchObject({
      cols: 1200,
      rows: 400,
    });
    const tooWide = manifest({
      panes: [{ paneId: "p1", fd: 20, pid: 1, cols: 65536, rows: 24, screen: "" }],
    });
    expect(parseHandoffManifest(JSON.stringify(tooWide))).toBeUndefined();
  });
});

describe("writeHandoffManifest / removeHandoffManifest", () => {
  let dir: string;
  afterEach(async () => rm(dir, { recursive: true, force: true }));

  it.skipIf(process.platform === "win32")("0600 で書き、消せる（無ければ false）", async () => {
    dir = await makeTempDir("wtm-handoff-");
    await writeHandoffManifest(dir, manifest());
    const path = join(dir, HANDOFF_FILE_NAME);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(parseHandoffManifest(await readFile(path, "utf8"))).toEqual(manifest());
    expect(await removeHandoffManifest(dir)).toBe(true);
    expect(await removeHandoffManifest(dir)).toBe(false);
  });
});

describe("takeHandoff", () => {
  let dir: string;
  afterEach(async () => rm(dir, { recursive: true, force: true }));
  const deps = { pid: 4242, now: () => NOW, isPtyMaster: (fd: number) => fd === 20 || fd === 21 };

  it("環境変数が無い起動は none。残っていたファイルは消す（AC8）", async () => {
    dir = await makeTempDir("wtm-handoff-");
    await writeHandoffManifest(dir, manifest());
    const env: NodeJS.ProcessEnv = {};
    expect(await takeHandoff(dir, env, deps)).toEqual({ kind: "none", removedStale: true });
    expect(existsSync(join(dir, HANDOFF_FILE_NAME))).toBe(false);
  });

  it("ファイルも環境変数も無ければ none", async () => {
    dir = await makeTempDir("wtm-handoff-");
    expect(await takeHandoff(dir, {}, deps)).toEqual({ kind: "none", removedStale: false });
  });

  it("一致すれば taken。環境変数とファイルを消す", async () => {
    dir = await makeTempDir("wtm-handoff-");
    await writeHandoffManifest(dir, manifest());
    const env: NodeJS.ProcessEnv = { [HANDOFF_NONCE_ENV]: NONCE, OTHER: "x" };
    const taken = await takeHandoff(dir, env, deps);
    expect(taken).toEqual({
      kind: "taken",
      id: "abcdef0123456789",
      port: 7780,
      panes: manifest().panes,
      rejected: [],
      rejectReason: undefined,
      scrollbackEditors: manifest().scrollbackEditors,
    });
    expect(env).toEqual({ OTHER: "x" });
    expect(existsSync(join(dir, HANDOFF_FILE_NAME))).toBe(false);
  });

  it("環境変数があってファイルが無ければ broken", async () => {
    dir = await makeTempDir("wtm-handoff-");
    const env: NodeJS.ProcessEnv = { [HANDOFF_NONCE_ENV]: NONCE };
    const taken = await takeHandoff(dir, env, deps);
    expect(taken.kind).toBe("broken");
    expect(env[HANDOFF_NONCE_ENV]).toBeUndefined();
  });

  it("形が合わなければ broken で、ファイルは消す", async () => {
    dir = await makeTempDir("wtm-handoff-");
    await writeFile(join(dir, HANDOFF_FILE_NAME), "{not json");
    const env: NodeJS.ProcessEnv = { [HANDOFF_NONCE_ENV]: NONCE };
    const taken = await takeHandoff(dir, env, deps);
    expect(taken.kind).toBe("broken");
    expect(env[HANDOFF_NONCE_ENV]).toBeUndefined();
    expect(existsSync(join(dir, HANDOFF_FILE_NAME))).toBe(false);
  });

  it.each([
    ["nonce が違う", { [HANDOFF_NONCE_ENV]: "f".repeat(32) }, manifest(), "nonce mismatch"],
    [
      "書いた pid が自分でない",
      { [HANDOFF_NONCE_ENV]: NONCE },
      manifest({ pid: 1 }),
      "written by pid 1, not 4242",
    ],
    [
      "古い",
      { [HANDOFF_NONCE_ENV]: NONCE },
      manifest({ createdAt: new Date(NOW - HANDOFF_MAX_AGE_MS - 1).toISOString() }),
      "too old",
    ],
    [
      "未来の時刻",
      { [HANDOFF_NONCE_ENV]: NONCE },
      manifest({ createdAt: new Date(NOW + HANDOFF_MAX_AGE_MS + 1).toISOString() }),
      "created in the future",
    ],
  ])("%s なら全 pane を rejected", async (_why, env, m, reason) => {
    dir = await makeTempDir("wtm-handoff-");
    await writeHandoffManifest(dir, m);
    const taken = await takeHandoff(dir, { ...env }, deps);
    expect(taken).toMatchObject({
      kind: "taken",
      panes: [],
      rejected: m.panes,
      rejectReason: reason,
    });
  });

  it("PTY の master でない fd は rejected へ", async () => {
    dir = await makeTempDir("wtm-handoff-");
    await writeHandoffManifest(dir, manifest());
    const taken = await takeHandoff(
      dir,
      { [HANDOFF_NONCE_ENV]: NONCE },
      { ...deps, isPtyMaster: (fd) => fd === 20 },
    );
    expect(taken).toMatchObject({
      kind: "taken",
      panes: [manifest().panes[0]],
      rejected: [manifest().panes[1]],
      rejectReason: "not a pty master",
    });
  });

  it("期限のちょうど内側は使う", async () => {
    dir = await makeTempDir("wtm-handoff-");
    await writeHandoffManifest(
      dir,
      manifest({ createdAt: new Date(NOW - HANDOFF_MAX_AGE_MS).toISOString() }),
    );
    const taken = await takeHandoff(dir, { [HANDOFF_NONCE_ENV]: NONCE }, deps);
    expect(taken).toMatchObject({ kind: "taken", rejected: [] });
  });
});

describe.skipIf(process.platform !== "linux")(
  "isPtyMaster / closeOrphanPtyMasters（Linux・実物の PTY）",
  () => {
    const ptys: nodePty.IPty[] = [];
    afterEach(() => {
      for (const p of ptys.splice(0)) p.kill("SIGKILL");
    });

    it("node-pty の master は PTY の master、普通のファイルと標準入出力は違う", async () => {
      const p = nodePty.spawn("/bin/sh", ["-c", "sleep 5"], { cols: 80, rows: 24 });
      ptys.push(p);
      const fd = (p as unknown as { fd: number }).fd;
      expect(isPtyMaster(fd)).toBe(true);
      // Linux 以外の分岐（文字デバイスで端末か）も、同じ fd で確かめる。
      expect(isPtyMaster(fd, "darwin")).toBe(true);
      const dir = await makeTempDir("wtm-handoff-");
      const file = openSync(join(dir, "f"), "w");
      try {
        expect(isPtyMaster(file)).toBe(false);
        expect(isPtyMaster(file, "darwin")).toBe(false);
      } finally {
        closeSync(file);
        await rm(dir, { recursive: true, force: true });
      }
      expect(isPtyMaster(99999)).toBe(false);
    });

    it("closeOrphanPtyMasters は /dev/ptmx を指す fd だけを閉じる（閉じる関数は差し替え）", () => {
      const p = nodePty.spawn("/bin/sh", ["-c", "sleep 5"], { cols: 80, rows: 24 });
      ptys.push(p);
      const fd = (p as unknown as { fd: number }).fd;
      const closed: number[] = [];
      const n = closeOrphanPtyMasters({ close: (f) => closed.push(f) });
      expect(closed).toContain(fd);
      expect(n).toBe(closed.length);
      for (const f of closed) expect(isPtyMaster(f)).toBe(true);
      expect(closeOrphanPtyMasters({ platform: "darwin", close: () => closed.push(-1) })).toBe(0);
      // keep に入れた fd は閉じない
      const closed2: number[] = [];
      closeOrphanPtyMasters({ close: (f) => closed2.push(f), keep: new Set([fd]) });
      expect(closed2).not.toContain(fd);
    });
  },
);
