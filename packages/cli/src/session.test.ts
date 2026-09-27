import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsSessionStore } from "./session.js";

let dir: string;
let filePath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sodactl-session-test-"));
  filePath = join(dir, "nested", "session.json"); // ディレクトリが無い状態から始める（mkdir の確認も兼ねる）
});

afterEach(() => {
  // vitest はプロセス終了時にまとめて掃除される tmp を使っているため、明示的な rm は必須ではない
  // （既存の他パッケージのテストも同様。`mkdtemp` の戻り値をそのまま使い捨てる）。
});

describe("FsSessionStore", () => {
  it("ファイルが無ければ get は undefined", async () => {
    const store = new FsSessionStore(filePath);
    expect(await store.get("http://127.0.0.1:7780")).toBeUndefined();
  });

  it("set した cookie を get で取り出せる", async () => {
    const store = new FsSessionStore(filePath);
    await store.set("http://127.0.0.1:7780", "soda_session=abc");
    expect(await store.get("http://127.0.0.1:7780")).toBe("soda_session=abc");
  });

  it("URL の path/query が違っても origin が同じなら同じキーとして扱う", async () => {
    const store = new FsSessionStore(filePath);
    await store.set("http://127.0.0.1:7780/some/path?x=1", "soda_session=abc");
    expect(await store.get("http://127.0.0.1:7780")).toBe("soda_session=abc");
  });

  it("host/port が違えば別のキー（別サーバのセッションを混同しない）", async () => {
    const store = new FsSessionStore(filePath);
    await store.set("http://127.0.0.1:7780", "soda_session=a");
    await store.set("http://127.0.0.1:7781", "soda_session=b");
    expect(await store.get("http://127.0.0.1:7780")).toBe("soda_session=a");
    expect(await store.get("http://127.0.0.1:7781")).toBe("soda_session=b");
  });

  it("clear するとその URL の cookie だけ消える", async () => {
    const store = new FsSessionStore(filePath);
    await store.set("http://127.0.0.1:7780", "soda_session=a");
    await store.set("http://127.0.0.1:7781", "soda_session=b");
    await store.clear("http://127.0.0.1:7780");
    expect(await store.get("http://127.0.0.1:7780")).toBeUndefined();
    expect(await store.get("http://127.0.0.1:7781")).toBe("soda_session=b");
  });

  it("存在しない URL の clear は何もしない（例外を投げない）", async () => {
    const store = new FsSessionStore(filePath);
    await expect(store.clear("http://127.0.0.1:7780")).resolves.toBeUndefined();
  });

  it.each([
    ["壊れた JSON", "not json at all"],
    ["JSON だが形が違う（配列）", "[1,2,3]"],
    ["sessions が無い", "{}"],
    ["sessions の値が壊れている", JSON.stringify({ sessions: { "http://h": { cookie: 123 } } })],
  ])("ファイルが壊れている（%s）場合は空として扱う", async (_label, raw) => {
    await mkdir(join(dir, "nested"), { recursive: true });
    await writeFile(filePath, raw, "utf8");
    const store = new FsSessionStore(filePath);
    expect(await store.get("http://127.0.0.1:7780")).toBeUndefined();
    // 壊れていても書き込みはできる（上書きされる）。
    await store.set("http://127.0.0.1:7780", "soda_session=fresh");
    expect(await store.get("http://127.0.0.1:7780")).toBe("soda_session=fresh");
  });

  it("ディレクトリを 0700・ファイルを 0600 で作る", async () => {
    const store = new FsSessionStore(filePath);
    await store.set("http://127.0.0.1:7780", "soda_session=a");
    const dirStat = await stat(join(dir, "nested"));
    const fileStat = await stat(filePath);
    expect(dirStat.mode & 0o777).toBe(0o700);
    expect(fileStat.mode & 0o777).toBe(0o600);
  });
});

describe("FsSessionStore — 並行する読み書き（20260926-load-flaky-tests）", () => {
  it("書き込みと並行した読み取りは、書き込みの前か後の内容を読む（ほかの接続先の cookie が消えて見えない。AC1）", async () => {
    const store = new FsSessionStore(filePath);
    await store.set("http://127.0.0.1:7780", "soda_session=keep");
    let writing = true;
    const writer = (async () => {
      try {
        for (let i = 0; i < 40; i++) await store.set("http://127.0.0.1:7781", `soda_session=w${i}`);
      } finally {
        writing = false;
      }
    })();
    const seen: (string | undefined)[] = [];
    // 別のインスタンス（別の `sodactl` と同じく、鎖の外から読む）で読み続ける。
    const reader = (async () => {
      const other = new FsSessionStore(filePath);
      while (writing) seen.push(await other.get("http://127.0.0.1:7780"));
    })();
    await Promise.all([writer, reader]);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.filter((c) => c !== "soda_session=keep")).toEqual([]);
  });

  it("同じプロセスで 2 つの接続先を同時に保存・削除しても、ほかの接続先は失われない（同じファイルを指す別のインスタンスでも。AC2）", async () => {
    const a = new FsSessionStore(filePath);
    const b = new FsSessionStore(filePath);
    await a.set("http://127.0.0.1:7782", "soda_session=c");
    await Promise.all([
      a.set("http://127.0.0.1:7780", "soda_session=a"),
      b.set("http://127.0.0.1:7781", "soda_session=b"),
      a.clear("http://127.0.0.1:7782"),
    ]);
    expect(await a.get("http://127.0.0.1:7780")).toBe("soda_session=a");
    expect(await a.get("http://127.0.0.1:7781")).toBe("soda_session=b");
    expect(await a.get("http://127.0.0.1:7782")).toBeUndefined();
  });

  it("保存が 1 度失敗しても、同じファイルへの次の保存は行われる（直列化の鎖が失敗で止まらない）", async () => {
    const store = new FsSessionStore(filePath);
    await mkdir(filePath, { recursive: true }); // 保存先がディレクトリ——置き換え（rename）が失敗する
    await expect(store.set("http://127.0.0.1:7780", "soda_session=a")).rejects.toThrow();
    await rm(filePath, { recursive: true });
    await store.set("http://127.0.0.1:7781", "soda_session=b");
    expect(await store.get("http://127.0.0.1:7781")).toBe("soda_session=b");
    expect(await readdir(join(dir, "nested"))).toEqual(["session.json"]); // 失敗した回の一時ファイルも残っていない
  });

  it("書き込みに使った一時ファイルを残さない", async () => {
    const store = new FsSessionStore(filePath);
    await Promise.all([
      store.set("http://127.0.0.1:7780", "soda_session=a"),
      store.set("http://127.0.0.1:7781", "soda_session=b"),
    ]);
    expect(await readdir(join(dir, "nested"))).toEqual(["session.json"]);
  });
});
