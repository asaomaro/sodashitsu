import { describe, expect, it } from "vitest";
import { FILE_CHUNK_BYTES, FILE_MAX_BYTES } from "@sodashitsu/protocol";
import type { FileWriter } from "./FileStore.js";
import { FileUploads, type FileUploadsClock, type FileUploadsOptions } from "./FileUploads.js";

class FakeClock implements FileUploadsClock {
  t = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();
  private seq = 0;
  now(): number {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number): unknown {
    this.timers.set(++this.seq, { at: this.t + ms, fn });
    return this.seq;
  }
  clearTimeout(h: unknown): void {
    this.timers.delete(h as number);
  }
  advance(ms: number): void {
    this.t += ms;
    for (const [id, timer] of [...this.timers]) {
      if (timer.at <= this.t) {
        this.timers.delete(id);
        timer.fn();
      }
    }
  }
}

/** 偽の置き場所：書かれた中身と、終わり方（finish・abort）を覚える。 */
function fakeStore(opts: { failCreate?: boolean; failWrite?: boolean; writeGate?: Promise<void> } = {}) {
  const writers: { name: string; data: Buffer[]; state: "writing" | "finished" | "aborted" }[] = [];
  const store: FileUploadsOptions["store"] = {
    create: async (name) => {
      if (opts.failCreate) throw new Error("EACCES /secret/path");
      const w = { name, data: [] as Buffer[], state: "writing" as "writing" | "finished" | "aborted" };
      writers.push(w);
      const writer: FileWriter = {
        path: `/state/dropped-files/x/${name}`,
        write: async (d) => {
          await opts.writeGate;
          if (opts.failWrite) throw new Error("ENOSPC /secret/path");
          w.data.push(Buffer.from(d));
        },
        finish: async () => {
          w.state = "finished";
          return `/state/dropped-files/x/${name}`;
        },
        abort: async () => {
          w.state = "aborted";
        },
      };
      return writer;
    },
  };
  return { store, writers };
}

function setup(opts: Parameters<typeof fakeStore>[0] & { limits?: FileUploadsOptions["limits"]; panes?: Set<string> } = {}) {
  const clock = new FakeClock();
  const { store, writers } = fakeStore(opts);
  const panes = opts.panes ?? new Set(["p1"]);
  let n = 0;
  const uploads = new FileUploads({ store, paneExists: (id) => panes.has(id), clock, random: () => `u${++n}`, ...(opts.limits ? { limits: opts.limits } : {}) });
  return { uploads, writers, clock, panes };
}

const b64 = (s: string | Buffer): string => Buffer.from(s).toString("base64");

