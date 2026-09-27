import { existsSync } from "node:fs";
import { chmod, mkdir, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTempDir } from "./atomicFile.js";
import {
  FsPaneHistoryFile,
  PANE_HISTORY_FILE_NAME,
  type PaneHistoryFileData,
} from "./PaneHistoryFile.js";
import { PANE_HISTORY_MAX_PANE_BYTES } from "../terminal/historyAnsi.js";

function sample(): PaneHistoryFileData {
  return {
    schema: 1,
    savedAt: "2026-09-26T10:00:00.000Z",
    panes: [
      { paneId: "p1", savedAt: "2026-09-26T09:59:00.000Z", ansi: "\x1b[31mred\x1b[0m\r\n$ " },
      { paneId: "p2", savedAt: "2026-09-26T09:58:00.000Z", ansi: "日本語\r\n" },
    ],
  };
}

describe("FsPaneHistoryFile（session-history.json。20260926-screen-history-replay）", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir("soda-history-");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("状態ディレクトリの直下の session-history.json に書き、pane の id ごとに読み戻す（AC6）", async () => {
    const file = new FsPaneHistoryFile(dir);
    expect(file.path).toBe(join(dir, PANE_HISTORY_FILE_NAME));
    await file.save(sample());
    const loaded = await file.load();
    expect(loaded).toEqual({
      kind: "ok",
      panes: new Map([
        ["p1", { ansi: "\x1b[31mred\x1b[0m\r\n$ ", savedAt: "2026-09-26T09:59:00.000Z" }],
        ["p2", { ansi: "日本語\r\n", savedAt: "2026-09-26T09:58:00.000Z" }],
      ]),
    });
    expect(await readdir(dir)).toEqual([PANE_HISTORY_FILE_NAME]); // 一時ファイル・退避コピーを残さない
  });

  it.skipIf(process.platform === "win32")("権限は 0600（AC6）", async () => {
    const file = new FsPaneHistoryFile(dir);
    await file.save(sample());
    expect((await stat(file.path)).mode & 0o777).toBe(0o600);
  });

  it("無ければ missing", async () => {
    expect(await new FsPaneHistoryFile(dir).load()).toEqual({ kind: "missing" });
  });

  it("無い以外の読み取りの失敗は投げる（呼ぶ側がログに残して画面履歴なしで続ける）", async () => {
    const file = new FsPaneHistoryFile(dir);
    await mkdir(file.path); // ディレクトリなので読めない（EISDIR）
    await expect(file.load()).rejects.toMatchObject({ code: "EISDIR" });
  });

  it("読み込むときに安全化する（書き換えられたファイルでも問い合わせ・モード・OSC を返さない。AC8）", async () => {
    const file = new FsPaneHistoryFile(dir);
    const data = sample();
    data.panes[0]!.ansi = "ok\x1b[c\x1b[?2004h\x1b]52;c;aGk=\x07\x1b[31m!";
    await file.save(data);
    const loaded = await file.load();
    expect(loaded.kind).toBe("ok");
    if (loaded.kind === "ok") expect(loaded.panes.get("p1")!.ansi).toBe("ok\x1b[31m!");
  });

  it("上限を超える大きさのファイルは読まずに too_large（AC7）", async () => {
    const file = new FsPaneHistoryFile(dir, { maxFileBytes: 100 });
    await writeFile(
      file.path,
      JSON.stringify({
        schema: 1,
        savedAt: "x",
        panes: [{ paneId: "p1", savedAt: "x", ansi: "y".repeat(200) }],
      }),
    );
    const bytes = (await stat(file.path)).size;
    if (process.platform !== "win32") await chmod(file.path, 0o000); // 読めないファイルでも too_large になる＝中身を読んでいない
    const loaded = await file.load();
    expect(loaded).toEqual({ kind: "too_large", bytes });
  });

  it("pane ごとの上限を超える項目があればファイルごと corrupt（AC7）", async () => {
    const file = new FsPaneHistoryFile(dir);
    await writeFile(
      file.path,
      JSON.stringify({
        schema: 1,
        savedAt: "x",
        panes: [{ paneId: "p1", savedAt: "x", ansi: "y".repeat(PANE_HISTORY_MAX_PANE_BYTES + 1) }],
      }),
    );
    expect((await file.load()).kind).toBe("corrupt");
  });

  it("pane ごとの上限は UTF-8 のバイト数で数える（文字数は上限以下でも、バイト数が超えれば corrupt）", async () => {
    const file = new FsPaneHistoryFile(dir);
    const ansi = "あ".repeat(PANE_HISTORY_MAX_PANE_BYTES / 2); // 文字数は上限の半分・バイト数は 1.5 倍
    await writeFile(
      file.path,
      JSON.stringify({ schema: 1, savedAt: "x", panes: [{ paneId: "p1", savedAt: "x", ansi }] }),
    );
    expect((await file.load()).kind).toBe("corrupt");
  });

  it("corrupt の理由に中身を入れない（ログに画面の内容を残さない）", async () => {
    const file = new FsPaneHistoryFile(dir);
    await writeFile(file.path, '{"a": hunter2secret');
    expect(await file.load()).toEqual({ kind: "corrupt", reason: "invalid JSON" });
    await writeFile(
      file.path,
      JSON.stringify({
        schema: 1,
        savedAt: "x",
        panes: [{ paneId: "p1", savedAt: "x", ansi: 42, secret: "hunter2" }],
      }),
    );
    const loaded = await file.load();
    expect(loaded.kind).toBe("corrupt");
    if (loaded.kind === "corrupt") expect(loaded.reason).not.toContain("hunter2");
  });

  it.each([
    ["JSON でない", "{not json"],
    ["schema が違う", JSON.stringify({ schema: 2, savedAt: "x", panes: [] })],
    ["panes が配列でない", JSON.stringify({ schema: 1, savedAt: "x", panes: { p1: "a" } })],
    [
      "paneId が空",
      JSON.stringify({ schema: 1, savedAt: "x", panes: [{ paneId: "", savedAt: "x", ansi: "a" }] }),
    ],
    [
      "ansi が文字列でない",
      JSON.stringify({ schema: 1, savedAt: "x", panes: [{ paneId: "p1", savedAt: "x", ansi: 1 }] }),
    ],
  ])("形の合わないファイル（%s）は corrupt で、退避コピーを作らない（AC7）", async (_name, raw) => {
    const file = new FsPaneHistoryFile(dir);
    await writeFile(file.path, raw);
    expect((await file.load()).kind).toBe("corrupt");
    expect(await readdir(dir)).toEqual([PANE_HISTORY_FILE_NAME]); // *-backups を作らない（画面の内容を別の場所に残さない）
  });

  it("__proto__ のような id でも Object の既定に触れず、ただの id として読む", async () => {
    const file = new FsPaneHistoryFile(dir);
    await writeFile(
      file.path,
      JSON.stringify({
        schema: 1,
        savedAt: "x",
        panes: [{ paneId: "__proto__", savedAt: "x", ansi: "a" }],
      }),
    );
    const loaded = await file.load();
    expect(loaded.kind).toBe("ok");
    if (loaded.kind === "ok")
      expect(loaded.panes.get("__proto__")).toEqual({ ansi: "a", savedAt: "x" });
    if (loaded.kind === "ok") expect(loaded.panes).toBeInstanceOf(Map);
    expect(Object.prototype).not.toHaveProperty("ansi"); // 共有の既定を汚していない
  });

  it("clear は書いている途中で落ちて残った一時ディレクトリ（writeFileAtomic の形で十分古い .tmp-*）も消し、それ以外は残す", async () => {
    const file = new FsPaneHistoryFile(dir);
    const old = new Date(Date.now() - 60 * 60 * 1000);
    const mk = async (name: string, content?: [string, string]) => {
      await mkdir(join(dir, name));
      if (content) await writeFile(join(dir, name, content[0]), content[1]);
      await utimes(join(dir, name), old, old);
    };
    await mk(".tmp-abc123", ["write", "SECRET"]);
    await mk(".tmp-XyZ789"); // 中身が空（write を作る前に落ちた）
    await mk(".tmp-userdir"); // 名前の形が違う（利用者のもの）
    await mk(".tmp-def456", ["notes.txt", "user"]); // 中身が違う
    await writeFile(join(dir, ".tmp-ghi789"), "file"); // ディレクトリでない
    await mkdir(join(dir, ".tmp-new123")); // 新しい（書いている最中でありうる）
    await writeFile(join(dir, ".tmp-new123", "write"), "in progress");
    await writeFile(join(dir, "session.json"), "{}");
    expect(await file.clear()).toBe(false);
    expect((await readdir(dir)).sort()).toEqual([
      ".tmp-def456",
      ".tmp-ghi789",
      ".tmp-new123",
      ".tmp-userdir",
      "session.json",
    ]);
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "一時ディレクトリの片付けが失敗しても、本体は消す（片付けの失敗で抜けない）",
    async () => {
      const file = new FsPaneHistoryFile(dir);
      await file.save(sample());
      await chmod(dir, 0o300); // 通れて書けるが、一覧は読めない（片付けの readdir が EACCES で投げる）
      try {
        expect(await file.clear()).toBe(true);
      } finally {
        await chmod(dir, 0o700);
      }
      expect(existsSync(file.path)).toBe(false);
    },
  );

  it("clear は消したら true、無ければ false（AC4・AC5）", async () => {
    const file = new FsPaneHistoryFile(dir);
    expect(await file.clear()).toBe(false);
    await file.save(sample());
    expect(await file.clear()).toBe(true);
    expect(existsSync(file.path)).toBe(false);
  });
});
