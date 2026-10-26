import { afterEach, expect, it, vi } from "vitest";
import { DesktopRichClipboard } from "./DesktopRichClipboard.js";
const id = "22222222-2222-4222-8222-222222222222";
afterEach(() => vi.useRealTimers());
function setup() {
  let allowed = true,
    writeAllowed = true,
    generation = 1;
  const write = vi.fn(),
    send = vi.fn(() => true),
    clipboard = new DesktopRichClipboard({
      allowed: (w) => allowed && (!w || writeAllowed),
      generation: () => generation,
      write,
      send,
    });
  const request = (operation: string, extra = {}) =>
    clipboard.fromViewer({ type: "clipboard_rich", id, operation, ...extra });
  const result = (stage: string, extra = {}) =>
    clipboard.fromHelper({ type: "clipboard_rich_result", id, ok: true, stage, ...extra });
  return {
    clipboard,
    write,
    send,
    request,
    result,
    revoke: () => {
      allowed = false;
      generation++;
      clipboard.revoke();
    },
    readOnly: () => (writeAllowed = false),
  };
}
it("streams bounded write chunks and only issues commit after the exact byte count", () => {
  const f = setup();
  try {
    f.request("begin", { size: 3 });
    expect(f.write).toHaveBeenCalledWith(
      expect.objectContaining({ generation: 1, operation: "begin" }),
    );
    f.result("begin", { size: 3 });
    f.request("push", { offset: 0, data: "YWJj" });
    f.result("chunk", { offset: 3 });
    f.request("commit");
    f.result("done");
    expect(f.send).toHaveBeenLastCalledWith({
      type: "clipboard_rich_result",
      id,
      ok: true,
      stage: "done",
    });
    expect((f.clipboard as any).current).toBeUndefined();
  } finally {
    f.clipboard.stop();
  }
});
it("does not permit writes without input permission and stops a retired generation before commit", () => {
  const f = setup();
  try {
    f.readOnly();
    f.request("begin", { size: 3 });
    expect(f.write).not.toHaveBeenCalled();
    expect(f.send).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    f.request("read");
    f.result("begin", { size: 3 });
    f.revoke();
    expect(f.write).toHaveBeenLastCalledWith(expect.objectContaining({ operation: "cancel" }));
    const count = f.send.mock.calls.length;
    f.result("chunk", { offset: 3, data: "YWJj" });
    expect(f.send).toHaveBeenCalledTimes(count);
  } finally {
    f.clipboard.stop();
  }
});
it("refuses out of order chunks and unsolicited helper completion without impacting any other stream", () => {
  const f = setup();
  try {
    f.request("begin", { size: 3 });
    f.result("begin", { size: 3 });
    f.request("push", { offset: 1, data: "YWJj" });
    expect(f.send).toHaveBeenLastCalledWith(expect.objectContaining({ ok: false }));
    expect((f.clipboard as any).current).toBeUndefined();
  } finally {
    f.clipboard.stop();
  }
});
it("times out only the clipboard transaction and clears its metadata on stop", async () => {
  vi.useFakeTimers();
  const f = setup();
  f.request("read");
  await vi.advanceTimersByTimeAsync(3001);
  expect(f.send).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  expect((f.clipboard as any).current).toBeUndefined();
  f.clipboard.stop();
  expect((f.clipboard as any).timeout).toBeUndefined();
});
it("rejects overlap, decoded overflow, mismatched helper offsets, and retired IDs", () => {
  const f = setup();
  try {
    f.request("begin", { size: 1 });
    f.result("begin", { size: 1 });
    f.request("push", { offset: 0, data: "YWJj" });
    expect(f.send).toHaveBeenLastCalledWith(expect.objectContaining({ ok: false }));
    const count = f.write.mock.calls.length;
    f.request("read");
    expect(f.write).toHaveBeenCalledTimes(count);
  } finally {
    f.clipboard.stop();
  }
});

it("retires an idle transaction even after the helper has replied, so a new ID can start", async () => {
  vi.useFakeTimers();
  const f = setup();
  try {
    f.request("begin", { size: 3 });
    f.result("begin", { size: 3 });
    await vi.advanceTimersByTimeAsync(5001);
    expect((f.clipboard as any).current).toBeUndefined();
    const next = "33333333-3333-4333-8333-333333333333";
    f.clipboard.fromViewer({ type: "clipboard_rich", id: next, operation: "read" });
    expect(f.write).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: next, operation: "read" }),
    );
  } finally {
    f.clipboard.stop();
  }
});
