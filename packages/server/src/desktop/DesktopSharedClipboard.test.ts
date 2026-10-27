import { expect, it, vi } from "vitest";
import { DesktopRichClipboard } from "./DesktopRichClipboard.js";
import { DesktopSharedClipboard } from "./DesktopSharedClipboard.js";
const id = "00000000-0000-4000-8000-000000000001";
function fixture() {
  const write = vi.fn(),
    send = vi.fn(),
    allowed = vi.fn(() => true);
  return {
    write,
    send,
    allowed,
    pool: new DesktopSharedClipboard<string>({ write, send, allowed }),
  };
}
it("keeps a clipboard owner independent and refuses another viewer's grant, revoke, and command", () => {
  const f = fixture();
  expect(f.pool.grant("a", true, 1)).toBe(true);
  expect(f.pool.grant("b", true, 1)).toBe(false);
  expect(f.pool.grant("b", false, 2)).toBe(false);
  f.pool.command("b", { type: "clipboard", operation: "read", id: 1, generation: 1 });
  expect(f.write).toHaveBeenCalledTimes(1);
  expect(f.write.mock.calls[0]![0]).toEqual({
    type: "clipboard_control",
    enabled: true,
    generation: 1,
  });
});
it("translates reused text ids/generations and drops old results after handover", () => {
  const f = fixture();
  f.pool.grant("a", true, 1);
  f.pool.command("a", { type: "clipboard", operation: "read", id: 7, generation: 1 });
  const first = f.write.mock.calls.at(-1)![0];
  f.pool.detach("a");
  f.pool.grant("b", true, 1);
  f.pool.command("b", { type: "clipboard", operation: "read", id: 7, generation: 1 });
  const next = f.write.mock.calls.at(-1)![0];
  expect(next.id).not.toBe(first.id);
  expect(next.generation).toBeGreaterThan(first.generation);
  f.pool.receive({ type: "clipboard_result", id: first.id, ok: true, text: "old" });
  expect(f.send).not.toHaveBeenCalled();
  f.pool.receive({ type: "clipboard_result", id: next.id, ok: true, text: "current" });
  expect(f.send).toHaveBeenCalledWith("b", {
    type: "clipboard_result",
    id: 7,
    ok: true,
    text: "current",
  });
});
it("rekeys rich UUIDs and finishes a read at the last chunk before another transaction", () => {
  const f = fixture();
  f.pool.grant("a", true, 9);
  f.pool.command("a", { type: "clipboard_rich", operation: "read", id, generation: 9 });
  const source = f.write.mock.calls.at(-1)![0];
  expect(source.id).not.toBe(id);
  f.pool.receive({
    type: "clipboard_rich_result",
    id: source.id,
    ok: true,
    stage: "begin",
    size: 2,
  });
  f.pool.command("a", { type: "clipboard_rich", operation: "pull", id, generation: 9, offset: 0 });
  expect(f.write.mock.calls.at(-1)![0].id).toBe(source.id);
  f.pool.receive({
    type: "clipboard_rich_result",
    id: source.id,
    ok: true,
    stage: "chunk",
    offset: 2,
    data: "AAA=",
  });
  expect(f.send.mock.calls.at(-1)).toEqual([
    "a",
    { type: "clipboard_rich_result", id, ok: true, stage: "chunk", offset: 2, data: "AAA=" },
  ]);
  f.pool.command("a", { type: "clipboard_rich", operation: "read", id, generation: 9 });
  expect(f.write.mock.calls.at(-1)![0].id).not.toBe(source.id);
});
it("retires rich work on grant renewal and refuses old generations and other viewer chunks", () => {
  const f = fixture();
  f.pool.grant("a", true, 1);
  f.pool.command("a", { type: "clipboard_rich", operation: "begin", id, generation: 1, size: 2 });
  const old = f.write.mock.calls.at(-1)![0];
  f.pool.grant("a", true, 2);
  const count = f.write.mock.calls.length;
  for (const member of ["a", "b"])
    f.pool.command(member, { type: "clipboard_rich", operation: "commit", id, generation: 1 });
  expect(f.write.mock.calls).toHaveLength(count);
  f.pool.receive({ type: "clipboard_rich_result", id: old.id, ok: true, stage: "done" });
  expect(f.send).not.toHaveBeenCalled();
});
it("invalidates the helper generation on detach and rejects a disabled source", () => {
  const f = fixture();
  f.pool.grant("a", true, 1);
  f.pool.detach("b");
  expect(f.write).toHaveBeenCalledTimes(1);
  f.pool.detach("a");
  expect(f.write.mock.calls.at(-1)![0]).toEqual({
    type: "clipboard_control",
    enabled: false,
    generation: 2,
  });
  f.allowed.mockReturnValue(false);
  expect(f.pool.grant("b", true, 1)).toBe(false);
  expect(f.pool.command("b", { type: "heartbeat" })).toBe(false);
});

