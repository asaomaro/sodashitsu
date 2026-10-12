import { afterEach, expect, it, vi } from "vitest";
import { normalizeAskSpec } from "@sodashitsu/protocol";
import { encodeRasterPng } from "@sodashitsu/client-core/imageCodec";
import { startedApp } from "../testing/appHarness.js";
let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});
it("opens a native form, keeps resized input and returns the answer without PTY leakage", async () => {
  const checked = normalizeAskSpec({
    title: "NativeInput",
    questions: [{ id: "q", label: "本文", type: "text", required: true }],
  });
  if (!checked.ok) throw new Error(checked.message);
  const h = await startedApp({
    respond: { "ask.subscribe": { asks: [{ askId: "a", paneId: "p1", spec: checked.spec }] } },
  });
  close = h.close;
  await vi.waitFor(async () => {
    h.app.renderNow();
    expect(await h.screen()).toContain("NativeInput");
  });
  h.io.type("\t\t");
  h.io.type("\x1b[200~日本語の回答\x1b[201~");
  h.io.resizeTo(80, 26);
  h.app.renderNow();
  expect(await h.screen()).toContain("日本語の回答");
  h.io.type("\x1b[13;5u");
  await vi.waitFor(() =>
    expect(h.ws.requests("ask.answer")[0]?.params).toMatchObject({
      askId: "a",
      answers: { q: "日本語の回答" },
    }),
  );
  await vi.waitFor(() => expect(h.app.asks.window).toBeNull());
  expect(h.ws.sent.filter((x) => x instanceof Uint8Array)).toHaveLength(0);
});
it("clears pane image placements when switching to graph and consumes cell pixel reports locally", async () => {
  const h = await startedApp({ env: { WT_SESSION: "test" } });
  close = h.close;
  const pane = [...h.app.model.panes.values()].find((p) => !p.virtual)!;
  const b64 = Buffer.from(
    encodeRasterPng({ width: 1, height: 1, rgba: Uint8Array.of(255, 0, 0, 255) }),
  ).toString("base64");
  h.app.panes.onOutput(
    pane.id,
    new TextEncoder().encode(`\x1b]1337;File=inline=1;width=2;height=1:${b64}\x07`),
  );
  await vi.waitFor(() => {
    h.app.renderNow();
    expect(h.io.output()).toContain("\x1bP0;1q");
  });
  const n = h.io.output().length;
  h.app.ui.setScreen("graph");
  h.app.renderNow();
  expect(h.io.output().slice(n)).not.toContain("\x1bP0;1q");
  const sent = h.ws.sent.filter((x) => x instanceof Uint8Array).length;
  h.io.type("\x1b[6;20;10t");
  expect(h.ws.sent.filter((x) => x instanceof Uint8Array)).toHaveLength(sent);
});
