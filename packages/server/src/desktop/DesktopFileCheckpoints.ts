import { performance } from "node:perf_hooks";
import { randomBytes, randomUUID } from "node:crypto";
import type {
  DesktopCheckpointRequest,
  DesktopFileResult,
  WorkFileResult,
} from "@sodashitsu/protocol";
import { FileTransfer, FileTransferInterrupted } from "../work/FileTransfer.js";
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
  receipt?: WorkFileResult;
  valid(): boolean;
  expires: number;
  queue: Promise<unknown>;
  timer: ReturnType<typeof setTimeout>;
};
export const DESKTOP_CHECKPOINT_TTL = 900000;
/** Volatile B checkpoints; never a replacement for a new share's file grant. */
export class DesktopFileCheckpoints {
  private jobs = new Map<string, Job>();
  private pulse: ReturnType<typeof setInterval> | undefined;
  private keepAlive() {
    if (this.pulse) return;
    this.pulse = setInterval(() => {
      for (const j of this.jobs.values())
        if (j.id)
          void this.enqueue(j, async () => {
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
    void j.queue.then(() => j.transfer.close()).catch(() => {});
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
    for (const j of [...this.jobs.values()]) this.drop(j);
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
      if (p.action === "checkpoint_attach" || p.action === "checkpoint_abort") {
        if (!this.current(job) || (job.owner !== undefined && job.owner !== ctx.owner))
          throw Error("この転送は別の接続で利用中です");
        await ctx.guard();
        job.owner = ctx.owner;
      }
      const fence = () => {
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
          return this.result(job, { data: r.data!, done: r.done! });
        } else if (p.action === "checkpoint_finish") {
          if (!job.upload) throw Error("書き込み転送ではありません");
          if (!job.receipt) {
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
        return this.result(job, {
          ...(job.receipt
            ? { destination: job.receipt.destination!, done: true }
            : !job.upload && job.offset === job.bytes
              ? { done: true }
              : {}),
        });
      } catch (e) {
        if (!(e instanceof FileTransferInterrupted)) this.drop(job);
        throw e;
      }
    });
  }
}
