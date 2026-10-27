import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { DesktopFolderCheckpointRequest, DesktopFileResult } from "@sodashitsu/protocol";
import { FileTransferInterrupted } from "../work/FileTransfer.js";
import type { CheckpointContext } from "./DesktopFileCheckpoints.js";
import { DesktopFolders } from "./DesktopFolders.js";
const TTL = 900000;
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
};
/** Purpose-bound volatile folder leases; every attach requires a fresh file grant. */
export class DesktopFolderCheckpoints {
  private jobs = new Map<string, Job>();
  private current(j: Job) {
    return this.jobs.get(j.token) === j && j.valid() && performance.now() < j.expires;
  }
  private drop(j: Job) {
    if (this.jobs.get(j.token) !== j) return;
    this.jobs.delete(j.token);
    j.owner = undefined;
    clearTimeout(j.timer);
    clearInterval(j.pulse);
    void j.folders.close().catch(() => {});
  }
  private touch(j: Job) {
    clearTimeout(j.timer);
    j.expires = performance.now() + TTL;
    j.timer = setTimeout(() => this.drop(j), TTL);
    j.timer.unref();
  }
  cancelStart(root: string, owner: string, id: string) {
    for (const j of [...this.jobs.values()])
      if (j.root === root && j.owner === owner && j.id === id) this.drop(j);
  }
  clear() {
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
  async run(ctx: CheckpointContext, p: DesktopFolderCheckpointRequest): Promise<Result> {
    let j = p.action === "folder_resume_start" ? undefined : this.jobs.get(p.checkpoint);
    if (p.action === "folder_resume_start") {
      if (this.jobs.size >= 8) throw Error("再開待ちフォルダは接続先全体で8件までです");
      const token = randomBytes(32).toString("hex");
      j = {
        token,
        id: p.request.id,
        root: ctx.root,
        owner: ctx.owner,
        valid: ctx.valid,
        folders: new DesktopFolders(ctx.root, true),
        queue: Promise.resolve(),
        expires: performance.now() + TTL,
        timer: undefined as any,
        pulse: undefined as any,
      };
      const job = j;
      this.jobs.set(token, j);
      this.touch(j);
      j.pulse = setInterval(() => {
        void job.queue
          .then(async () => {
            if (!this.current(job)) {
              this.drop(job);
              return;
            }
            await job.folders.keepAlive();
          })
          .catch(() => this.drop(job));
      }, 20000);
      j.pulse.unref();
    }
    if (!j || !this.current(j) || j.root !== ctx.root)
      throw Error("フォルダの再開記録が失効したか共有フォルダが変わりました");
    const job = j;
    if (job.owner !== ctx.owner && (p.action !== "folder_resume_attach" || job.owner !== undefined))
      throw Error("このフォルダ転送は別の接続で利用中です");
    const operation = job.queue.then(async () => {
      if (p.action === "folder_resume_attach") {
        if (!this.current(job) || (job.owner !== undefined && job.owner !== ctx.owner))
          throw Error("このフォルダ転送は別の接続で利用中です");
        await ctx.guard();
        if (!this.current(job) || (job.owner !== undefined && job.owner !== ctx.owner))
          throw Error("再開記録が失効しました");
        job.owner = ctx.owner;
      }
      const fence = () => {
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
        await guard();
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
          const request = p.request;
          if (request.id !== job.id) throw Error("フォルダ転送IDが一致しません");
          result = await job.folders.run(request, guard, fence);
        }
        await guard();
        this.touch(job);
        return { ...result, checkpoint: job.token, expiresInMs: TTL };
      } catch (e) {
        if (!(e instanceof FileTransferInterrupted)) this.drop(job);
        throw e;
      }
    });
    job.queue = operation.catch(() => {});
    return operation;
  }
}
