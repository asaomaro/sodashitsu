import { IMAGE_CHUNK_BYTES, IMAGE_MAX_BYTES, RpcError, type ImageMimeType } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { ImageUploads, type ImageUploadLimits, type ImageUploadsClock } from "./ImageUploads.js";

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function png(size: number): Buffer {
  const b = Buffer.alloc(size, 7);
  Buffer.from(PNG_HEAD).copy(b, 0, 0, Math.min(size, PNG_HEAD.length));
  return b;
}

class FakeClock implements ImageUploadsClock {
  t = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();
  private seq = 0;
  now(): number {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number): unknown {
    const id = ++this.seq;
    this.timers.set(id, { at: this.t + ms, fn });
    return id;
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
  get pending(): number {
    return this.timers.size;
  }
}

function setup(
  opts: { panes?: Set<string>; limits?: Partial<ImageUploadLimits>; fail?: boolean } = {},
) {
  const panes = opts.panes ?? new Set(["p1"]);
  const saved: { mime: ImageMimeType; data: Buffer }[] = [];
  const clock = new FakeClock();
  let n = 0;
  const warnings: unknown[] = [];
  const uploads = new ImageUploads({
    store: {
      save: async (mime, data) => {
        if (opts.fail) throw new Error("EACCES /secret/path");
        saved.push({ mime, data: Buffer.from(data) });
        return `/state/clipboard-images/img-${saved.length}.png`;
      },
    },
    paneExists: (id) => panes.has(id),
    clock,
    random: () => `u${++n}`,
    ...(opts.limits ? { limits: opts.limits } : {}),
    logger: { warn: (...a: unknown[]) => void warnings.push(a) },
  });
  return { uploads, saved, clock, panes, warnings };
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return err instanceof RpcError ? err.code : `not rpc: ${String(err)}`;
  }
  return undefined;
}

async function asyncCodeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (err) {
    return err instanceof RpcError ? err.code : `not rpc: ${String(err)}`;
  }
  return undefined;
}

/** 分けて送って commit する（ブラウザと同じ手順）。 */
async function sendAll(
  u: ImageUploads,
  clientId: string,
  data: Buffer,
  mime: ImageMimeType = "image/png",
): Promise<string> {
  const { uploadId } = u.begin(clientId, { paneId: "p1", mime, size: data.length });
  for (let off = 0; off < data.length; off += IMAGE_CHUNK_BYTES) {
    u.chunk(clientId, {
      uploadId,
      offset: off,
      data: data.subarray(off, off + IMAGE_CHUNK_BYTES).toString("base64"),
    });
  }
  return (await u.commit(clientId, uploadId)).path;
}

