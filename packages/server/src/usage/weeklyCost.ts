import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { lstatRegular, openVerified, readRange } from "../agent/safeFile.js";
/** Compatibility with Claude statusline caches: session costs bucketed by ISO date, Sunday–Saturday. */
export function weeklyCostFromCache(raw: unknown, now: number): number | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const sessions = (raw as { sessions?: unknown }).sessions;
  if (!sessions || typeof sessions !== "object" || Array.isArray(sessions)) return;
  const entries = Object.values(sessions);
  if (entries.length > 4096) return;
  const today = new Date(now),
    dates = new Set<string>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - today.getDay() + i);
    dates.add(d.toISOString().slice(0, 10));
  }
  let sum = 0,
    valid = 0;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const { date, cost } = entry as { date?: unknown; cost?: unknown };
    if (
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      typeof cost !== "number" ||
      !Number.isFinite(cost) ||
      cost < 0 ||
      cost > 1e9
    )
      continue;
    const parsed = new Date(date + "T00:00:00Z");
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) continue;
    valid++;
    if (dates.has(date)) sum += cost;
  }
  return (entries.length === 0 || valid > 0) && sum <= 1e12 ? sum : undefined;
}
export class WeeklyCostReader {
  private cache = new Map<
    string,
    { at: number; value: Promise<{ usd: number; asOf: number } | undefined> }
  >();
  read(root: string, now: number) {
    const cached = this.cache.get(root);
    if (cached && now - cached.at < 1000 && now >= cached.at) return cached.value;
    const value = this.load(root, now);
    this.cache.set(root, { at: now, value });
    if (this.cache.size > 16) this.cache.delete(this.cache.keys().next().value!);
    return value;
  }
  private async load(
    root: string,
    now: number,
  ): Promise<{ usd: number; asOf: number } | undefined> {
    try {
      const file = join(await realpath(root), "weekly-usage.json");
      if ((await lstatRegular(file)) !== "ok") return;
      const opened = await openVerified(file);
      if (!opened) return;
      try {
        if (opened.st.size > 1024 * 1024) return;
        const bytes = await readRange(opened.fd, 0, Math.min(opened.st.size + 1, 1024 * 1024 + 1));
        if (bytes.length > 1024 * 1024) return;
        const raw = JSON.parse(bytes.toString("utf8"));
        const usd = weeklyCostFromCache(raw, now);
        return usd === undefined ? undefined : { usd, asOf: opened.st.mtimeMs };
      } finally {
        await opened.fd.close();
      }
    } catch {
      return;
    }
  }
}
