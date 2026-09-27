import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  COMMANDS_FILE_MAX_BYTES,
  loadCommandsFile,
  parseCommandsJson,
  toCommandInfo,
} from "./commandConfig.js";

const SECRET = "curl -H 'Authorization: token-SECRET-123' https://example.invalid";

function file(commands: unknown[]): string {
  return JSON.stringify({ commands });
}

describe("parseCommandsJson（20260927-custom-command-keys の AC1・AC2）", () => {
  it("3 種類の例を読み、ブラウザへの形では command が落ちる", () => {
    const r = parseCommandsJson(
      file([
        {
          id: "lazygit",
          type: "popup",
          command: "lazygit",
          description: "lazygit を開く",
          width: "80%",
          height: 30,
        },
        { id: "htop", type: "pane", command: "htop" },
        { id: "build", type: "shell", command: "make\necho done" },
      ]),
    );
    expect(r.problem).toBeNull();
    expect(r.commands).toEqual([
      {
        id: "lazygit",
        type: "popup",
        command: "lazygit",
        description: "lazygit を開く",
        width: "80%",
        height: 30,
      },
      { id: "htop", type: "pane", command: "htop" },
      { id: "build", type: "shell", command: "make\necho done" },
    ]);
    expect(r.commands.map(toCommandInfo)).toEqual([
      { id: "lazygit", type: "popup", description: "lazygit を開く", width: "80%", height: 30 },
      { id: "htop", type: "pane" },
      { id: "build", type: "shell" },
    ]);
    expect(JSON.stringify(r.commands.map(toCommandInfo))).not.toContain("make");
  });

  it("0 件のファイルは問題なし", () => {
    expect(parseCommandsJson(file([]))).toEqual({ commands: [], problem: null });
  });

  const bad: [string, string, RegExp][] = [
    ["JSON として読めない", "{ commands: [", /JSON として読めません/],
    ["最上位が配列", "[]", /型が違います/],
    [
      "最上位に知らない項目",
      JSON.stringify({ commands: [], extra: 1 }),
      /知らない項目です（extra）/,
    ],
    ["commands が無い", "{}", /commands: 型が違います/],
    [
      "件数が多すぎる",
      file(
        Array.from({ length: 101 }, (_, i) => ({ id: `c${i}`, type: "shell", command: "true" })),
      ),
      /100 件まで/,
    ],
    [
      "知らない項目",
      file([{ id: "a", type: "shell", command: "true", env: { X: "1" } }]),
      /commands\[0\]: 知らない項目です（env）/,
    ],
    [
      "id の規則違反",
      file([{ id: "A b", type: "shell", command: "true" }]),
      /commands\[0\]\.id: id は/,
    ],
    [
      "id が長すぎる",
      file([{ id: "a".repeat(65), type: "shell", command: "true" }]),
      /commands\[0\]\.id/,
    ],
    [
      "id の重複",
      file([
        { id: "a", type: "shell", command: "true" },
        { id: "a", type: "pane", command: "true" },
      ]),
      /commands\[1\]\.id: id が重複/,
    ],
    [
      "知らない種類",
      file([{ id: "a", type: "plugin_action", command: "x.y" }]),
      /commands\[0\]\.type: 知らない種類/,
    ],
    [
      "幅が範囲外",
      file([{ id: "a", type: "popup", command: "true", width: 1001 }]),
      /commands\[0\]\.width: セル数/,
    ],
    [
      "割合が範囲外",
      file([{ id: "a", type: "popup", command: "true", height: "101%" }]),
      /commands\[0\]\.height: セル数/,
    ],
    [
      "popup 以外の幅",
      file([{ id: "a", type: "pane", command: "true", width: 10 }]),
      /commands\[0\]\.width: width・height は popup にだけ/,
    ],
    [
      "popup 以外の高さ",
      file([{ id: "a", type: "shell", command: "true", height: "50%" }]),
      /commands\[0\]\.height: width・height は popup にだけ/,
    ],
    ["空のコマンド", file([{ id: "a", type: "shell", command: "" }]), /空のコマンド/],
    ["空白だけのコマンド", file([{ id: "a", type: "shell", command: "  \n " }]), /空のコマンド/],
    [
      "長すぎるコマンド",
      file([{ id: "a", type: "shell", command: "x".repeat(4097) }]),
      /4096 文字まで/,
    ],
    [
      "コマンドに制御文字（ESC）",
      file([{ id: "a", type: "shell", command: "echo \u001b[31m" }]),
      /改行以外の制御文字/,
    ],
    [
      "コマンドにタブ",
      file([{ id: "a", type: "shell", command: "echo\tx" }]),
      /改行以外の制御文字/,
    ],
    [
      "コマンドに NUL",
      file([{ id: "a", type: "shell", command: "echo\u0000x" }]),
      /改行以外の制御文字/,
    ],
    [
      "コマンドに DEL",
      file([{ id: "a", type: "shell", command: "echo\u007fx" }]),
      /改行以外の制御文字/,
    ],
    [
      "説明に改行",
      file([{ id: "a", type: "shell", command: "true", description: "a\nb" }]),
      /説明に制御文字/,
    ],
    [
      "説明が長すぎる",
      file([{ id: "a", type: "shell", command: "true", description: "x".repeat(201) }]),
      /200 文字まで/,
    ],
    [
      "コマンドが文字列でない",
      file([{ id: "a", type: "shell", command: ["ls"] }]),
      /commands\[0\]\.command: 型が違います/,
    ],
  ];
  it.each(bad)("%s → 全体を採らず、理由を出す", (_name, text, re) => {
    const r = parseCommandsJson(text);
    expect(r.commands).toEqual([]);
    expect(r.problem).toMatch(/^commands\.json: /);
    expect(r.problem).toMatch(re);
  });

  it("1 件でも規則外なら、正しい他の件も採らない", () => {
    const r = parseCommandsJson(
      file([
        { id: "ok", type: "shell", command: "true" },
        { id: "ng", type: "nope", command: "true" },
      ]),
    );
    expect(r.commands).toEqual([]);
  });

  it("理由の文にコマンドの文字列（秘密）を入れない", () => {
    for (const cmds of [
      [{ id: "a", type: "shell", command: `${SECRET}\u001b` }],
      [{ id: "a", type: "pane", command: SECRET, width: 3 }],
      [{ id: "a", type: "pane", command: SECRET, [SECRET.slice(0, 4)]: 1 }],
      [{ id: "a", type: "nope", command: SECRET }],
      [{ id: SECRET, type: "shell", command: SECRET }],
    ]) {
      const r = parseCommandsJson(file(cmds));
      expect(r.problem).not.toBeNull();
      expect(r.problem).not.toContain("SECRET");
    }
  });

  it("JSON として読めない文の断片（秘密）も理由に入れない・知らない項目の名前は安全な形だけ出す", () => {
    const broken = parseCommandsJson(`{"commands":[{"id":"a","type":"shell","command": ${SECRET}`);
    expect(broken.problem).toBe("commands.json: JSON として読めません");
    const esc = parseCommandsJson(
      file([
        {
          id: "a",
          type: "shell",
          command: "true",
          "\u001b[2Jx": 1,
          ["k".repeat(40)]: 2,
          ok_key: 3,
        },
      ]),
    );
    expect(esc.problem).toBe(
      "commands.json: commands[0]: 知らない項目です（（名前は省略）, （名前は省略）, ok_key）",
    );
  });
});

