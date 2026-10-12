import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Scheduler, type ExecutionResult } from "./Scheduler.js";
import type { ScheduleDraft } from "@sodashitsu/protocol";
let dir: string;
const instances: Scheduler[] = [];
afterEach(async () => {
  await Promise.all(instances.splice(0).map((s) => s.close()));
  if (dir) await rm(dir, { recursive: true, force: true });
});
const ok: ExecutionResult = { status: "succeeded", exitCode: 0, output: "ok" };
const draft = (at = Date.now()): ScheduleDraft => ({
  label: "test",
  enabled: true,
  trigger: { type: "once", at: new Date(at).toISOString() },
  action: { type: "command", workspaceId: "w1", command: "printf ok" },
  timeoutSeconds: 600,
});
async function make(
  execute: ConstructorParameters<typeof Scheduler>[1] = async () => ok,
  now = Date.now,
) {
  dir = await mkdtemp(join(tmpdir(), "soda-schedule-"));
  const s = new Scheduler(dir, execute, () => {}, now);
  instances.push(s);
  await s.load();
  return s;
}
it("claims a one-off only once, persists completion and does not replay after reload", async () => {
  const execute = vi.fn(async () => ok),
    s = await make(execute);
  const j = await s.save(undefined, draft());
  await s.tick();
  await vi.waitFor(() => expect(s.list().runs[0]?.status).toBe("succeeded"));
  await s.tick();
  expect(execute).toHaveBeenCalledTimes(1);
  expect(s.list().jobs[0]).toMatchObject({ enabled: false, nextRunAt: null });
  await s.close();
  const restored = new Scheduler(dir, execute, () => {});
  instances.push(restored);
  await restored.load();
  await restored.tick();
  expect(execute).toHaveBeenCalledTimes(1);
  expect(restored.list().runs[0]?.jobId).toBe(j.id);
});
it("skips missed repeats and advances past now while preserving next time on text edits", async () => {
  let now = Date.parse("2026-10-12T00:00:00Z");
  const s = await make(
      async () => ok,
      () => now,
    ),
    input = {
      ...draft(now),
      trigger: { type: "interval" as const, startAt: new Date(now).toISOString(), everyMinutes: 1 },
    };
  const job = await s.save(undefined, input);
  now += 185000;
  await s.tick();
  await vi.waitFor(() => expect(s.list().runs[0]?.status).toBe("succeeded"));
  expect(s.list().runs).toHaveLength(1);
  expect(s.list().jobs[0]?.nextRunAt).toBe("2026-10-12T00:04:00.000Z");
  const updated = await s.save(job.id, { ...input, label: "edited" });
  expect(updated.nextRunAt).toBe("2026-10-12T00:04:00.000Z");
});
it("prevents concurrent duplicate executions and interrupts on close", async () => {
  const s = await make(
    (_job, signal) =>
      new Promise((resolve) => signal.addEventListener("abort", () => resolve(ok), { once: true })),
  );
  const job = await s.save(undefined, draft());
  const results = await Promise.allSettled([s.run(job.id), s.run(job.id)]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  await s.close();
  expect(s.list().runs[0]?.status).toBe("interrupted");
});
it("does not launch an execution when close overlaps durable claim", async () => {
  const execute = vi.fn(async () => ok),
    s = await make(execute);
  const job = await s.save(undefined, draft());
  const internals = s as unknown as { persist: () => Promise<void> };
  const original = internals.persist.bind(s);
  let release!: () => void, started!: () => void;
  const entered = new Promise<void>((resolve) => (started = resolve));
  let first = true;
  internals.persist = async () => {
    if (first) {
      first = false;
      started();
      await new Promise<void>((resolve) => (release = resolve));
    }
    await original();
  };
  const run = s.run(job.id);
  await entered;
  const close = s.close();
  release();
  await Promise.all([run, close]);
  expect(execute).not.toHaveBeenCalled();
  expect(s.list().runs[0]?.status).toBe("interrupted");
});
it("marks a crashed running record interrupted rather than replaying its one-off", async () => {
  const s = await make();
  const job = await s.save(undefined, draft());
  await writeFile(
    join(dir, "schedules.json"),
    JSON.stringify({
      schema: 1,
      jobs: [{ ...job, enabled: false, nextRunAt: null }],
      runs: [
        {
          id: job.id,
          jobId: job.id,
          label: job.label,
          input: "test",
          actionType: "agent",
          startedAt: job.updatedAt,
          finishedAt: null,
          status: "running",
          output: "",
          exitCode: null,
        },
      ],
    }),
  );
  const execute = vi.fn(async () => ok),
    restored = new Scheduler(dir, execute, () => {});
  instances.push(restored);
  await restored.load();
  await restored.tick();
  expect(restored.list().runs[0]?.status).toBe("interrupted");
  expect(execute).not.toHaveBeenCalled();
});
it("retains history after removal, rejects invalid targets and disabled jobs do not auto-run", async () => {
  const execute = vi.fn(async () => ok),
    s = await make(execute);
  const job = await s.save(undefined, { ...draft(), enabled: false });
  await s.tick();
  expect(execute).not.toHaveBeenCalled();
  await s.run(job.id);
  await vi.waitFor(() => expect(s.list().runs[0]?.status).toBe("succeeded"));
  await s.remove(job.id);
  expect(s.list().jobs).toHaveLength(0);
  expect(s.list().runs).toHaveLength(1);
  const invalid = new Scheduler(dir, execute, () => {
    throw new Error("missing target");
  });
  instances.push(invalid);
  await expect(invalid.save(undefined, draft())).rejects.toThrow("missing target");
});
