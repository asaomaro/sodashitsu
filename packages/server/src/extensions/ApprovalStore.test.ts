import { chmod, mkdtemp, open, readFile, readdir, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApprovalStore, APPROVALS_FILE_NAME, type ApprovalFileDeps } from "./ApprovalStore.js";
import type { ExtensionEntry } from "./extensionConfig.js";
import { entryDigest } from "./approval.js";

// 20261007-ext-host T21：承認の記録。読めない・壊れている → 記録なし（動く側に倒れない）。書く手順は鍵のファイル・読み直し・2 秒の打ち切り。
const entry = (over: Partial<ExtensionEntry> = {}): ExtensionEntry => ({
  id: "hello",
  command: "node .soda/hello.mjs",
  description: null,
  enabled: true,
  allow: [],
  onUnresponsive: "pass",
  cwd: null,
  ...over,
});
const ROOT = "/home/me/repo";
const D = (n: string): string => entryDigest(ROOT, entry({ command: n }));

describe.skipIf(process.platform === "win32")("ApprovalStore", () => {
  let dir: string;
  let file: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "soda-appr-"));
    file = join(dir, APPROVALS_FILE_NAME);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const store = (deps: Partial<ApprovalFileDeps> = {}) => new ApprovalStore(dir, { timeoutMs: 400, lockRetryMs: 10, ...deps });

  it("lookup: 承認と同じ鍵 → approved、承認しないと同じ鍵 → denied、どちらでもない → none（前に承認した中身・denied の有無）、無い → none", async () => {
    const s = store();
    const e = entry();
    await s.decideApproved(ROOT, "hello", D("a"), e);
    let set = await s.load();
    expect(set.lookup(ROOT, "hello", D("a"))).toEqual({ status: "approved" });
    expect(set.lookup(ROOT, "hello", D("b"))).toMatchObject({ status: "none", deniedBefore: false, previous: { id: "hello", command: e.command } });
    await s.decideDenied(ROOT, "hello", D("b"));
    set = await s.load();
    expect(set.lookup(ROOT, "hello", D("b"))).toEqual({ status: "denied" });
    // A を承認 → B を denied → A の鍵は approved のまま
    expect(set.lookup(ROOT, "hello", D("a"))).toEqual({ status: "approved" });
    expect(set.lookup(ROOT, "hello", D("c"))).toMatchObject({ status: "none", deniedBefore: true, previous: { id: "hello" } });
    expect(set.lookup(ROOT, "other", D("a"))).toEqual({ status: "none", deniedBefore: false });
    expect(set.lookup("/elsewhere", "hello", D("a"))).toEqual({ status: "none", deniedBefore: false });
  });

  it("decide(approved) は denied を消す。revoke はその (根, id) の 1 件を全部消す。ほかの (根, id) は残る", async () => {
    const s = store();
    await s.decideDenied(ROOT, "hello", D("x"));
    await s.decideApproved(ROOT, "hello", D("a"), entry());
    await s.decideApproved(ROOT, "keep", D("k"), entry({ id: "keep" }));
    let set = await s.load();
    expect(set.find(ROOT, "hello")?.denied).toBeUndefined();
    await s.revoke(ROOT, "hello");
    set = await s.load();
    expect(set.find(ROOT, "hello")).toBeUndefined();
    expect(set.find(ROOT, "keep")).toBeDefined();
    expect(set.list().map((r) => r.id)).toEqual(["keep"]);
  });

  it("記録が無い (根, id) の revoke は、何も書かずに成功（ファイルを作らない）", async () => {
    await store().revoke(ROOT, "nothing");
    await expect(stat(file)).rejects.toThrow();
  });

  it("書いたファイルの権限は 0600、終わった後に鍵のファイルが残らない", async () => {
    await store().decideApproved(ROOT, "hello", D("a"), entry());
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await readdir(dir)).filter((n) => n.includes("lock"))).toEqual([]);
  });

  it("list は、コマンドの文字列を含まない", async () => {
    await store().decideApproved(ROOT, "hello", D("a"), entry({ command: "node SECRET-CMD.mjs" }));
    const set = await store().load();
    expect(JSON.stringify(set.list())).not.toContain("SECRET-CMD");
  });

  describe("読むとき（だめなら記録なし）", () => {
    const good = (extra: object = {}) => ({ version: 1, records: [{ root: ROOT, id: "hello", approved: { digest: D("a"), at: "2026-10-08T00:00:00.000Z", entry: entry() }, ...extra }] });
    const put = async (v: unknown, mode = 0o600) => {
      await writeFile(file, typeof v === "string" ? v : JSON.stringify(v), { mode });
      await chmod(file, mode);
    };
    it("正しいファイルは読める（基準）", async () => {
      await put(good());
      const set = await store().load();
      expect(set.problem).toBeNull();
      expect(set.lookup(ROOT, "hello", D("a")).status).toBe("approved");
    });
    it.each([
      ["壊れた JSON", "{こわれた"],
      ["知らない項目", good({ extra: 1 })],
      ["version が 0", { version: 0, records: [] }],
      ["digest が 64 桁でない", { version: 1, records: [{ root: ROOT, id: "hello", approved: { digest: "abc", at: "x", entry: entry() } }] }],
      ["approved も denied も無い", { version: 1, records: [{ root: ROOT, id: "hello" }] }],
      ["root が相対パス", { version: 1, records: [{ root: "rel", id: "hello", denied: { digest: D("a"), at: "x" } }] }],
      ["同じ (根, id) が 2 件", { version: 1, records: [good().records[0], good().records[0]] }],
    ])("%s → 記録なし（理由つき）", async (_n, v) => {
      await put(v);
      const set = await store().load();
      expect(set.records).toEqual([]);
      expect(set.problem).not.toBeNull();
      expect(set.lookup(ROOT, "hello", D("a")).status).toBe("none");
    });
    it("リンク・ほかの利用者が書ける → 記録なし", async () => {
      await put(good());
      await chmod(file, 0o666);
      expect((await store().load()).records).toEqual([]);
      await rm(file);
      await put(good());
      await rm(file);
      await writeFile(join(dir, "real.json"), JSON.stringify(good()), { mode: 0o600 });
      await symlink(join(dir, "real.json"), file);
      expect((await store().load()).records).toEqual([]);
    });
    it("version が新しい（2）→ 記録なし・decide は誤りでファイルが変わらない", async () => {
      const text = JSON.stringify({ version: 2, records: [{ novel: true }] });
      await put(text);
      const s = store();
      expect((await s.load()).records).toEqual([]);
      await expect(s.decideApproved(ROOT, "hello", D("a"), entry())).rejects.toMatchObject({ code: "internal" });
      expect(await readFile(file, "utf8")).toBe(text);
    });
    it("壊れたファイルへの decide は、空から作り直して書ける", async () => {
      await put("{こわれた");
      await store().decideApproved(ROOT, "hello", D("a"), entry());
      expect((await store().load()).lookup(ROOT, "hello", D("a")).status).toBe("approved");
    });
  });

  it("読み直しが読めない（偽の open が EACCES）とき、decide は誤りで、ファイルが変わらない", async () => {
    await store().decideApproved(ROOT, "hello", D("a"), entry());
    const before = await readFile(file, "utf8");
    const s = store({
      open: async () => {
        throw Object.assign(new Error("denied"), { code: "EACCES" });
      },
    });
    await expect(s.decideApproved(ROOT, "other", D("z"), entry({ id: "other" }))).rejects.toMatchObject({ code: "internal" });
    await expect(s.revoke(ROOT, "hello")).rejects.toMatchObject({ code: "internal" });
    expect(await readFile(file, "utf8")).toBe(before);
    expect((await readdir(dir)).filter((n) => n.includes("lock"))).toEqual([]);
  });

  it("257 件目で、古いものから捨てる", async () => {
    const records = Array.from({ length: 256 }, (_, i) => ({
      root: ROOT,
      id: `e${i}`,
      denied: { digest: D(`d${i}`), at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() },
    }));
    await writeFile(file, JSON.stringify({ version: 1, records }), { mode: 0o600 });
    await chmod(file, 0o600);
    await store().decideApproved(ROOT, "newest", D("n"), entry({ id: "newest" }));
    const set = await store().load();
    expect(set.records).toHaveLength(256);
    expect(set.find(ROOT, "newest")).toBeDefined();
    expect(set.find(ROOT, "e0")).toBeUndefined();
    expect(set.find(ROOT, "e1")).toBeDefined();
  });

  describe("鍵のファイル", () => {
    const lock = () => `${file}.lock`;
    it("新しい鍵が残っている → 待って誤り・記録は変わらない・他人の鍵は消さない", async () => {
      await writeFile(lock(), "other:mark", { mode: 0o600 });
      const t0 = Date.now();
      await expect(store({ timeoutMs: 250 }).decideApproved(ROOT, "hello", D("a"), entry())).rejects.toMatchObject({ code: "internal" });
      expect(Date.now() - t0).toBeGreaterThanOrEqual(200);
      await expect(stat(file)).rejects.toThrow();
      expect(await readFile(lock(), "utf8")).toBe("other:mark");
    });
    it("30 秒より古い鍵 → 消して書ける", async () => {
      await writeFile(lock(), "dead:mark", { mode: 0o600 });
      const old = new Date(Date.now() - 60_000);
      await utimes(lock(), old, old);
      await store().decideApproved(ROOT, "hello", D("a"), entry());
      expect((await store().load()).lookup(ROOT, "hello", D("a")).status).toBe("approved");
      await expect(stat(lock())).rejects.toThrow();
    });
    it("消そうとした鍵の中身が、確かめ直したら変わっていた → 消さない", async () => {
      await writeFile(lock(), "dead:mark", { mode: 0o600 });
      const old = new Date(Date.now() - 60_000);
      await utimes(lock(), old, old);
      // 最初に見た後・確かめ直す前に、別のサーバが作り直した鍵に差し替える（時刻を新しくする）。
      let swapped = false;
      const s = store({
        timeoutMs: 250,
        now: () => {
          if (!swapped) {
            swapped = true;
            void writeFile(lock(), "new:mark", { mode: 0o600 });
          }
          return new Date();
        },
      });
      await expect(s.decideApproved(ROOT, "hello", D("a"), entry())).rejects.toMatchObject({ code: "internal" });
      expect(await readFile(lock(), "utf8")).toBe("new:mark");
    });

    it("読み直しが時間内に返らず、誤りが返った後に、読み直しが返っても、ファイルが書かれない。その間、鍵は残り、裏が返った後に消える。裏が返る前の次の decide は、始めずに誤り", async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const s = store({
        timeoutMs: 150,
        open: async (p, f) => {
          await gate;
          return open(p, f);
        },
      });
      await expect(s.decideApproved(ROOT, "hello", D("a"), entry())).rejects.toMatchObject({ code: "internal" });
      // 鍵は、裏の続きが返るまで残る。
      expect(await readFile(lock(), "utf8")).toMatch(/^\d+:/);
      // 前の書く手順が返っていないので、次は始めずに誤り（別の鍵・読み直しに触れない）。
      await expect(s.revoke(ROOT, "hello")).rejects.toMatchObject({ code: "internal" });
      release();
      await new Promise((r) => setTimeout(r, 100));
      await expect(stat(file)).rejects.toThrow(); // 書かれていない
      await expect(stat(lock())).rejects.toThrow(); // 裏が返った後に消える
      // もう一度は書ける。
      await s.decideApproved(ROOT, "hello", D("a"), entry());
      expect((await s.load()).lookup(ROOT, "hello", D("a")).status).toBe("approved");
    });
  });

  it("2 つの ApprovalStore（別の session のつもり）が同時に decide と revoke をしても、黙って失われない（片方が誤りで返るのはよい）", async () => {
    const seed = store();
    await seed.decideApproved(ROOT, "gone", D("g"), entry({ id: "gone" }));
    for (let round = 0; round < 5; round++) {
      const a = store({ timeoutMs: 2000 });
      const b = store({ timeoutMs: 2000 });
      const results = await Promise.allSettled([a.decideApproved(ROOT, `n${round}`, D(`n${round}`), entry({ id: `n${round}` })), b.revoke(ROOT, "gone")]);
      const set = await store().load();
      if (results[0].status === "fulfilled") expect(set.find(ROOT, `n${round}`), `round ${round}: 承認が失われた`).toBeDefined();
      if (results[1].status === "fulfilled") expect(set.find(ROOT, "gone"), `round ${round}: 取り消しが失われた`).toBeUndefined();
      if (results[1].status !== "fulfilled") await seed.revoke(ROOT, "gone").catch(() => undefined);
      await seed.decideApproved(ROOT, "gone", D("g"), entry({ id: "gone" })).catch(() => undefined);
    }
  });

  it("signature: 権限だけ・持ち主だけの変更（chmod）でも変わる（D13 の 4）", async () => {
    const s = store();
    await s.decideApproved(ROOT, "hello", D("a"), entry());
    const before = await s.signature();
    await new Promise((r) => setTimeout(r, 15)); // ctime が進む
    await chmod(file, 0o664);
    const after = await s.signature();
    expect(after).not.toBe(before);
    expect(after.split(":")).toHaveLength(6); // mtimeMs:size:ino:ctimeMs:mode:uid
    // 中身が同じ（mtime・size・ino が同じ）でも、mode が変われば署名が変わる。
    await chmod(file, 0o600);
    expect(await s.signature()).not.toBe(after);
  });

  it("signature: 無い → missing、書くと変わる", async () => {
    const s = store();
    expect(await s.signature()).toBe("missing");
    await s.decideApproved(ROOT, "hello", D("a"), entry());
    const sig1 = await s.signature();
    expect(sig1).not.toBe("missing");
    await s.decideDenied(ROOT, "hello", D("b"));
    expect(await s.signature()).not.toBe(sig1);
  });
});
