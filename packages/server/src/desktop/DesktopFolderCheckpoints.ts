import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import type { DesktopFolderCheckpointRequest, DesktopFileResult } from "@sodashitsu/protocol";
import { FileTransferInterrupted } from "../work/FileTransfer.js";
import { folderIdentity } from "../work/files.js";
import type { CheckpointContext } from "./DesktopFileCheckpoints.js";
import { DesktopFolders } from "./DesktopFolders.js";
import { DesktopFolderSnapshot } from "./DesktopFolderSnapshot.js";
import { DesktopTransferStore } from "./DesktopTransferStore.js";
const TTL = 900000;
const Saved = z
  .object({
    version: z.literal(1),
    root: z.string().min(1).max(4096),
    rootIdentity: z.string().regex(/^[a-f0-9]{64}$/),
    snapshot: DesktopFolderSnapshot,
    updatedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().nonnegative(),
  })
  .strict()
  .refine(
    (s) =>
      s.rootIdentity === s.snapshot.approvedIdentity &&
      s.expiresAt > s.updatedAt &&
      s.expiresAt - s.updatedAt <= TTL,
  );
type Result = NonNullable<DesktopFileResult["result"]>;
type Job = {
  token: string;
  id: string;
  root: string;
  owner: string | undefined;
  valid: () => boolean;
  folders: DesktopFolders;
  queue: Promise<unknown>;
  expires: number;
  timer: ReturnType<typeof setTimeout>;
  pulse: ReturnType<typeof setInterval>;
  snapshot?: DesktopFolderSnapshot | undefined;
  updatedAt: number;
  expiresAt: number;
  restored?: boolean;
  authority?: { guard: () => Promise<void> } | undefined;
};
/** Explicit continuation data; no grant or live owner crosses a server generation. */
export class DesktopFolderCheckpoints {
  constructor(private store?: DesktopTransferStore) {}
  private jobs = new Map<string, Job>();
  private epoch = 0;
  private frozen = false;
  private freezeVersion = 0;
  private loaded = false;
  private loading: Promise<void> | undefined;
  private loads = new Set<Promise<void>>();
  private generation: string | undefined;
  private cleanup: Promise<unknown> = Promise.resolve();
  private suspending: Promise<void> | undefined;
  private resuming: Promise<void> | undefined;
  private current(j: Job) {
    return this.jobs.get(j.token) === j && j.valid() && performance.now() < j.expires;
  }
  private createFolders(j: Job) {
    return new DesktopFolders(
      j.root,
      true,
      this.store?.directory,
      this.store
        ? async (snapshot) => {
            const authority = j.authority;
            if (!authority) throw Error("フォルダの操作許可が終了しました");
            await authority.guard();
            await this.persist(j, snapshot);
            await authority.guard();
          }
        : undefined,
    );
  }
  private timers(j: Job) {
    j.timer = setTimeout(
      () => {
        if (!this.frozen) this.drop(j);
      },
      Math.max(1, j.expires - performance.now()),
    );
    j.timer.unref();
    j.pulse = setInterval(() => {
      void j.queue
        .then(async () => {
          if (this.frozen) return;
          if (!this.current(j)) {
            this.drop(j);
            return;
          }
          await j.folders.keepAlive();
        })
        .catch(() => {
          if (!this.frozen) this.drop(j);
        });
    }, 20000);
    j.pulse.unref();
  }
  private async ensure(ctx: CheckpointContext) {
    if (this.resuming) await this.resuming;
    if (this.frozen) throw Error("フォルダ記録を引き継ぎ中です");
    if (!this.store || this.loaded) return;
    const epoch = this.epoch;
    this.loading ??= (async () => {
      const generation = await this.store!.generation();
      if (this.frozen || epoch !== this.epoch) throw Error("フォルダ記録を引き継ぎ中です");
      const records = await this.store!.list(true),
        now = Date.now(),
        adopt: Job[] = [];
      if (this.frozen || epoch !== this.epoch) throw Error("フォルダ記録を引き継ぎ中です");
      for (const record of records) {
        const saved = Saved.parse(record.value);
        if (now < saved.updatedAt) throw Error("フォルダ記録の時刻が不正です");
        if (now >= saved.expiresAt || record.generation !== generation) {
          await DesktopFolders.discard(saved.root, saved.snapshot, this.store!.directory).catch(
            () => {},
          );
          await this.store!.remove(record.token);
          continue;
        }
        const j: Job = {
          ...saved,
          id: saved.snapshot.id,
          token: record.token,
          owner: undefined,
          valid: ctx.valid,
          folders: undefined as any,
          queue: Promise.resolve(),
          expires: performance.now() + saved.expiresAt - now,
          timer: undefined as any,
          pulse: undefined as any,
          restored: true,
        };
        j.folders = this.createFolders(j);
        adopt.push(j);
      }
      if (this.frozen || epoch !== this.epoch || !ctx.valid())
        throw Error("フォルダ記録の設定が更新されました");
      this.generation = generation;
      for (const j of adopt) {
        this.jobs.set(j.token, j);
        this.timers(j);
      }
      this.loaded = true;
    })();
    const loading = this.loading;
    this.loads.add(loading);
    void loading.finally(() => this.loads.delete(loading)).catch(() => {});
    await loading;
    if (this.frozen || epoch !== this.epoch) throw Error("フォルダ記録を引き継ぎ中です");
  }
  private async persist(j: Job, snapshot?: DesktopFolderSnapshot) {
    if (!this.store) return;
    if (this.frozen || !this.current(j) || !this.generation)
      throw Error("フォルダ記録が失効しました");
    j.snapshot = snapshot ?? (await j.folders.checkpoint(j.id));
    const value = Saved.parse({
      version: 1,
      root: j.root,
      rootIdentity: j.snapshot.approvedIdentity,
      snapshot: j.snapshot,
      updatedAt: j.updatedAt,
      expiresAt: j.expiresAt,
    });
    await this.store.put(j.token, this.generation, value, () => !this.frozen && this.current(j));
  }
  private drop(j: Job) {
    if (this.jobs.get(j.token) !== j) return;
    this.jobs.delete(j.token);
    j.owner = undefined;
    clearTimeout(j.timer);
    clearInterval(j.pulse);
    const work = j.queue.then(async () => {
      await j.folders.close();
      if (j.snapshot)
        await DesktopFolders.discard(j.root, j.snapshot, this.store?.directory).catch(() => {});
      await this.store?.remove(j.token);
    });
    this.cleanup = Promise.allSettled([this.cleanup, work]).then((results) => {
      for (const r of results) if (r.status === "rejected") throw r.reason;
    });
    this.cleanup.catch(() => {});
  }
  private touch(j: Job) {
    clearTimeout(j.timer);
    j.expires = performance.now() + TTL;
    j.updatedAt = Date.now();
    j.expiresAt = j.updatedAt + TTL;
    j.timer = setTimeout(() => {
      if (!this.frozen) this.drop(j);
    }, TTL);
    j.timer.unref();
  }
  cancelStart(root: string, owner: string, id: string) {
    for (const j of [...this.jobs.values()])
      if (j.root === root && j.owner === owner && j.id === id) this.drop(j);
  }
  clear() {
    this.epoch++;
    for (const j of [...this.jobs.values()]) this.drop(j);
  }
  detach(owner: string) {
    for (const j of this.jobs.values()) if (j.owner === owner) j.owner = undefined;
  }
  revoke(owner: string) {
    for (const j of [...this.jobs.values()]) if (j.owner === owner) this.drop(j);
  }
  cancel(root: string, owner: string, token: string) {
    const j = this.jobs.get(token);
    if (!j) return true;
    if (!this.current(j)) {
      this.drop(j);
      return true;
    }
    if (j.root !== root || (j.owner !== undefined && j.owner !== owner)) return false;
    this.drop(j);
    return true;
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
    for (const r of results) if (r.status === "rejected") throw r.reason;
  }
  async invalidate() {
    this.clear();
    await this.store?.invalidate();
    if (this.store) {
      const generation = await this.store.generation();
      for (const record of await this.store.list(true)) {
        if (record.generation === generation) continue;
        const saved = Saved.parse(record.value);
        await DesktopFolders.discard(saved.root, saved.snapshot, this.store.directory).catch(
          () => {},
        );
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
      j.folders.pauseExpiry();
      clearTimeout(j.timer);
      clearInterval(j.pulse);
    }
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
        await this.settled();
        return;
      }
      const results = await Promise.allSettled(
        [...this.jobs.values()].map(async (j) => {
          await j.queue;
          if (this.jobs.get(j.token) !== j) return;
          try {
            await j.folders.suspend();
          } finally {
            clearTimeout(j.timer);
            clearInterval(j.pulse);
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
          "Saved folder shutdown failed",
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
  async run(ctx: CheckpointContext, p: DesktopFolderCheckpointRequest): Promise<Result> {
    const epoch = this.epoch;
    await this.ensure(ctx);
    if (this.frozen || epoch !== this.epoch) throw Error("フォルダ記録を引き継ぎ中です");
    await ctx.guard();
    if (this.frozen || epoch !== this.epoch) throw Error("フォルダ記録を引き継ぎ中です");
    let j = p.action === "folder_resume_start" ? undefined : this.jobs.get(p.checkpoint);
    if (p.action === "folder_resume_start") {
      if (this.jobs.size >= 8) throw Error("再開待ちフォルダは接続先全体で8件までです");
      const now = Date.now();
      j = {
        token: randomBytes(32).toString("hex"),
        id: p.request.id,
        root: ctx.root,
        owner: ctx.owner,
        valid: ctx.valid,
        folders: undefined as any,
        queue: Promise.resolve(),
        expires: performance.now() + TTL,
        timer: undefined as any,
        pulse: undefined as any,
        updatedAt: now,
        expiresAt: now + TTL,
      };
      j.folders = this.createFolders(j);
      this.jobs.set(j.token, j);
      this.timers(j);
    }
    if (!j || !this.current(j) || j.root !== ctx.root)
      throw Error("フォルダの再開記録が失効したか共有フォルダが変わりました");
    const job = j;
    if (job.owner !== ctx.owner && (p.action !== "folder_resume_attach" || job.owner !== undefined))
      throw Error("このフォルダ転送は別の接続で利用中です");
    const operation = job.queue.then(async () => {
      const fence = () => {
        if (this.frozen) throw new FileTransferInterrupted("フォルダ記録を引き継ぎ中です");
        if (!this.current(job)) throw Error("再開記録が失効しました");
        if (job.owner !== ctx.owner)
          throw new FileTransferInterrupted("フォルダ転送の接続が終了しました");
        try {
          ctx.fence();
        } catch (e) {
          if (!ctx.connected()) throw new FileTransferInterrupted("再接続後に再開できます");
          throw e;
        }
      };
      const guard = async () => {
        fence();
        try {
          await ctx.guard();
        } catch (e) {
          if (!ctx.connected() && this.current(job))
            throw new FileTransferInterrupted("再接続後に再開できます");
          throw e;
        }
        fence();
      };
      try {
        if (p.action === "folder_resume_attach") {
          if (this.frozen) throw new FileTransferInterrupted("フォルダ記録を引き継ぎ中です");
          await ctx.guard();
          if (!this.current(job) || (job.owner !== undefined && job.owner !== ctx.owner))
            throw Error("再開記録が失効しました");
          job.owner = ctx.owner;
        }
        job.authority = { guard };
        await guard();
        if (job.restored) {
          if (!job.snapshot || (await folderIdentity(ctx.root)) !== job.snapshot.approvedIdentity)
            throw Error("共有フォルダの実体が変更されました");
          await job.folders.restore(job.snapshot, guard, fence);
          job.restored = false;
        }
        let result: Result;
        if (p.action === "folder_resume_abort") {
          this.drop(job);
          return {};
        }
        if (p.action === "folder_resume_attach") {
          result = await job.folders.inspect(job.id);
          if (!result.folderFiles) {
            await job.folders.seek(job.id, p.offset);
            result = { ...result, offset: p.offset };
          }
        } else {
          if (p.request.id !== job.id) throw Error("フォルダ転送IDが一致しません");
          result = await job.folders.run(p.request, guard, fence);
        }
        await guard();
        this.touch(job);
        await this.persist(job);
        await guard();
        return { ...result, checkpoint: job.token, expiresInMs: TTL };
      } catch (e) {
        if (this.frozen) throw new FileTransferInterrupted("フォルダ記録を引き継ぎ中です");
        if (!(e instanceof FileTransferInterrupted)) this.drop(job);
        throw e;
      } finally {
        job.authority = undefined;
      }
    });
    job.queue = operation.catch(() => {});
    return operation;
  }
}
