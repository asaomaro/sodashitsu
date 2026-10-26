import { afterEach, expect, it, vi } from "vitest";
import { DesktopRichClipboardClient } from "./richClipboard.js";
import { encodeClipboardBundle } from "@sodashitsu/protocol";
afterEach(() => vi.useRealTimers());
it("uses stop and wait chunks, validates final offsets, and never sends a second chunk before ACK", async () => {
  const sent: any[] = [],
    client = new DesktopRichClipboardClient(
      (m) => {
        sent.push(m);
        return true;
      },
      () => true,
    ),
    promise = client.write({ html: "x".repeat(40000) });
  await Promise.resolve();
  const first = sent[0];
  expect(sent).toHaveLength(1);
  client.receive({
    type: "clipboard_rich_result",
    id: first.id,
    ok: true,
    stage: "begin",
    size: first.size,
  });
  await Promise.resolve();
  expect(sent).toHaveLength(2);
  let offset = 0;
  while (sent.at(-1).operation === "push") {
    const request = sent.at(-1);
    offset += atob(request.data).length;
    client.receive({
      type: "clipboard_rich_result",
      id: first.id,
      ok: true,
      stage: "chunk",
      offset,
    });
    await Promise.resolve();
  }
  expect(sent.at(-1).operation).toBe("commit");
  client.receive({ type: "clipboard_rich_result", id: first.id, ok: true, stage: "done" });
  await promise;
  client.stop();
});
it("does not continue a clipboard read after cancellation and ignores its late result", async () => {
  const sent: any[] = [],
    client = new DesktopRichClipboardClient(
      (m) => {
        sent.push(m);
        return true;
      },
      () => true,
    ),
    pending = client.read();
  const assertion = expect(pending).rejects.toThrow("取り消し");
  const id = sent[0].id;
  client.cancel();
  client.receive({ type: "clipboard_rich_result", id, ok: true, stage: "begin", size: 10 });
  await assertion;
  expect(sent.map((m) => m.operation)).toEqual(["read", "cancel"]);
  client.stop();
});
it("reassembles only the declared size and validates the complete bundle", async () => {
  const value = { text: "generated😀", html: "<table><tr><td>生成</td></tr></table>" },
    bytes = encodeClipboardBundle(value),
    sent: any[] = [],
    client = new DesktopRichClipboardClient(
      (m) => {
        sent.push(m);
        return true;
      },
      () => true,
    ),
    pending = client.read(),
    id = sent[0].id;
  client.receive({
    type: "clipboard_rich_result",
    id,
    ok: true,
    stage: "begin",
    size: bytes.length,
  });
  await Promise.resolve();
  client.receive({
    type: "clipboard_rich_result",
    id,
    ok: true,
    stage: "chunk",
    offset: bytes.length,
    data: btoa(String.fromCharCode(...bytes)),
  });
  await expect(pending).resolves.toEqual(value);
  client.stop();
});
it("does not send the next request if permission is revoked while an ACK is pending", async () => {
  let allowed = true;
  const sent: any[] = [],
    client = new DesktopRichClipboardClient(
      (m) => {
        sent.push(m);
        return true;
      },
      () => allowed,
    ),
    pending = client.write({ text: "generated" });
  const assertion = expect(pending).rejects.toThrow();
  allowed = false;
  client.cancel();
  await assertion;
  expect(sent.map((m) => m.operation)).toEqual(["begin", "cancel"]);
  client.stop();
});