describe("loadCommandsFile（AC1・AC3）", () => {
  let dir: string;
  let path: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "soda-commands-test-"));
    path = join(dir, "commands.json");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("無ければ 0 件・問題なし", async () => {
    expect(await loadCommandsFile(path)).toEqual({ commands: [], problem: null });
  });

  it("0600 のファイルを読む（警告なし）", async () => {
    await writeFile(path, file([{ id: "a", type: "shell", command: "true" }]), { mode: 0o600 });
    await chmod(path, 0o600);
    const r = await loadCommandsFile(path);
    expect(r).toEqual({ commands: [{ id: "a", type: "shell", command: "true" }], problem: null });
  });

  it("グループ・その他が読めるだけなら採って警告を返す", async () => {
    await writeFile(path, file([{ id: "a", type: "shell", command: "true" }]));
    await chmod(path, 0o644);
    const r = await loadCommandsFile(path);
    expect(r.commands).toHaveLength(1);
    expect(r.warning).toMatch(/chmod 600/);
  });

  it.each([0o620, 0o602, 0o666, 0o622])(
    "グループかその他が書ける（%o）なら採らない",
    async (mode) => {
      await writeFile(path, file([{ id: "a", type: "shell", command: "true" }]));
      await chmod(path, mode);
      const r = await loadCommandsFile(path);
      expect(r.commands).toEqual([]);
      expect(r.problem).toMatch(/書き込めます/);
    },
  );

  it("シンボリックリンクは採らない（リンク先が正しいファイルでも）", async () => {
    const real = join(dir, "real.json");
    await writeFile(real, file([{ id: "a", type: "shell", command: "true" }]), { mode: 0o600 });
    await symlink(real, path);
    const r = await loadCommandsFile(path);
    expect(r.commands).toEqual([]);
    expect(r.problem).toMatch(/シンボリックリンク/);
  });

  it("ディレクトリ（通常のファイルでない）は採らない", async () => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path, { mode: 0o700 });
    const r = await loadCommandsFile(path);
    expect(r.commands).toEqual([]);
    expect(r.problem).toMatch(/通常のファイルではありません/);
  });

  it("FIFO でも止まらずに断る", async () => {
    const { execFileSync } = await import("node:child_process");
    execFileSync("mkfifo", ["-m", "600", path]);
    const r = await loadCommandsFile(path);
    expect(r.commands).toEqual([]);
    expect(r.problem).toMatch(/通常のファイルではありません/);
  });

  it("別のユーザーの持ち物は採らない", async () => {
    await writeFile(path, file([{ id: "a", type: "shell", command: "true" }]), { mode: 0o600 });
    await chmod(path, 0o600);
    const r = await loadCommandsFile(path, { getuid: () => process.getuid!() + 1 });
    expect(r.commands).toEqual([]);
    expect(r.problem).toMatch(/持ち物ではありません/);
  });

  it("大きすぎるファイルは読まない", async () => {
    await writeFile(path, " ".repeat(COMMANDS_FILE_MAX_BYTES) + file([]), { mode: 0o600 });
    await chmod(path, 0o600);
    const r = await loadCommandsFile(path);
    expect(r.commands).toEqual([]);
    expect(r.problem).toMatch(/大きすぎます/);
  });

  it("上限ちょうどの大きさは読む", async () => {
    const body = file([]);
    await writeFile(path, " ".repeat(COMMANDS_FILE_MAX_BYTES - body.length) + body, {
      mode: 0o600,
    });
    await chmod(path, 0o600);
    expect((await loadCommandsFile(path)).problem).toBeNull();
  });

  it("不正な UTF-8 は断り、先頭の BOM は受け入れる", async () => {
    await writeFile(
      path,
      Buffer.concat([
        Buffer.from('{"commands":[{"id":"a","type":"shell","command":"'),
        Buffer.from([0xff, 0xfe]),
        Buffer.from('"}]}'),
      ]),
      { mode: 0o600 },
    );
    await chmod(path, 0o600);
    expect((await loadCommandsFile(path)).problem).toBe("commands.json: UTF-8 として読めません");
    await writeFile(
      path,
      Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from(file([{ id: "a", type: "shell", command: "true" }])),
      ]),
      { mode: 0o600 },
    );
    expect((await loadCommandsFile(path)).commands).toHaveLength(1);
  });

  it("短い読み（1 回の read で少しずつしか返らない）でも終わりまで読む", async () => {
    const body = Buffer.from(file([{ id: "a", type: "shell", command: "true" }]));
    const handle = {
      stat: async () => ({
        isFile: () => true,
        uid: process.getuid!(),
        mode: 0o100600,
        size: body.length,
      }),
      read: async (buf: Buffer, offset: number, length: number, position: number) => {
        const n = Math.min(3, length, body.length - position);
        body.copy(buf, offset, position, position + Math.max(0, n));
        return { bytesRead: Math.max(0, n), buffer: buf };
      },
      close: async () => undefined,
    };
    const r = await loadCommandsFile(path, { open: async () => handle as never });
    expect(r).toEqual({ commands: [{ id: "a", type: "shell", command: "true" }], problem: null });
  });

  it("Windows では持ち主・権限を検査しない", async () => {
    await writeFile(path, file([{ id: "a", type: "shell", command: "true" }]));
    await chmod(path, 0o666);
    const r = await loadCommandsFile(path, {
      platform: "win32",
      getuid: () => process.getuid!() + 1,
    });
    expect(r.problem).toBeNull();
    expect(r.commands).toHaveLength(1);
    expect(r.warning).toBeUndefined();
  });
});
