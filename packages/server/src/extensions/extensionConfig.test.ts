import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXTENSIONS_FILE_MAX_BYTES } from "@sodashitsu/protocol";
import { loadUserExtensionsFile, parseExtensionsJson } from "./extensionConfig.js";

const SECRET = "node /tmp/x.mjs --token=TOKEN-SECRET-123";
const file = (extensions: unknown[]): string => JSON.stringify({ extensions });
const one = (e: Record<string, unknown>) => file([{ id: "a", command: "node a.mjs", ...e }]);

describe("parseExtensionsJson", () => {
  it("既定を埋め、allow を並べ替える", () => {
    const r = parseExtensionsJson(file([{ id: "a", command: "node a.mjs" }]), "user");
    expect(r).toEqual({
      entries: [{ id: "a", command: "node a.mjs", description: null, enabled: true, allow: [], onUnresponsive: "pass", cwd: null }],
      problem: null,
    });
  });
  it("全項目", () => {
    const r = parseExtensionsJson(one({ description: "説明", enabled: false, allow: ["script-html"], onUnresponsive: "block", cwd: "/tmp" }), "user");
    expect(r.entries[0]).toEqual({ id: "a", command: "node a.mjs", description: "説明", enabled: false, allow: ["script-html"], onUnresponsive: "block", cwd: "/tmp" });
  });
  it("0 件・16 件は通り、17 件は誤り", () => {
    expect(parseExtensionsJson(file([]), "user").problem).toBeNull();
    const n = (k: number) => file(Array.from({ length: k }, (_, i) => ({ id: `e${i}`, command: "x" })));
    expect(parseExtensionsJson(n(16), "user").entries).toHaveLength(16);
    const r = parseExtensionsJson(n(17), "user");
    expect(r.entries).toEqual([]);
    expect(r.problem).toMatch(/16 件まで/);
  });
  const bad: [string, string][] = [
    ["JSON でない", "{ extensions: ["],
    ["配列でない", '{"extensions":{}}'],
    ["知らない外側の項目", '{"extensions":[],"x":1}'],
    ["知らない項目", one({ foo: 1 })],
    ["id の規則", file([{ id: "A", command: "x" }])],
    ["id の重複", file([{ id: "a", command: "x" }, { id: "a", command: "y" }])],
    ["command が空", one({ command: "" })],
    ["command が長い", one({ command: "x".repeat(1025) })],
    ["command の前後の空白", one({ command: " x" })],
    ["command に改行", one({ command: "a\nb" })],
    ["command に U+202E", one({ command: "a‮b" })],
    ["command に U+00A0", one({ command: "a b" })],
    ["description が長い", one({ description: "x".repeat(201) })],
    ["description に制御文字", one({ description: "a\u0007" })],
    ["enabled が真偽でない", one({ enabled: "yes" })],
    ["知らない allow", one({ allow: ["nope"] })],
    ["allow の重複", one({ allow: ["script-html", "script-html"] })],
    ["onUnresponsive", one({ onUnresponsive: "kill" })],
    ["cwd が相対", one({ cwd: "rel/dir" })],
    ["cwd が長い", one({ cwd: "/" + "x".repeat(1024) })],
  ];
  for (const [name, text] of bad) {
    it(`誤り: ${name}`, () => {
      const r = parseExtensionsJson(text, "user");
      expect(r.entries).toEqual([]);
      expect(r.problem).toMatch(/^extensions\.json: /);
    });
  }
  it("1 つでも誤りなら、ほかの正しい 1 件も採らない", () => {
    const r = parseExtensionsJson(file([{ id: "ok", command: "x" }, { id: "BAD", command: "y" }]), "user");
    expect(r.entries).toEqual([]);
  });
  it("プロジェクトの設定では cwd が誤り（利用者では通る）", () => {
    expect(parseExtensionsJson(one({ cwd: "/tmp" }), "user").problem).toBeNull();
    const r = parseExtensionsJson(one({ cwd: "/tmp" }), "project");
    expect(r.entries).toEqual([]);
    expect(r.problem).toMatch(/cwd/);
    expect(parseExtensionsJson(one({}), "project").entries[0]?.cwd).toBeNull();
  });
  it("誤りの文に、設定に書いた値が入らない", () => {
    const texts = [
      one({ command: SECRET, foo: 1 }),
      one({ command: SECRET + "\n" }),
      one({ command: SECRET, allow: [SECRET] }),
      one({ command: SECRET, onUnresponsive: SECRET }),
      one({ command: SECRET, enabled: SECRET }),
      file([{ id: SECRET, command: "x" }]),
      JSON.stringify({ extensions: [{ id: "a", command: "x", [SECRET]: 1 }] }),
      one({ command: "x", cwd: SECRET }),
      one({ command: "x", description: SECRET + "\u0000" }),
    ];
    for (const t of texts) {
      const r = parseExtensionsJson(t, "user");
      expect(r.problem, t).not.toBeNull();
      expect(r.problem).not.toContain("SECRET");
      expect(r.problem).not.toContain("TOKEN");
    }
  });
  it("__proto__ を項目に持つ設定は、知らない項目として誤り", () => {
    const r = parseExtensionsJson('{"extensions":[{"id":"a","command":"x","__proto__":{"a":1}}]}', "user");
    expect(r.problem).not.toBeNull();
    expect(({} as Record<string, unknown>).a).toBeUndefined();
  });
});

