import { expect, it } from "vitest";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { weeklyCostFromCache, WeeklyCostReader } from "./weeklyCost.js";
it("sums all cached sessions for the same Sunday–Saturday week and rejects malformed costs", () => {
  const now = new Date(2026, 9, 15, 12).getTime();
  const key = (day: number) => new Date(2026, 9, day, 12).toISOString().slice(0, 10);
  const sessions = {
    a: { date: key(11), cost: 1 },
    b: { date: key(15), cost: 2 },
    c: { date: key(17), cost: 3 },
    old: { date: key(10), cost: 99 },
    next: { date: key(18), cost: 99 },
    invalid: { date: key(15), cost: -10 },
    string: { date: key(15), cost: "5" },
  };
  expect(weeklyCostFromCache({ sessions }, now)).toBe(6);
  expect(weeklyCostFromCache({ sessions: {} }, now)).toBe(0);
  expect(weeklyCostFromCache({ sessions: [] }, now)).toBeUndefined();
  expect(
    weeklyCostFromCache(
      { sessions: Object.fromEntries(Array.from({ length: 4097 }, (_, i) => [String(i), {}])) },
      now,
    ),
  ).toBeUndefined();
});
it("reads a bounded, ordinary cache, refreshes it and omits missing or linked data", async () => {
  const root = await mkdtemp(join(tmpdir(), "soda-week-cost-")),
    now = Date.now(),
    date = new Date(now).toISOString().slice(0, 10),
    reader = new WeeklyCostReader(),
    file = join(root, "weekly-usage.json");
  try {
    expect(await reader.read(root, now)).toBeUndefined();
    await writeFile(
      file,
      JSON.stringify({ sessions: { a: { date, cost: 10 }, b: { date, cost: 3 } } }),
    );
    expect(await reader.read(root, now + 1001)).toMatchObject({ usd: 13 });
    await writeFile(file, JSON.stringify({ sessions: { a: { date, cost: 20 } } }));
    expect(await reader.read(root, now + 2002)).toMatchObject({ usd: 20 });
    await rm(file);
    await writeFile(join(root, "other"), "{}");
    await symlink(join(root, "other"), file);
    expect(await reader.read(root, now + 3003)).toBeUndefined();
    await rm(file);
    await writeFile(file, " ".repeat(1024 * 1024 + 1));
    expect(await reader.read(root, now + 4004)).toBeUndefined();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
