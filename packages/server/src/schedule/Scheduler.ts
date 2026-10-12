import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  ScheduleDraft,
  ScheduledJob,
  ScheduledRun,
  RpcError,
  type ScheduleListResult,
} from "@sodashitsu/protocol";
import { z } from "zod";
import { readFileWithBackup, writeFileAtomic } from "../persist/atomicFile.js";
const State = z.object({
  schema: z.literal(1),
  jobs: z.array(ScheduledJob).max(128),
  runs: z.array(ScheduledRun).max(500),
});
export interface ExecutionResult {
  output: string;
  exitCode: number | null;
  status: "sent" | "succeeded" | "failed";
}
export class Scheduler {
  private jobs: ScheduledJob[] = [];
  private runs: ScheduledRun[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private active = new Map<string, { abort: AbortController; promise: Promise<void> }>();
  private preparing = new Set<Promise<ScheduledRun | null>>();
  private file: string;
  constructor(
    stateDir: string,
    private execute: (job: ScheduledJob, signal: AbortSignal) => Promise<ExecutionResult>,
    private validate: (draft: ScheduleDraft) => void,
    private now: () => number = Date.now,
  ) {
    this.file = join(stateDir, "schedules.json");
  }
  private iso() {
    return new Date(this.now()).toISOString();
  }
  async load() {
    const r = await readFileWithBackup(this.file, join(this.file + "-backups"), (raw) =>
      State.parse(JSON.parse(raw)),
    );
    if (r.kind === "ok") {
      this.jobs = r.data.jobs;
      this.runs = r.data.runs;
      for (const run of this.runs)
        if (run.status === "running") {
          run.status = "interrupted";
          run.finishedAt = this.iso();
          run.output += "\nサーバーの終了により中断されました。自動再実行しません。";
        }
      await this.persist();
    }
  }
  private async persist() {
    while (
      this.runs.length > 500 ||
      Buffer.byteLength(JSON.stringify({ jobs: this.jobs, runs: this.runs })) > 12 * 1024 * 1024
    ) {
      const index = this.runs.findIndex((r) => r.status !== "running");
      if (index < 0) break;
      this.runs.splice(index, 1);
    }
    await writeFileAtomic(
      this.file,
      JSON.stringify({ schema: 1, jobs: this.jobs, runs: this.runs }),
    );
  }
  private mutate<T>(fn: () => T): Promise<T> {
    const next = this.queue.then(async () => {
      const before = JSON.stringify({ jobs: this.jobs, runs: this.runs });
      try {
        const result = fn();
        await this.persist();
        return result;
      } catch (e) {
        const old = JSON.parse(before);
        this.jobs = old.jobs;
        this.runs = old.runs;
        throw e;
      }
    });
    this.queue = next.catch(() => {});
    return next;
  }
  list(): ScheduleListResult {
    return JSON.parse(JSON.stringify({ jobs: this.jobs, runs: [...this.runs].reverse() }));
  }
  private next(draft: ScheduleDraft, after?: number): string | null {
    if (draft.trigger.type === "once") return after === undefined ? draft.trigger.at : null;
    const start = Date.parse(draft.trigger.startAt),
      ms = draft.trigger.everyMinutes * 60000,
      at = after ?? this.now();
    return new Date(
      start > at
        ? start
        : start +
            (Math.floor((at - start) / ms) + (after === undefined && start === at ? 0 : 1)) * ms,
    ).toISOString();
  }
  async save(id: string | undefined, input: ScheduleDraft) {
    const draft = ScheduleDraft.parse(input);
    this.validate(draft);
    return this.mutate(() => {
      if (this.stopped) throw new RpcError("invalid_params", "サーバーを終了しています");
      const existing = id ? this.jobs.find((j) => j.id === id) : undefined;
      if (id && !existing) throw new RpcError("not_found", "予約が見つかりません");
      if (!existing && this.jobs.length >= 128)
        throw new RpcError("invalid_params", "予約は128件までです");
      const nextRunAt =
        existing &&
        JSON.stringify(existing.trigger) === JSON.stringify(draft.trigger) &&
        existing.enabled === draft.enabled
          ? existing.nextRunAt
          : draft.enabled
            ? this.next(draft)
            : null;
      const job = { ...draft, id: existing?.id ?? randomUUID(), nextRunAt, updatedAt: this.iso() };
      this.jobs = existing ? this.jobs.map((j) => (j.id === id ? job : j)) : [...this.jobs, job];
      return structuredClone(job);
    });
  }
  async remove(id: string) {
    return this.mutate(() => {
      if (!this.jobs.some((j) => j.id === id))
        throw new RpcError("not_found", "予約が見つかりません");
      this.jobs = this.jobs.filter((j) => j.id !== id);
    });
  }
  start() {
    if (this.timer) return;
    this.stopped = false;
    this.timer = setInterval(() => {
      void this.tick().catch(() => {});
    }, 1000);
    this.timer.unref?.();
    void this.tick().catch(() => {});
  }
  async tick() {
    if (this.stopped) return;
    const due = this.jobs.filter(
      (j) => j.enabled && j.nextRunAt && Date.parse(j.nextRunAt) <= this.now(),
    );
    for (const job of due)
      if (this.active.size < 4 && !this.active.has(job.id)) await this.run(job.id, false);
  }
  run(id: string, manual = true) {
    const pending = this.launch(id, manual);
    this.preparing.add(pending);
    void pending.finally(() => this.preparing.delete(pending)).catch(() => {});
    return pending;
  }
  private async launch(id: string, manual: boolean) {
    if (this.stopped) throw new RpcError("invalid_params", "サーバーを終了しています");
    let snapshot: ScheduledJob | undefined;
    const run = await this.mutate(() => {
      if (this.stopped) throw new RpcError("invalid_params", "サーバーを終了しています");
      const job = this.jobs.find((j) => j.id === id);
      if (!job) throw new RpcError("not_found", "予約が見つかりません");
      if (this.active.has(id) || this.runs.some((r) => r.jobId === id && r.status === "running"))
        throw new RpcError("invalid_params", "この予約は実行中です");
      if (this.runs.filter((r) => r.status === "running").length >= 4)
        throw new RpcError("invalid_params", "同時実行は4件までです");
      if (!manual && (!job.enabled || !job.nextRunAt || Date.parse(job.nextRunAt) > this.now()))
        return null;
      snapshot = structuredClone(job);
      if (!manual) {
        job.nextRunAt = this.next(job, this.now());
        if (job.trigger.type === "once") job.enabled = false;
        job.updatedAt = this.iso();
      }
      const result: ScheduledRun = {
        id: randomUUID(),
        jobId: id,
        label: job.label,
        input: job.action.type === "agent" ? job.action.text : job.action.command,
        actionType: job.action.type,
        startedAt: this.iso(),
        finishedAt: null,
        status: "running",
        output: "",
        exitCode: null,
      };
      this.runs.push(result);
      return structuredClone(result);
    });
    if (!run || !snapshot) return run;
    if (this.stopped) {
      await this.mutate(() => {
        const saved = this.runs.find((r) => r.id === run.id)!;
        saved.status = "interrupted";
        saved.finishedAt = this.iso();
        saved.output = "サーバーの終了により実行前に中断されました";
      });
      return run;
    }
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), snapshot.timeoutSeconds * 1000);
    timer.unref?.();
    const promise = (async () => {
      let result: ExecutionResult;
      try {
        let onAbort!: () => void;
        const cancelled = new Promise<ExecutionResult>((resolve) => {
          onAbort = () =>
            resolve({ status: "failed", exitCode: null, output: "実行を中断しました" });
          abort.signal.addEventListener("abort", onAbort, { once: true });
        });
        try {
          result = await Promise.race([this.execute(snapshot!, abort.signal), cancelled]);
        } finally {
          abort.signal.removeEventListener("abort", onAbort);
        }
      } catch (e) {
        result = {
          status: "failed",
          exitCode: null,
          output: e instanceof Error ? e.message : String(e),
        };
      } finally {
        clearTimeout(timer);
      }
      await this.mutate(() => {
        const saved = this.runs.find((r) => r.id === run.id);
        if (saved) {
          saved.status = abort.signal.aborted ? "interrupted" : result.status;
          saved.finishedAt = this.iso();
          saved.exitCode = result.exitCode;
          saved.output = result.output.slice(0, 8192);
        }
      }).finally(() => this.active.delete(id));
    })();
    this.active.set(id, { abort, promise });
    void promise.catch(() => {});
    return run;
  }
  async close() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await Promise.allSettled([...this.preparing]);
    for (const r of this.active.values()) r.abort.abort();
    await Promise.allSettled([...this.active.values()].map((r) => r.promise));
    await this.queue;
  }
}