describe("ImageUploads（20260927-clipboard-image-paste）", () => {
  it("分けて送ったバイト列をそのまま store に渡し、パスを返す（複数の片）", async () => {
    const { uploads, saved } = setup();
    const data = png(IMAGE_CHUNK_BYTES * 2 + 5);
    const path = await sendAll(uploads, "c1", data);
    expect(path).toBe("/state/clipboard-images/img-1.png");
    expect(saved).toHaveLength(1);
    expect(saved[0]!.mime).toBe("image/png");
    expect(saved[0]!.data.equals(data)).toBe(true);
    expect(uploads.activeCount).toBe(0);
  });

  it("16 MiB ちょうどは受け、超えたら image_too_large", () => {
    const { uploads } = setup();
    expect(
      codeOf(() =>
        uploads.begin("c1", { paneId: "p1", mime: "image/png", size: IMAGE_MAX_BYTES + 1 }),
      ),
    ).toBe("image_too_large");
    expect(
      codeOf(() => uploads.begin("c1", { paneId: "p1", mime: "image/png", size: IMAGE_MAX_BYTES })),
    ).toBeUndefined();
  });

  it("pane が無ければ begin も commit も not_found（ファイルを作らない）", async () => {
    const { uploads, saved, panes } = setup();
    expect(codeOf(() => uploads.begin("c1", { paneId: "nope", mime: "image/png", size: 10 }))).toBe(
      "not_found",
    );
    const data = png(10);
    const { uploadId } = uploads.begin("c1", { paneId: "p1", mime: "image/png", size: 10 });
    uploads.chunk("c1", { uploadId, offset: 0, data: data.toString("base64") });
    panes.delete("p1");
    expect(await asyncCodeOf(uploads.commit("c1", uploadId))).toBe("not_found");
    expect(saved).toHaveLength(0);
    expect(uploads.activeCount).toBe(0);
  });

  it("最初の片の先頭のバイトが宣言と違えば invalid_image で捨てる", () => {
    const { uploads } = setup();
    const { uploadId } = uploads.begin("c1", { paneId: "p1", mime: "image/jpeg", size: 10 });
    expect(
      codeOf(() => uploads.chunk("c1", { uploadId, offset: 0, data: png(10).toString("base64") })),
    ).toBe("invalid_image");
    expect(uploads.activeCount).toBe(0);
    expect(
      codeOf(() => uploads.chunk("c1", { uploadId, offset: 0, data: png(10).toString("base64") })),
    ).toBe("image_upload_expired");
  });

  it("offset が受け取り済みと違えば invalid_image（順序の違う片・重複）", () => {
    const { uploads } = setup();
    const data = png(20);
    const { uploadId } = uploads.begin("c1", { paneId: "p1", mime: "image/png", size: 20 });
    uploads.chunk("c1", { uploadId, offset: 0, data: data.subarray(0, 12).toString("base64") });
    expect(
      codeOf(() =>
        uploads.chunk("c1", { uploadId, offset: 0, data: data.subarray(12).toString("base64") }),
      ),
    ).toBe("invalid_image");
    expect(uploads.activeCount).toBe(0);
  });

  it("宣言より多いバイト・1 片の上限を超える片は invalid_image", () => {
    const { uploads } = setup();
    let { uploadId } = uploads.begin("c1", { paneId: "p1", mime: "image/png", size: 10 });
    expect(
      codeOf(() => uploads.chunk("c1", { uploadId, offset: 0, data: png(12).toString("base64") })),
    ).toBe("invalid_image");
    ({ uploadId } = uploads.begin("c1", {
      paneId: "p1",
      mime: "image/png",
      size: IMAGE_CHUNK_BYTES + 3,
    }));
    expect(
      codeOf(() =>
        uploads.chunk("c1", {
          uploadId,
          offset: 0,
          data: png(IMAGE_CHUNK_BYTES + 3).toString("base64"),
        }),
      ),
    ).toBe("invalid_image");
  });

  it("足りないまま commit したら invalid_image（ファイルを作らない）", async () => {
    const { uploads, saved } = setup();
    const { uploadId } = uploads.begin("c1", { paneId: "p1", mime: "image/png", size: 20 });
    uploads.chunk("c1", { uploadId, offset: 0, data: png(12).toString("base64") });
    expect(await asyncCodeOf(uploads.commit("c1", uploadId))).toBe("invalid_image");
    expect(saved).toHaveLength(0);
    expect(uploads.activeCount).toBe(0);
  });

  it("片を送らずに commit しても invalid_image（先頭のバイトの検査は commit でも行う）", async () => {
    const { uploads, saved } = setup();
    const { uploadId } = uploads.begin("c1", { paneId: "p1", mime: "image/png", size: 1 });
    expect(await asyncCodeOf(uploads.commit("c1", uploadId))).toBe("invalid_image");
    expect(saved).toHaveLength(0);
  });

  it("別の接続の uploadId・知らない id は image_upload_expired", async () => {
    const { uploads } = setup();
    const { uploadId } = uploads.begin("c1", { paneId: "p1", mime: "image/png", size: 10 });
    expect(
      codeOf(() => uploads.chunk("c2", { uploadId, offset: 0, data: png(10).toString("base64") })),
    ).toBe("image_upload_expired");
    expect(await asyncCodeOf(uploads.commit("c2", uploadId))).toBe("image_upload_expired");
    expect(
      codeOf(() =>
        uploads.chunk("c1", { uploadId: "other", offset: 0, data: png(10).toString("base64") }),
      ),
    ).toBe("image_upload_expired");
    expect(uploads.activeCount).toBe(1); // c1 の送信は他人の試みで壊れない
  });

  it("同じ接続は同時に 1 つ、全体では 4 つまで（image_upload_busy）", () => {
    const { uploads } = setup();
    uploads.begin("c1", { paneId: "p1", mime: "image/png", size: 10 });
    expect(codeOf(() => uploads.begin("c1", { paneId: "p1", mime: "image/png", size: 10 }))).toBe(
      "image_upload_busy",
    );
    for (const c of ["c2", "c3", "c4"])
      uploads.begin(c, { paneId: "p1", mime: "image/png", size: 10 });
    expect(codeOf(() => uploads.begin("c5", { paneId: "p1", mime: "image/png", size: 10 }))).toBe(
      "image_upload_busy",
    );
  });

  it("接続ごとに直近 60 秒で 20 回まで（区切りではなく直近の窓）", () => {
    const { uploads, clock } = setup({ limits: { perClientPerWindow: 2, globalPerWindow: 100 } });
    const begin = (): string | undefined =>
      codeOf(() => {
        const { uploadId } = uploads.begin("c1", { paneId: "p1", mime: "image/png", size: 10 });
        uploads.cancel("c1", uploadId);
      });
    expect(begin()).toBeUndefined(); // t=0
    clock.advance(40_000);
    expect(begin()).toBeUndefined(); // t=40s
    clock.advance(10_000);
    expect(begin()).toBe("image_upload_rate_limited"); // t=50s：直近 60 秒に 2 回
    clock.advance(10_001);
    expect(begin()).toBeUndefined(); // t=60.001s：t=0 の分が窓から出た
    expect(begin()).toBe("image_upload_rate_limited");
    // 別の接続は別に数える
    expect(
      codeOf(() => uploads.begin("c2", { paneId: "p1", mime: "image/png", size: 10 })),
    ).toBeUndefined();
  });

  it("サーバ全体でも直近 60 秒の回数に上限がある", () => {
    const { uploads } = setup({ limits: { perClientPerWindow: 100, globalPerWindow: 3 } });
    for (const c of ["c1", "c2", "c3"]) {
      const { uploadId } = uploads.begin(c, { paneId: "p1", mime: "image/png", size: 10 });
      uploads.cancel(c, uploadId);
    }
    expect(codeOf(() => uploads.begin("c4", { paneId: "p1", mime: "image/png", size: 10 }))).toBe(
      "image_upload_rate_limited",
    );
  });

  it("断った begin は回数に数えない", () => {
    const { uploads } = setup({ limits: { perClientPerWindow: 1 } });
    expect(codeOf(() => uploads.begin("c1", { paneId: "nope", mime: "image/png", size: 10 }))).toBe(
      "not_found",
    );
    expect(
      codeOf(() =>
        uploads.begin("c1", { paneId: "p1", mime: "image/png", size: IMAGE_MAX_BYTES + 1 }),
      ),
    ).toBe("image_too_large");
    expect(
      codeOf(() => uploads.begin("c1", { paneId: "p1", mime: "image/png", size: 10 })),
    ).toBeUndefined();
  });

  it("続きが 30 秒来なければ捨てる（片を受けるたびに測り直す）", () => {
    const { uploads, clock } = setup();
    const data = png(20);
    const { uploadId } = uploads.begin("c1", { paneId: "p1", mime: "image/png", size: 20 });
    clock.advance(29_000);
    uploads.chunk("c1", { uploadId, offset: 0, data: data.subarray(0, 12).toString("base64") });
    clock.advance(29_000);
    expect(uploads.activeCount).toBe(1);
    clock.advance(1_000);
    expect(uploads.activeCount).toBe(0);
    expect(
      codeOf(() =>
        uploads.chunk("c1", { uploadId, offset: 12, data: data.subarray(12).toString("base64") }),
      ),
    ).toBe("image_upload_expired");
  });

  it("小さな片を 30 秒未満ごとに送り続けても、begin から 5 分で捨てる（同時数の枠を占め続けさせない）", () => {
    const { uploads, clock } = setup();
    const data = png(IMAGE_MAX_BYTES);
    const { uploadId } = uploads.begin("c1", {
      paneId: "p1",
      mime: "image/png",
      size: data.length,
    });
    let offset = 0;
    const step = (n: number): void => {
      uploads.chunk("c1", {
        uploadId,
        offset,
        data: data.subarray(offset, offset + n).toString("base64"),
      });
      offset += n;
    };
    step(8); // 先頭の印
    for (let t = 0; t < 10; t++) {
      clock.advance(29_000);
      step(3);
    }
    expect(uploads.activeCount).toBe(1); // 290 秒
    clock.advance(10_000); // 300 秒
    expect(uploads.activeCount).toBe(0);
  });

  it("cancel・切断・dispose で捨て、時計も止める。cancel は知らない id でも投げない", () => {
    const { uploads, clock } = setup();
    const a = uploads.begin("c1", { paneId: "p1", mime: "image/png", size: 10 });
    uploads.cancel("c1", "other");
    expect(uploads.activeCount).toBe(1);
    uploads.cancel("c2", a.uploadId); // 別の接続からは消せない
    expect(uploads.activeCount).toBe(1);
    uploads.cancel("c1", a.uploadId);
    expect(uploads.activeCount).toBe(0);
    uploads.begin("c1", { paneId: "p1", mime: "image/png", size: 10 });
    uploads.begin("c2", { paneId: "p1", mime: "image/png", size: 10 });
    uploads.onClientGone("c1");
    expect(uploads.activeCount).toBe(1);
    uploads.dispose();
    expect(uploads.activeCount).toBe(0);
    expect(clock.pending).toBe(0);
  });

  it("store の失敗は image_store_failed（詳細はログにだけ）", async () => {
    const { uploads, warnings } = setup({ fail: true });
    const err = await sendAll(uploads, "c1", png(10)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RpcError);
    expect((err as RpcError).code).toBe("image_store_failed");
    expect((err as RpcError).message).not.toContain("/secret/path");
    expect(JSON.stringify(warnings)).toContain("/secret/path");
    expect(uploads.activeCount).toBe(0);
  });

  it("commit の後は同じ id を使えない（もう一度送れる）", async () => {
    const { uploads } = setup();
    const data = png(10);
    const { uploadId } = uploads.begin("c1", { paneId: "p1", mime: "image/png", size: 10 });
    uploads.chunk("c1", { uploadId, offset: 0, data: data.toString("base64") });
    await uploads.commit("c1", uploadId);
    expect(await asyncCodeOf(uploads.commit("c1", uploadId))).toBe("image_upload_expired");
    expect(await sendAll(uploads, "c1", data)).toBe("/state/clipboard-images/img-2.png");
  });
  it("保存を待っている間も同時数に数える。その間に同じ接続は次を始められ、切断・cancel で壊れない", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const clock = new FakeClock();
    let n = 0;
    const uploads = new ImageUploads({
      store: { save: async () => (await gate, "/p.png") },
      paneExists: () => true,
      clock,
      random: () => `u${++n}`,
      limits: { maxActive: 2 },
    });
    const data = png(10);
    const a = uploads.begin("c1", { paneId: "p1", mime: "image/png", size: 10 });
    uploads.chunk("c1", { uploadId: a.uploadId, offset: 0, data: data.toString("base64") });
    const committing = uploads.commit("c1", a.uploadId);
    expect(uploads.activeCount).toBe(0);
    expect(uploads.savingCount).toBe(1);
    const b = uploads.begin("c1", { paneId: "p1", mime: "image/png", size: 10 }); // 同じ接続の次（受け取り中 1 ＋ 保存中 1 ＝ 2）
    expect(codeOf(() => uploads.begin("c2", { paneId: "p1", mime: "image/png", size: 10 }))).toBe(
      "image_upload_busy",
    );
    uploads.cancel("c1", a.uploadId); // 保存中の id の cancel は何もしない（受け取り中の b は残る）
    expect(uploads.activeCount).toBe(1);
    uploads.onClientGone("c1"); // 切断で受け取り中の b は捨てるが、保存は続く
    expect(uploads.activeCount).toBe(0);
    release();
    await expect(committing).resolves.toEqual({ path: "/p.png" });
    expect(uploads.savingCount).toBe(0);
    expect(
      codeOf(() =>
        uploads.chunk("c1", { uploadId: b.uploadId, offset: 0, data: data.toString("base64") }),
      ),
    ).toBe("image_upload_expired");
  });

  it("dispose は以後の begin を断り、書いている途中の保存が終わるまで待つ", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let written = false;
    const uploads = new ImageUploads({
      store: { save: async () => (await gate, (written = true), "/p.png") },
      paneExists: () => true,
      clock: new FakeClock(),
    });
    const data = png(10);
    const { uploadId } = uploads.begin("c1", { paneId: "p1", mime: "image/png", size: 10 });
    uploads.chunk("c1", { uploadId, offset: 0, data: data.toString("base64") });
    const committing = uploads.commit("c1", uploadId);
    let disposed = false;
    const disposing = uploads.dispose().then(() => (disposed = true));
    await Promise.resolve();
    expect(disposed).toBe(false); // 保存を待っている
    expect(codeOf(() => uploads.begin("c2", { paneId: "p1", mime: "image/png", size: 10 }))).toBe(
      "image_upload_busy",
    );
    release();
    await disposing;
    expect(written).toBe(true);
    await expect(committing).resolves.toEqual({ path: "/p.png" });
  });
});
