import { performance } from "node:perf_hooks";
import { randomBytes, randomUUID } from "node:crypto";
import type {
  DesktopCheckpointRequest,
  DesktopFileResult,
  WorkFileResult,
} from "@sodashitsu/protocol";
import { z } from "zod";
import { folderIdentity } from "../work/files.js";
import { DesktopTransferStore } from "./DesktopTransferStore.js";
import {
  FileTransferSourceSnapshot,
  FileTransferSnapshot,
  FileTransfer,
  FileTransferInterrupted,
} from "../work/FileTransfer.js";
const Saved = z
  .object({
    version: z.literal(1),
    root: z.string().min(1).max(4096),
    rootIdentity: z.string().regex(/^[a-f0-9]{64}$/),
    path: z.string().min(1).max(4096),
    upload: z.boolean(),
    bytes: z.number().int().min(0).max(104857600),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    offset: z.number().int().min(0).max(104857600),
    snapshot: FileTransferSnapshot.optional(),
    source: FileTransferSourceSnapshot.optional(),
    committing: z.boolean(),
    receipt: z
      .object({
        destination: z.string().min(1).max(4096),
        bytes: z.number().int().min(0).max(104857600),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .optional(),
    updatedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().nonnegative(),
  })
  .strict()
  .refine(
    (v) =>
      v.offset <= v.bytes &&
      v.expiresAt > v.updatedAt &&
      v.expiresAt - v.updatedAt <= 900000 &&
      (v.upload ? !!v.snapshot : !!v.source) &&
      (!v.committing || (v.upload && v.snapshot?.offset === v.bytes)),
  );
type Result = NonNullable<DesktopFileResult["result"]>;
export interface CheckpointContext {
  owner: string;
  root: string;
  connected(): boolean;
  valid(): boolean;
  guard(): Promise<void>;
  fence(): void;
}
type Job = {
  token: string;
  owner: string | undefined;
  root: string;
  path: string;
  upload: boolean;
  bytes: number;
  sha256: string;
  transfer: FileTransfer;
  streamOwner: string;
  id?: string | undefined;
  offset: number;
  receipt?: WorkFileResult | undefined;
  valid(): boolean;
  expires: number;
  queue: Promise<unknown>;
  timer: ReturnType<typeof setTimeout>;
  rootIdentity?: string;
  snapshot?: FileTransferSnapshot | undefined;
  source?: FileTransferSourceSnapshot | undefined;
  committing?: boolean;
  restored?: boolean;
  updatedAt?: number;
  expiresAt?: number;
};
export const DESKTOP_CHECKPOINT_TTL = 900000;
/** Continuation data only; never a replacement for a new share file grant. */
export class DesktopFileCheckpoints {
  constructor(private store?: DesktopTransferStore) {}
  private epoch = 0;
  private loaded = false;
  private loading: Promise<void> | undefined;
  private loads = new Set<Promise<void>>();
  private generation: string | undefined;
  private frozen = false;
  private freezeVersion = 0;
  private suspending: Promise<void> | undefined;
  private resuming: Promise<void> | undefined;
  private cleanup: Promise<unknown> = Promise.resolve();
  private async ensure(ctx: CheckpointContext) {
    if (this.resuming) await this.resuming;
    if (this.frozen) throw Error("転送記録を引き継ぎ中です");
    if (!this.store || this.loaded) return;
    const epoch = this.epoch;
    this.loading ??= (async () => {
      const generation = await this.store!.generation();
      if (this.frozen || epoch !== this.epoch) throw Error("転送記録を引き継ぎ中です");
      const records = await this.store!.list(true),
        now = Date.now(),
        adopt: Job[] = [];
      if (this.frozen || epoch !== this.epoch) throw Error("転送記録を引き継ぎ中です");
      for (const record of records) {
        const saved = Saved.parse(record.value);
        if (now < saved.updatedAt) throw Error("保存された転送記録の時刻が不正です");
        if (now >= saved.expiresAt || record.generation !== generation) {
          if (saved.snapshot)
            await FileTransfer.discard(saved.root, saved.snapshot).catch(() => {});
          await this.store!.remove(record.token);
          continue;
        }
        const j: Job = {
          ...saved,
          token: record.token,
          owner: undefined,
          transfer: new FileTransfer(true),
          streamOwner: randomUUID(),
          valid: ctx.valid,
          expires: performance.now() + saved.expiresAt - now,
          queue: Promise.resolve(),
          timer: undefined as any,
          restored: true,
        };
        adopt.push(j);
      }
      if (epoch !== this.epoch || this.frozen || !ctx.valid())
        throw Error("転送記録の設定が更新されました");
      this.generation = generation;
      for (const j of adopt) {
        j.timer = setTimeout(() => this.drop(j), Math.max(1, j.expires - performance.now()));
        j.timer.unref();
        this.jobs.set(j.token, j);
      }
      this.loaded = true;
      this.keepAlive();
    })();
    const loading = this.loading;
    this.loads.add(loading);
    void loading.finally(() => this.loads.delete(loading)).catch(() => {});
    await loading;
    if (this.frozen || epoch !== this.epoch) throw Error("転送記録を引き継ぎ中です");
  }
  private async persist(j: Job) {
    if (!this.store) return;
    if (!this.current(j) || !this.generation) throw Error("再開記録が失効しました");
    if (j.upload && j.id && !j.receipt)
      j.snapshot = await j.transfer.checkpoint(j.streamOwner, j.root, j.id);
    j.rootIdentity ??= await folderIdentity(j.root);
    const value = Saved.parse({
      version: 1,
      root: j.root,
      rootIdentity: j.rootIdentity,
      path: j.path,
      upload: j.upload,
      bytes: j.bytes,
      sha256: j.sha256,
      offset: j.offset,
      snapshot: j.snapshot,
      source: j.source,
      committing: j.committing === true,
      receipt: j.receipt,
      updatedAt: j.updatedAt,
      expiresAt: j.expiresAt,
    });
    await this.store.put(j.token, this.generation, value, () => this.current(j));
  }
  async confirmCancel(root: string, owner: string, token: string, valid: () => boolean) {
    await this.ensure({
      root,
      owner,
      valid,
      connected: () => true,
      guard: async () => {},
      fence: () => {},
    });
    if (!this.cancel(root, owner, token)) throw Error("別の接続で利用中です");
    await this.settled();
  }
  async settled() {
    await Promise.allSettled([...this.loads]);
    const results = await Promise.allSettled([this.cleanup, this.store?.settled()]);
    for (const result of results) if (result.status === "rejected") throw result.reason;
  }
  async invalidate() {
    this.clear();
    await this.store?.invalidate();
    if (this.store) {
      const generation = await this.store.generation();
      for (const record of await this.store.list(true)) {
        if (record.generation === generation) continue;
        const saved = Saved.parse(record.value);
        if (saved.snapshot) await FileTransfer.discard(saved.root, saved.snapshot).catch(() => {});
        await this.store.remove(record.token);
      }
    }
    this.loaded = false;
    this.loading = undefined;
    this.generation = undefined;
    await this.settled();
  }
  async bind(binding: string) {
    await this.store?.bind(binding);
  }
  freeze() {
    this.freezeVersion++;
    this.frozen = true;
    for (const j of this.jobs.values()) {
      j.owner = undefined;
      j.transfer.pauseExpiry();
    }
    clearInterval(this.pulse);
    this.pulse = undefined;
  }
  suspend() {
    this.freeze();
    return this.drain();
  }
  private drain(): Promise<void> {
    if (this.suspending) return this.suspending;
    const work = (async () => {
      await Promise.allSettled([...this.loads]);
      if (!this.store) {
        this.clear();
        return;
      }
      const results = await Promise.allSettled(
        [...this.jobs.values()].map(async (j) => {
          await j.queue;
          if (this.jobs.get(j.token) !== j) return;
          try {
            await j.transfer.suspend();
          } finally {
            clearTimeout(j.timer);
            this.jobs.delete(j.token);
          }
        }),
      );
      const settled = await Promise.allSettled([this.settled()]);
      this.epoch++;
      this.loaded = false;
      this.loading = undefined;
      this.generation = undefined;
      const failed = [...results, ...settled].filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      if (failed.length)
        throw new AggregateError(
          failed.map((r) => r.reason),
          "Saved transfer shutdown failed",
        );
    })();
    this.suspending = work;
    void work
      .finally(() => {
        if (this.suspending === work) this.suspending = undefined;
      })
      .catch(() => {});
    return work;
  }
  resume() {
    if (!this.frozen) return;
    const version = this.freezeVersion,
      work = this.drain().then(() => {
        if (version === this.freezeVersion) this.frozen = false;
      });
    this.resuming = work;
    void work
      .then(() => {
        if (this.resuming === work) this.resuming = undefined;
      })
      .catch(() => {});
  }
  private jobs = new Map<string, Job>();
  private pulse: ReturnType<typeof setInterval> | undefined;
  private keepAlive() {
    if (this.pulse) return;
    this.pulse = setInterval(() => {
      for (const j of this.jobs.values())
        if (j.id)
          void this.enqueue(j, async () => {
            if (this.frozen) return;
            if (!this.current(j)) {
              this.drop(j);
              return;
            }
            if (!j.id) return;
            try {
              await j.transfer.run(j.streamOwner, j.root, { action: "status", id: j.id! });
            } catch {
              this.drop(j);
            }
          }).catch(() => {});
    }, 20000);
    this.pulse.unref();
  }
  private current(j: Job) {
    return this.jobs.get(j.token) === j && j.valid() && performance.now() < j.expires;
  }
  private enqueue<T>(j: Job, fn: () => Promise<T>): Promise<T> {
    const p = j.queue.then(fn);
    j.queue = p.catch(() => {});
    return p;
  }
  private touch(j: Job) {
    clearTimeout(j.timer);
    j.expires = performance.now() + DESKTOP_CHECKPOINT_TTL;
    j.updatedAt = Date.now();
    j.expiresAt = j.updatedAt + DESKTOP_CHECKPOINT_TTL;
    j.timer = setTimeout(() => this.drop(j), DESKTOP_CHECKPOINT_TTL);
    j.timer.unref();
  }
  private drop(j: Job) {
    if (this.jobs.get(j.token) !== j) return;
    this.jobs.delete(j.token);
    if (!this.jobs.size) {
      clearInterval(this.pulse);
      this.pulse = undefined;
    }
    clearTimeout(j.timer);
    j.owner = undefined;
    const work = j.queue.then(async () => {
      await j.transfer.close();
      if (j.snapshot) await FileTransfer.discard(j.root, j.snapshot).catch(() => {});
      await this.store?.remove(j.token);
    });
    this.cleanup = Promise.allSettled([this.cleanup, work]).then((results) => {
      for (const r of results) if (r.status === "rejected") throw r.reason;
    });
    this.cleanup.catch(() => {});
  }
  /** Called synchronously when cancellation is received, before queued IO. */
  cancel(root: string, owner: string, token: string): boolean {
    const job = this.jobs.get(token);
    if (!job) return true; // Idempotent cancellation of an expired/completed lease.
    if (!this.current(job)) {
      this.drop(job);
      return true;
    }
    if (job.root !== root || (job.owner !== undefined && job.owner !== owner)) return false;
    this.drop(job);
    return true;
  }
  clear() {
    this.epoch++;
    for (const j of [...this.jobs.values()]) this.drop(j);
    this.loaded = false;
    this.loading = undefined;
    this.generation = undefined;
  }
  dispose() {
    this.clear();
    clearInterval(this.pulse);
  }
  detach(owner: string) {
    for (const j of this.jobs.values()) if (j.owner === owner) j.owner = undefined;
  }
  revoke(owner: string) {
    for (const j of [...this.jobs.values()]) if (j.owner === owner) this.drop(j);
  }
  private result(j: Job, extra: Result = {}): Result {
    return {
      checkpoint: j.token,
      bytes: j.bytes,
      offset: j.offset,
      sha256: j.sha256,
      expiresInMs: DESKTOP_CHECKPOINT_TTL,
      ...extra,
    };
  }
  async run(ctx: CheckpointContext, p: DesktopCheckpointRequest): Promise<Result> {
    const epoch = this.epoch;
    await this.ensure(ctx);
    if (this.frozen || epoch !== this.epoch) throw Error("転送記録を引き継ぎ中です");
    const start = p.action === "checkpoint_upload" || p.action === "checkpoint_download";
    let j: Job | undefined = start ? undefined : this.jobs.get(p.checkpoint);
    if (start) {
      if (this.jobs.size >= 8) throw Error("再開待ちの転送は接続先全体で8件までです");
      const token = randomBytes(32).toString("hex");
      j = {
        token,
        owner: ctx.owner,
        root: ctx.root,
        path: p.path,
        upload: p.action === "checkpoint_upload",
        bytes: p.action === "checkpoint_upload" ? p.bytes : 0,
        sha256: p.action === "checkpoint_upload" ? p.sha256 : "",
        transfer: new FileTransfer(true),
        streamOwner: randomUUID(),
        offset: 0,
        valid: ctx.valid,
        expires: performance.now() + DESKTOP_CHECKPOINT_TTL,
        queue: Promise.resolve(),
        timer: undefined as unknown as ReturnType<typeof setTimeout>,
      };
      this.jobs.set(token, j);
      this.keepAlive();
      this.touch(j);
    }
    if (!j || !this.current(j) || j.root !== ctx.root)
      throw Error("再開記録が失効したか、共有フォルダが変わりました");
    const job = j;
    if (
      job.owner !== ctx.owner &&
      (!["checkpoint_attach", "checkpoint_abort"].includes(p.action) || job.owner !== undefined)
    )
      throw Error("この転送は別の接続で利用中です");
    return this.enqueue(job, async () => {
      if (this.frozen) throw new FileTransferInterrupted("転送記録を引き継ぎ中です");
      if (p.action === "checkpoint_attach" || p.action === "checkpoint_abort") {
        if (!this.current(job) || (job.owner !== undefined && job.owner !== ctx.owner))
          throw Error("この転送は別の接続で利用中です");
        await ctx.guard();
        if (!this.current(job) || (job.owner !== undefined && job.owner !== ctx.owner))
          throw Error("再開記録が失効しました");
        job.owner = ctx.owner;
      }
      const fence = () => {
        if (this.frozen) throw new FileTransferInterrupted("転送記録を引き継ぎ中です");
        if (!this.current(job)) throw Error("再開記録が失効しました");
        if (job.owner !== ctx.owner) throw new FileTransferInterrupted("転送の接続が終了しました");
        try {
          ctx.fence();
        } catch (e) {
          if (!ctx.connected() && this.current(job))
            throw new FileTransferInterrupted("転送は再接続後に再開できます");
          throw e;
        }
      };
      const guard = async () => {
        fence();
        try {
          await ctx.guard();
        } catch (e) {
          if (!ctx.connected() && this.current(job))
            throw new FileTransferInterrupted("転送は再接続後に再開できます");
          throw e;
        }
        fence();
      };
      try {
        await guard();
        if (p.action === "checkpoint_abort") {
          this.drop(job);
          return {};
        }
        if (
          this.store &&
          p.action === "checkpoint_attach" &&
          (await folderIdentity(job.root)) !== job.rootIdentity
        )
          throw Error("共有フォルダの実体が変更されました");
        if (p.action === "checkpoint_upload") {
          const r = await job.transfer.run(
            job.streamOwner,
            job.root,
            { action: "write_start", path: job.path, bytes: job.bytes },
            guard,
            false,
            fence,
          );
          job.id = r.id;
        } else if (
          p.action === "checkpoint_download" ||
          (p.action === "checkpoint_attach" && !job.upload)
        ) {
          // Verify the whole source, then reconstruct only the local prefix hash.
          // No prefix data is sent over the network on a resumed download.
          if (job.id)
            await job.transfer.run(job.streamOwner, job.root, { action: "abort", id: job.id });
          job.id = undefined;
          const first = await job.transfer.run(
            job.streamOwner,
            job.root,
            { action: "read_start", path: job.path },
            guard,
            false,
            fence,
          );
          job.id = first.id;
          if (this.store) {
            const source = await job.transfer.sourceSnapshot(job.streamOwner, job.root, job.id!);
            if (job.source && JSON.stringify(job.source) !== JSON.stringify(source))
              throw Error("取得元の実体が変更されたため再開できません");
            job.source = source;
          }
          let at = 0,
            hash = "";
          for (;;) {
            const r = await job.transfer.run(
              job.streamOwner,
              job.root,
              { action: "read", id: job.id!, offset: at },
              guard,
              false,
              fence,
            );
            at = r.offset!;
            if (r.done) {
              hash = r.sha256!;
              job.id = undefined;
              break;
            }
          }
          if (job.sha256 && job.sha256 !== hash)
            throw Error("転送元の内容が変更されたため再開できません");
          job.sha256 = hash;
          job.bytes = first.bytes!;
          const offset = p.action === "checkpoint_attach" ? p.offset : 0;
          if (offset > job.bytes || (offset !== job.bytes && offset % 65536 !== 0))
            throw Error("再開位置が不正です");
          const next = await job.transfer.run(
            job.streamOwner,
            job.root,
            { action: "read_start", path: job.path },
            guard,
            false,
            fence,
          );
          job.id = next.id;
          if (
            this.store &&
            JSON.stringify(
              await job.transfer.sourceSnapshot(job.streamOwner, job.root, job.id!),
            ) !== JSON.stringify(job.source)
          )
            throw Error("取得元の実体が変更されました");
          if (next.bytes !== job.bytes) throw Error("転送元が変更されました");
          job.offset = 0;
          while (job.offset < offset) {
            const r = await job.transfer.run(
              job.streamOwner,
              job.root,
              { action: "read", id: job.id!, offset: job.offset },
              guard,
              false,
              fence,
            );
            job.offset = r.offset!;
            if (r.done) {
              job.id = undefined;
              if (r.sha256 !== job.sha256) throw Error("転送元が変更されました");
            }
          }
          if (offset === job.bytes && job.bytes === 0) {
            await job.transfer.run(job.streamOwner, job.root, { action: "abort", id: job.id! });
            job.id = undefined;
          }
        } else if (p.action === "checkpoint_attach" && job.upload) {
          if (this.store && job.restored) {
            if ((await folderIdentity(job.root)) !== job.rootIdentity || !job.snapshot)
              throw Error("再開先の実体が変更されました");
            if (job.committing || job.receipt) {
              const receipt = await FileTransfer.published(
                job.root,
                job.snapshot,
                job.sha256,
                guard,
                fence,
              );
              if (receipt) job.receipt = receipt;
              else if (job.receipt) throw Error("保存済みファイルがありません");
            }
            if (!job.receipt) {
              const restored = await job.transfer.restore(
                job.streamOwner,
                job.root,
                job.snapshot,
                guard,
                fence,
              );
              job.id = restored.id;
              job.offset = restored.offset!;
            }
            job.restored = false;
          }
          if (!job.receipt) {
            const r = await job.transfer.run(
              job.streamOwner,
              job.root,
              { action: "status", id: job.id! },
              guard,
              false,
              fence,
            );
            job.offset = r.offset!;
            if (p.offset > job.offset) throw Error("保存済み位置と再開位置が一致しません");
          }
        } else if (p.action === "checkpoint_write") {
          if (!job.upload || job.receipt) throw Error("書き込み転送ではありません");
          const r = await job.transfer.run(
            job.streamOwner,
            job.root,
            { action: "write", id: job.id!, offset: p.offset, data: p.data },
            guard,
            false,
            fence,
          );
          job.offset = r.offset!;
        } else if (p.action === "checkpoint_read") {
          if (job.upload || !job.id) throw Error("読み取り転送ではありません");
          const r = await job.transfer.run(
            job.streamOwner,
            job.root,
            { action: "read", id: job.id, offset: p.offset },
            guard,
            false,
            fence,
          );
          job.offset = r.offset!;
          if (r.done) {
            job.id = undefined;
            if (r.sha256 !== job.sha256) throw Error("転送元が変更されました");
          }
          this.touch(job);
          await this.persist(job);
          await guard();
          return this.result(job, { data: r.data!, done: r.done! });
        } else if (p.action === "checkpoint_finish") {
          if (!job.upload) throw Error("書き込み転送ではありません");
          if (!job.receipt) {
            if (this.store) {
              if (job.offset !== job.bytes) throw Error("転送が完了していません");
              job.committing = true;
              await this.persist(job);
              await guard();
            }
            job.receipt = await job.transfer.run(
              job.streamOwner,
              job.root,
              { action: "finish", id: job.id!, sha256: job.sha256 },
              guard,
              false,
              fence,
            );
            job.id = undefined;
            job.offset = job.bytes;
          }
        }
        await guard();
        this.touch(job);
        await this.persist(job);
        await guard();
        return this.result(job, {
          ...(job.receipt
            ? { destination: job.receipt.destination!, done: true }
            : !job.upload && job.offset === job.bytes
              ? { done: true }
              : {}),
        });
      } catch (e) {
        if (this.frozen) throw new FileTransferInterrupted("転送記録を引き継ぎ中です");
        if (!(e instanceof FileTransferInterrupted)) this.drop(job);
        throw e;
      }
    });
  }
}
