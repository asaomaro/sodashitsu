import { cpus, freemem, hostname, loadavg, totalmem, uptime } from "node:os";
import { readFileSync } from "node:fs";
import type { SystemResources } from "@sodashitsu/protocol";
export function cpuDelta(
  previous: ReturnType<typeof cpus>,
  current: ReturnType<typeof cpus>,
): number | null {
  if (!previous.length || previous.length !== current.length) return null;
  let idle = 0,
    total = 0;
  for (let i = 0; i < current.length; i++) {
    for (const key of ["user", "nice", "sys", "idle", "irq"] as const) {
      const delta = current[i]!.times[key] - previous[i]!.times[key];
      if (delta < 0) return null;
      total += delta;
      if (key === "idle") idle += delta;
    }
  }
  return total > 0 ? Math.max(0, Math.min(100, ((total - idle) / total) * 100)) : null;
}
function availableMemory(total: number) {
  if (process.platform === "linux") {
    try {
      const match = /^MemAvailable:\s+(\d+)\s+kB$/m.exec(readFileSync("/proc/meminfo", "utf8"));
      if (match) return Math.min(total, Number(match[1]) * 1024);
    } catch {
      /* other operating systems and unavailable procfs use os.freemem */
    }
  }
  return Math.min(total, freemem());
}
/** One sampler per server; callers share a one-second cache. No timer when unused. */
export class SystemResourceSampler {
  private previous: ReturnType<typeof cpus> = [];
  private cached: SystemResources | undefined;
  get(): SystemResources {
    const now = Date.now();
    if (this.cached && now - this.cached.sampledAt < 1000) return this.cached;
    const current = cpus(),
      total = totalmem();
    this.cached = {
      sampledAt: now,
      cpuPercent: cpuDelta(this.previous, current),
      cpuCount: current.length,
      memoryTotalBytes: total,
      memoryAvailableBytes: availableMemory(total),
      serverRssBytes: process.memoryUsage().rss,
      uptimeSeconds: uptime(),
      loadAverage: process.platform === "win32" ? null : loadavg(),
      hostname: hostname(),
    };
    this.previous = current;
    return this.cached;
  }
}