describe("FileUploads", () => {
  it("分けて受け取った中身を順に書き、commit で置いた先のパスを返す", async () => {
    const { uploads, writers } = setup();
    const { uploadId } = await uploads.begin("c1", { paneId: "p1", name: "a.txt", size: 11 });
    await uploads.chunk("c1", { uploadId, offset: 0, data: b64("hello ") });
    await uploads.chunk("c1", { uploadId, offset: 6, data: b64("world") });
    expect(await uploads.commit("c1", uploadId)).toEqual({ path: "/state/dropped-files/x/a.txt" });
    expect(Buffer.concat(writers[0]!.data).toString()).toBe("hello world");
    expect(writers[0]!.state).toBe("finished");
    expect(uploads.activeCount).toBe(0);
  });

  it("空のファイルは片を送らずに commit できる", async () => {
    const { uploads, writers } = setup();
    const { uploadId } = await uploads.begin("c1", { paneId: "p1", name: "empty", size: 0 });
    await uploads.commit("c1", uploadId);
    expect(writers[0]!.state).toBe("finished");
  });

  it("大きすぎる・無い pane・同じ接続の 2 つ目・同時の上限は begin で断り、ファイルを作らない", async () => {
    const { uploads, writers } = setup({ limits: { maxActive: 2 }, panes: new Set(["p1"]) });
    await expect(uploads.begin("c1", { paneId: "p1", name: "a", size: FILE_MAX_BYTES + 1 })).rejects.toMatchObject({ code: "file_too_large" });
    await expect(uploads.begin("c1", { paneId: "p9", name: "a", size: 1 })).rejects.toMatchObject({ code: "not_found" });
    expect(writers).toHaveLength(0);
    await uploads.begin("c1", { paneId: "p1", name: "a", size: 1 });
    await expect(uploads.begin("c1", { paneId: "p1", name: "b", size: 1 })).rejects.toMatchObject({ code: "file_upload_busy" });
    await uploads.begin("c2", { paneId: "p1", name: "a", size: 1 });
    await expect(uploads.begin("c3", { paneId: "p1", name: "a", size: 1 })).rejects.toMatchObject({ code: "file_upload_busy" });
    expect(writers).toHaveLength(2);
  });

  it("食い違う片（位置・宣言より多い・大きすぎる）は送信ごと捨て、書きかけを消す", async () => {
    for (const bad of [
      { offset: 3, data: b64("x") },
      { offset: 0, data: b64("toolong") },
      { offset: 0, data: b64(Buffer.alloc(FILE_CHUNK_BYTES + 3)) },
    ]) {
      const { uploads, writers } = setup();
      const { uploadId } = await uploads.begin("c1", { paneId: "p1", name: "a", size: bad.data.length > 100 ? FILE_CHUNK_BYTES * 2 : 3 });
      await expect(uploads.chunk("c1", { uploadId, ...bad })).rejects.toMatchObject({ code: "invalid_file" });
      await uploads.dispose();
      expect(writers[0]!.state).toBe("aborted");
      await expect(uploads.commit("c1", uploadId)).rejects.toMatchObject({ code: "file_upload_expired" });
    }
  });

  it("足りないまま commit したら捨てる", async () => {
    const { uploads, writers } = setup();
    const { uploadId } = await uploads.begin("c1", { paneId: "p1", name: "a", size: 5 });
    await uploads.chunk("c1", { uploadId, offset: 0, data: b64("ab") });
    await expect(uploads.commit("c1", uploadId)).rejects.toMatchObject({ code: "invalid_file" });
    await uploads.dispose();
    expect(writers[0]!.state).toBe("aborted");
  });

  it("別の接続の id では触れない（知らない id と同じ答え）", async () => {
    const { uploads, writers } = setup();
    const { uploadId } = await uploads.begin("c1", { paneId: "p1", name: "a", size: 1 });
    await expect(uploads.chunk("c2", { uploadId, offset: 0, data: b64("x") })).rejects.toMatchObject({ code: "file_upload_expired" });
    await expect(uploads.commit("c2", uploadId)).rejects.toMatchObject({ code: "file_upload_expired" });
    uploads.cancel("c2", uploadId);
    expect(writers[0]!.state).toBe("writing");
  });

  it("続きが来なければ時間切れで捨てる。片が届くたびに待ち直すが、合計の期限は越えない", async () => {
    const { uploads, writers, clock } = setup({ limits: { idleMs: 100, maxTotalMs: 250 } });
    const { uploadId } = await uploads.begin("c1", { paneId: "p1", name: "a", size: 10 });
    clock.advance(90);
    await uploads.chunk("c1", { uploadId, offset: 0, data: b64("a") });
    clock.advance(90);
    await uploads.chunk("c1", { uploadId, offset: 1, data: b64("b") });
    clock.advance(69); // 249：まだ生きている（idle は 180 から 100 だが、合計の期限 250 で切る）
    expect(uploads.activeCount).toBe(1);
    clock.advance(1);
    expect(uploads.activeCount).toBe(0);
    await uploads.dispose();
    expect(writers[0]!.state).toBe("aborted");
  });

  it("切断・cancel で捨てる", async () => {
    const { uploads, writers } = setup();
    const a = await uploads.begin("c1", { paneId: "p1", name: "a", size: 1 });
    uploads.onClientGone("c1");
    const b = await uploads.begin("c2", { paneId: "p1", name: "b", size: 1 });
    uploads.cancel("c2", b.uploadId);
    await uploads.dispose();
    expect(writers.map((w) => w.state)).toEqual(["aborted", "aborted"]);
    await expect(uploads.commit("c1", a.uploadId)).rejects.toMatchObject({ code: "file_upload_expired" });
  });

  it("commit のときに pane が閉じていたら、置かずに捨てる", async () => {
    const { uploads, writers, panes } = setup();
    const { uploadId } = await uploads.begin("c1", { paneId: "p1", name: "a", size: 1 });
    await uploads.chunk("c1", { uploadId, offset: 0, data: b64("x") });
    panes.delete("p1");
    await expect(uploads.commit("c1", uploadId)).rejects.toMatchObject({ code: "not_found" });
    await uploads.dispose();
    expect(writers[0]!.state).toBe("aborted");
  });

  it("書けなかったら file_store_failed（詳細は返さない）で、送信を捨てる", async () => {
    const created = setup({ failCreate: true });
    const err = await created.uploads.begin("c1", { paneId: "p1", name: "a", size: 1 }).catch((e: unknown) => e as Error & { code: string });
    expect(err).toMatchObject({ code: "file_store_failed" });
    expect((err as Error).message).not.toContain("/secret/path");
    // begin が失敗した接続は、次の begin を始められる（枠を持ち続けない）。
    await expect(created.uploads.begin("c1", { paneId: "p1", name: "a", size: 1 })).rejects.toMatchObject({ code: "file_store_failed" });

    const { uploads, writers } = setup({ failWrite: true });
    const { uploadId } = await uploads.begin("c1", { paneId: "p1", name: "a", size: 1 });
    await expect(uploads.chunk("c1", { uploadId, offset: 0, data: b64("x") })).rejects.toMatchObject({ code: "file_store_failed" });
    await uploads.dispose();
    expect(writers[0]!.state).toBe("aborted");
  });

  it("書いている途中に重ねて届いた要求は、送信ごと捨てる（書き終わってから書きかけを消す）", async () => {
    let open!: () => void;
    const writeGate = new Promise<void>((r) => (open = r));
    const { uploads, writers } = setup({ writeGate });
    const { uploadId } = await uploads.begin("c1", { paneId: "p1", name: "a", size: 2 });
    const first = uploads.chunk("c1", { uploadId, offset: 0, data: b64("x") });
    await expect(uploads.chunk("c1", { uploadId, offset: 0, data: b64("y") })).rejects.toMatchObject({ code: "invalid_file" });
    expect(writers[0]!.state).toBe("writing"); // 書いている途中はまだ消さない
    open();
    await expect(first).rejects.toMatchObject({ code: "file_upload_expired" });
    await uploads.dispose();
    expect(writers[0]!.state).toBe("aborted");
  });

  it("ファイルを作っている間に切断した接続の送信は、登録せずに消す", async () => {
    const clock = new FakeClock();
    let created!: () => void;
    const gate = new Promise<void>((r) => (created = r));
    const { store, writers } = fakeStore();
    const uploads = new FileUploads({ store: { create: async (name) => (await gate, store.create(name)) }, paneExists: () => true, clock });
    const begun = uploads.begin("c1", { paneId: "p1", name: "a", size: 1 });
    uploads.onClientGone("c1");
    created();
    await expect(begun).rejects.toMatchObject({ code: "file_upload_expired" });
    expect(uploads.activeCount).toBe(0);
    expect(writers[0]!.state).toBe("aborted");
    // 同じ id の接続が後で始める分には影響しない。
    await expect(uploads.begin("c1", { paneId: "p1", name: "b", size: 1 })).resolves.toMatchObject({ uploadId: expect.any(String) });
  });

  it("dispose の後は begin を断り、受け取り中のものは消す", async () => {
    const { uploads, writers } = setup();
    await uploads.begin("c1", { paneId: "p1", name: "a", size: 1 });
    await uploads.dispose();
    expect(writers[0]!.state).toBe("aborted");
    await expect(uploads.begin("c2", { paneId: "p1", name: "a", size: 1 })).rejects.toMatchObject({ code: "file_upload_busy" });
  });
});