describe.skipIf(process.platform === "win32")("loadUserExtensionsFile", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ext-config-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const write = async (text: string, mode = 0o600): Promise<string> => {
    const p = join(dir, "extensions.json");
    await writeFile(p, text, { mode });
    await chmod(p, mode);
    return p;
  };

  it("ENOENT は空（誤りではない）", async () => {
    expect(await loadUserExtensionsFile(join(dir, "nope.json"))).toEqual({ entries: [], problem: null });
  });
  it("読める", async () => {
    const r = await loadUserExtensionsFile(await write(one({})));
    expect(r.problem).toBeNull();
    expect(r.entries).toHaveLength(1);
  });
  it("リンクは断る", async () => {
    const real = await write(one({}));
    const link = join(dir, "link.json");
    await symlink(real, link);
    const r = await loadUserExtensionsFile(link);
    expect(r.entries).toEqual([]);
    expect(r.problem).toMatch(/シンボリックリンク/);
  });
  it("ディレクトリ（通常のファイルでない）は断る", async () => {
    await mkdir(join(dir, "d.json"));
    const r = await loadUserExtensionsFile(join(dir, "d.json"));
    expect(r.problem).toBeTruthy();
  });
  it("ほかの利用者が書ける（グループ・その他）は断る", async () => {
    for (const mode of [0o620, 0o602, 0o666]) {
      const r = await loadUserExtensionsFile(await write(one({}), mode));
      expect(r.problem, mode.toString(8)).toMatch(/書き込めます/);
    }
  });
  it("読めるだけなら採って warning", async () => {
    const r = await loadUserExtensionsFile(await write(one({}), 0o644));
    expect(r.problem).toBeNull();
    expect(r.warning).toMatch(/chmod 600/);
  });
  it("持ち主が自分でない（getuid を差し替え）は断る", async () => {
    const r = await loadUserExtensionsFile(await write(one({})), { getuid: () => (process.getuid?.() ?? 0) + 1 });
    expect(r.problem).toMatch(/持ち物ではありません/);
  });
  it("大きすぎる", async () => {
    const r = await loadUserExtensionsFile(await write(" ".repeat(EXTENSIONS_FILE_MAX_BYTES + 1)));
    expect(r.problem).toMatch(/大きすぎます/);
  });
  it("ちょうどの大きさは読む", async () => {
    const body = one({});
    const r = await loadUserExtensionsFile(await write(body + " ".repeat(EXTENSIONS_FILE_MAX_BYTES - Buffer.byteLength(body))));
    expect(r.problem).toBeNull();
  });
  it("壊れた UTF-8", async () => {
    const p = join(dir, "extensions.json");
    await writeFile(p, Buffer.from([0x7b, 0xff, 0xfe, 0x7d]), { mode: 0o600 });
    expect((await loadUserExtensionsFile(p)).problem).toMatch(/UTF-8/);
  });
  it("開けない（偽の open が EACCES）", async () => {
    const r = await loadUserExtensionsFile("/x", { open: async () => Promise.reject(Object.assign(new Error("e"), { code: "EACCES" })) });
    expect(r.problem).toMatch(/EACCES/);
  });
  it("誤りの文に、コマンドの文字列が入らない（ファイル経由）", async () => {
    const r = await loadUserExtensionsFile(await write(one({ command: SECRET, foo: 1 })));
    expect(r.problem).not.toBeNull();
    expect(r.problem).not.toContain("SECRET");
  });
});

describe("loadUserExtensionsFile（Windows）", () => {
  it("持ち主と権限を見ない（platform: win32）", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ext-config-w-"));
    try {
      const p = join(dir, "extensions.json");
      await writeFile(p, one({}), { mode: 0o666 });
      await chmod(p, 0o666);
      const r = await loadUserExtensionsFile(p, { platform: "win32", getuid: () => 999999 });
      expect(r.problem).toBeNull();
      expect(r.warning).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
