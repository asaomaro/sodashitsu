import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ConnectionPort } from "../index.js";
import { SubagentHistoryReader, subagentHistoryMessage } from "./SubagentHistoryReader.js";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (n: number) => ({
  id: `child-${n}`,
  entryId: uuid(n),
  terminalStatus: "completed",
  description: `Generated ${n}`,
  hasTranscript: true,
});
const page = (items: unknown[], other: Record<string, unknown> = {}) => ({
  status: "ok",
  items,
  offset: items.length,
  revision: uuid(1000),
  reset: false,
  more: false,
  omittedBefore: false,
  incomplete: false,
  ...other,
});
let readers: SubagentHistoryReader[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const r of readers.splice(0)) r.dispose();
  vi.useRealTimers();
});
function fixture(reply: (params: unknown) => unknown | Promise<unknown>) {
  let scope: string | null = "parent-kind-ref-session-machine-client",
    active = true;
  const request = vi.fn(async (_method: string, params: unknown) => reply(params));
  const reader = new SubagentHistoryReader(
    { request } as unknown as Pick<ConnectionPort, "request">,
    "generated-parent",
    () => scope,
    vi.fn(),
    () => active,
  );
  readers.push(reader);
  return {
    reader,
    request,
    invalidate: () => {
      scope = "other-parent";
    },
    hide: () => {
      active = false;
    },
  };
}
it("only reads formal terminal rows, preserves unknown dates and strips unexpected fields", async () => {
  const f = fixture(() =>
    page([
      {
        ...row(1),
        privateBrain: "PRIVATE GENERATED",
        model: "reported-model",
        modelBasis: "turn",
        reasoningEffort: "low",
        reasoningEffortBasis: "turn",
      },
      { ...row(2), terminalStatus: "unknown" },
      { ...row(3), entryId: "invalid" },
    ]),
  );
  await f.reader.refresh();
  expect(f.reader.state.items).toHaveLength(1);
  expect(f.reader.state.items[0]).not.toHaveProperty("privateBrain");
  expect(f.reader.state.items[0]).not.toHaveProperty("startedAt");
  expect(f.reader.state.incomplete).toBe(true);
  expect(subagentHistoryMessage(f.reader.state)).toContain("一部は未取得");
  expect(f.request.mock.calls[0]?.[0]).toBe("agent.subagent_history");
});
it("preserves loaded pages on a stable revision and resets them on a new one", async () => {
  let changed = false;
  const f = fixture((p) => {
    const a = p as { offset: number };
    return changed
      ? page([row(99)], { reset: true, revision: uuid(2000) })
      : a.offset === 0
        ? page(
            Array.from({ length: 64 }, (_, i) => row(i + 1)),
            { offset: 64, more: true },
          )
        : page([row(65)], { offset: 65 });
  });
  await f.reader.refresh();
  await f.reader.more();
  expect(f.reader.state.items).toHaveLength(65);
  await f.reader.refresh();
  expect(f.reader.state.items).toHaveLength(65);
  expect(f.reader.state.offset).toBe(65);
  changed = true;
  await f.reader.refresh();
  expect(f.reader.state.items.map((r) => r.id)).toEqual(["child-99"]);
  expect(f.reader.state.revision).toBe(uuid(2000));
});
it("never merges a reset response from a next-page request into the old collection", async () => {
  const f = fixture((p) =>
    (p as { offset: number }).offset === 0
      ? page([row(1)], { offset: 1, more: true })
      : page([row(2)], { offset: 1, reset: true, revision: uuid(2000) }),
  );
  await f.reader.refresh();
  await f.reader.more();
  expect(f.reader.state.items.map((r) => r.id)).toEqual(["child-2"]);
});
it("bounds collection retention to256 and never invents an active child count", async () => {
  const active = { count: 0, items: [] };
  const f = fixture((p) => {
    const start = (p as { offset: number }).offset;
    return page(
      Array.from({ length: 64 }, (_, i) => row(start + i + 1)),
      { offset: start + 64, more: true },
    );
  });
  await f.reader.refresh();
  for (let i = 0; i < 5; i++) await f.reader.more();
  expect(f.reader.state.items).toHaveLength(256);
  expect(f.reader.state.more).toBe(false);
  expect(f.reader.state.incomplete).toBe(true);
  expect(f.request).toHaveBeenCalledTimes(4);
  expect(active).toEqual({ count: 0, items: [] });
});
it.each(["scope", "close"])("drops late history rows after %s changes", async (why) => {
  let finish!: (v: unknown) => void;
  const f = fixture(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const pending = f.reader.refresh();
  if (why === "scope") f.invalidate();
  else f.reader.dispose();
  finish(page([row(1)]));
  await pending;
  expect(f.reader.state.items).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(30000);
  expect(f.request).toHaveBeenCalledTimes(1);
});
it("clears already displayed rows immediately after scope revocation", async () => {
  const f = fixture(() => page([row(1)]));
  await f.reader.refresh();
  f.invalidate();
  expect(f.reader.state.items).toHaveLength(0);
  expect(f.reader.state.status).toBe("unavailable");
});
it.each(["pending", "unavailable"])("does not claim an empty history for %s", async (status) => {
  const f = fixture(() => page([], { status }));
  await f.reader.refresh();
  expect(subagentHistoryMessage(f.reader.state)).not.toContain("ありません");
});
it("fails closed for malformed page metadata or a nonprogress next page", async () => {
  const bad = fixture(() => page([], { status: ["ok"] }));
  await bad.reader.refresh();
  expect(bad.reader.state.status).toBe("failed");
  const f = fixture((p) =>
    (p as { offset: number }).offset === 0
      ? page([row(1)], { offset: 1, more: true })
      : page([row(1)], { offset: 1, more: true }),
  );
  await f.reader.refresh();
  await f.reader.more();
  expect(f.reader.state.items).toHaveLength(1);
  expect(f.reader.state.more).toBe(false);
  expect(f.reader.state.incomplete).toBe(true);
});
it("does not page without a collection revision", async () => {
  const f = fixture(() => {
    const { revision, ...value } = page([row(1)], { more: true });
    return value;
  });
  await f.reader.refresh();
  await f.reader.more();
  expect(f.request).toHaveBeenCalledTimes(1);
  expect(f.reader.state.more).toBe(false);
  expect(f.reader.state.incomplete).toBe(true);
});
it("serializes refresh and paging, and stops idle/old-peer polling", async () => {
  let finish!: (v: unknown) => void;
  const f = fixture(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const read = f.reader.refresh();
  await f.reader.refresh();
  await f.reader.more();
  expect(f.request).toHaveBeenCalledTimes(1);
  finish(page([row(1)]));
  await read;
  f.hide();
  await f.reader.refresh();
  expect(f.request).toHaveBeenCalledTimes(1);
  const old = fixture(() => {
    throw { code: "method_not_found" };
  });
  old.reader.start();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(30000);
  expect(old.request).toHaveBeenCalledTimes(1);
  expect(old.reader.state.status).toBe("unsupported");
  expect(subagentHistoryMessage(old.reader.state)).toContain("この操舵室の接続経路");
});
it.each(["missing-reset", "oversized-reset"])(
  "does not treat a changed next-page collection as a valid first page: %s",
  async (why) => {
    const f = fixture((p) =>
      (p as { offset: number }).offset === 0
        ? page([row(1)], { offset: 1, more: true })
        : page([row(2)], {
            revision: uuid(2000),
            reset: why !== "missing-reset",
            offset: why === "oversized-reset" ? 128 : 2,
          }),
    );
    await f.reader.refresh();
    await f.reader.more();
    expect(f.reader.state.status).toBe("failed");
    expect(f.reader.state.items).toHaveLength(0);
  },
);