it("keeps an immediate new rich transaction after cancel isolated from delayed old replies", () => {
  const f = fixture();
  f.pool.grant("a", true, 1);
  f.pool.command("a", { type: "clipboard_rich", operation: "read", id, generation: 1 });
  const old = f.write.mock.calls.at(-1)![0].id;
  f.pool.command("a", { type: "clipboard_rich", operation: "cancel", id, generation: 1 });
  const nextId = "00000000-0000-4000-8000-000000000002";
  f.pool.command("a", { type: "clipboard_rich", operation: "read", id: nextId, generation: 1 });
  const next = f.write.mock.calls.at(-1)![0].id;
  expect(next).not.toBe(old);
  for (const stage of ["cancelled", "done", "chunk"] as const)
    f.pool.receive({
      type: "clipboard_rich_result",
      id: old,
      ok: true,
      stage,
      ...(stage === "chunk" ? { offset: 2, data: "AAA=" } : {}),
    });
  expect(f.send).not.toHaveBeenCalled();
  f.pool.receive({ type: "clipboard_rich_result", id: next, ok: true, stage: "begin", size: 2 });
  expect(f.send).toHaveBeenCalledWith("a", {
    type: "clipboard_rich_result",
    id: nextId,
    ok: true,
    stage: "begin",
    size: 2,
  });
});

it("allows the wrapper to time out, cancel and immediately start a fresh transaction", () => {
  vi.useFakeTimers();
  const f = fixture(),
    send = vi.fn();
  f.pool.grant("a", true, 1);
  const wrapper = new DesktopRichClipboard({
    allowed: () => true,
    generation: () => 1,
    write: (value) => f.pool.command("a", value),
    send: (value) => {
      send(value);
      return true;
    },
  });
  f.send.mockImplementation((_member, value) => wrapper.fromHelper(value));
  try {
    wrapper.fromViewer({ type: "clipboard_rich", operation: "read", id });
    const old = f.write.mock.calls.at(-1)![0].id;
    vi.advanceTimersByTime(3001);
    expect(f.write.mock.calls.at(-1)![0].operation).toBe("cancel");
    expect(send).toHaveBeenCalledWith({
      type: "clipboard_rich_result",
      id,
      ok: false,
      stage: "done",
    });
    const nextId = "00000000-0000-4000-8000-000000000002";
    wrapper.fromViewer({ type: "clipboard_rich", operation: "read", id: nextId });
    const next = f.write.mock.calls.at(-1)![0].id;
    expect(next).not.toBe(old);
    f.pool.receive({ type: "clipboard_rich_result", id: old, ok: true, stage: "begin", size: 2 });
    f.pool.receive({ type: "clipboard_rich_result", id: next, ok: true, stage: "begin", size: 2 });
    expect(send).toHaveBeenCalledWith({
      type: "clipboard_rich_result",
      id: nextId,
      ok: true,
      stage: "begin",
      size: 2,
    });
  } finally {
    wrapper.stop();
    f.pool.detach("a");
    vi.useRealTimers();
  }
});
