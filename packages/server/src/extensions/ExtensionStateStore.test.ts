import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ExtensionStateStore, EXTENSION_STATE_FILE_NAME, EXTENSION_STATE_MAX } from "./ExtensionStateStore.js";

describe.skipIf(process.platform === "win32")("ExtensionStateStore", () => {
  let dir: string;
  let file: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ext-state-"));
    file = join(dir, EXTENSION_STATE_FILE_NAME);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const put = async (text: string, mode = 0o600) => {
    await writeFile(file, text, { mode });
    await chmod(file, mode);
  };
  const keys = (...k: string[]) => new Set(k);

  it("無いファイルは、空で ok", async () => {
    expect(await new ExtensionStateStore(dir).load()).toEqual({ ok: true, disabled: new Set() });
  });
  it("書いて読める（0600）", async () => {
    const s = new ExtensionStateStore(dir);
    await s.setDisabled("user:a", true, keys("user:a", "user:b"));
    await s.setDisabled("user:b", true, keys("user:a", "user:b"));
    expect(await s.load()).toEqual({ ok: true, disabled: keys("user:a", "user:b") });
    expect(((await stat(file)).mode & 0o777).toString(8)).toBe("600");
    await s.setDisabled("user:a", false, keys("user:a", "user:b"));
    expect(await s.load()).toEqual({ ok: true, disabled: keys("user:b") });
  });
  it("壊れた JSON・知らない項目・版違い → ok: false", async () => {
    const s = new ExtensionStateStore(dir);
    for (const text of ["{ nope", '{"version":1,"disabled":[],"x":1}', '{"version":2,"disabled":[]}', '{"version":1,"disabled":[1]}', '{"disabled":[]}']) {
      await put(text);
      const r = await s.load();
      expect(r.ok, text).toBe(false);
    }
  });
  it("ほかの利用者が書ける・持ち主が違う → ok: false", async () => {
    await put('{"version":1,"disabled":[]}', 0o666);
    expect((await new ExtensionStateStore(dir).load()).ok).toBe(false);
    await put('{"version":1,"disabled":[]}');
    expect((await new ExtensionStateStore(dir, { getuid: () => (process.getuid?.() ?? 0) + 1 }).load()).ok).toBe(false);
  });
  it("setDisabled は、壊れたファイル・無いファイルを作り直す", async () => {
    const s = new ExtensionStateStore(dir);
    await put("{ nope");
    await s.setDisabled("user:a", true, keys("user:a"));
    expect(await s.load()).toEqual({ ok: true, disabled: keys("user:a") });
  });
  it("読めない（偽の open が EACCES）ときは、書かずに誤り（internal）", async () => {
    await put('{"version":1,"disabled":["user:a"]}');
    const before = await readFile(file, "utf8");
    const s = new ExtensionStateStore(dir, { open: async () => Promise.reject(Object.assign(new Error("e"), { code: "EACCES" })) });
    expect((await s.load()).ok).toBe(false);
    await expect(s.setDisabled("user:b", true, keys("user:a", "user:b"))).rejects.toMatchObject({ code: "internal" });
    expect(await readFile(file, "utf8")).toBe(before);
  });
  it("読んでいる途中の誤り（read が EIO）も、書かずに誤り", async () => {
    await put('{"version":1,"disabled":["user:a"]}');
    const real = (await import("node:fs/promises")).open;
    const s = new ExtensionStateStore(dir, {
      open: async (p, f) => {
        const h = await real(p, f);
        const origRead = h.read.bind(h);
        (h as unknown as { read: unknown }).read = async () => {
          void origRead;
          throw Object.assign(new Error("io"), { code: "EIO" });
        };
        return h;
      },
    });
    await expect(s.setDisabled("user:b", true, keys("user:a", "user:b"))).rejects.toMatchObject({ code: "internal" });
  });
  it("known に無い key を捨てる", async () => {
    const s = new ExtensionStateStore(dir);
    await put('{"version":1,"disabled":["user:gone","user:a"]}');
    await s.setDisabled("user:b", true, keys("user:a", "user:b"));
    expect(await s.load()).toEqual({ ok: true, disabled: keys("user:a", "user:b") });
  });
  it("256 件を超えると誤り（invalid_params）。256 件ちょうどは通る", async () => {
    const s = new ExtensionStateStore(dir);
    const all = Array.from({ length: EXTENSION_STATE_MAX + 1 }, (_, i) => `user:e${i}`);
    await put(JSON.stringify({ version: 1, disabled: all.slice(0, EXTENSION_STATE_MAX) }));
    await s.setDisabled(all[0]!, true, new Set(all)); // 既にある
    await expect(s.setDisabled(all[EXTENSION_STATE_MAX]!, true, new Set(all))).rejects.toMatchObject({ code: "invalid_params" });
    expect((await s.load()).ok && (await s.load() as { disabled: Set<string> }).disabled.size).toBe(EXTENSION_STATE_MAX);
  });
  describe("プロジェクトの key（D13 の 2）", () => {
    const pk = (n: number) => `project:${String(n).padStart(64, "0")}:e`;
    it("known に無くても、project: の key は残す。user: の key は、known に無ければ捨てる", async () => {
      const s = new ExtensionStateStore(dir);
      await put(JSON.stringify({ version: 1, disabled: [pk(1), "user:gone", "user:a"] }));
      await s.setDisabled("user:b", true, keys("user:a", "user:b"));
      expect(await s.load()).toEqual({ ok: true, disabled: keys(pk(1), "user:a", "user:b") });
    });
    it("256 件を超えたら、いま一覧に無いプロジェクトの key を古いもの（先に足した順）から捨てる", async () => {
      const s = new ExtensionStateStore(dir);
      const all = Array.from({ length: EXTENSION_STATE_MAX }, (_, i) => pk(i));
      await put(JSON.stringify({ version: 1, disabled: all }));
      await s.setDisabled("user:new", true, keys("user:new"));
      const after = await s.load();
      expect(after.ok && after.disabled.size).toBe(EXTENSION_STATE_MAX);
      expect(after.ok && after.disabled.has("user:new")).toBe(true);
      expect(after.ok && after.disabled.has(pk(0))).toBe(false); // 一番古い
      expect(after.ok && after.disabled.has(pk(1))).toBe(true);
    });
    it("いま一覧にあるプロジェクトの key は、256 件の押し出しで捨てない（足りなければ誤り）", async () => {
      const s = new ExtensionStateStore(dir);
      const all = Array.from({ length: EXTENSION_STATE_MAX }, (_, i) => pk(i));
      await put(JSON.stringify({ version: 1, disabled: all }));
      await expect(s.setDisabled("user:new", true, new Set([...all, "user:new"]))).rejects.toMatchObject({ code: "invalid_params" });
    });
  });
});
