import { afterEach, expect, it, vi } from "vitest";
import type { DisplayInfo } from "@sodashitsu/protocol";
import { startedApp } from "../testing/appHarness.js";
let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});
it("opens a CLI float, accepts a form response in the outer terminal, updates and disables it on removal", async () => {
  let content =
    '<h2>レビュー</h2><form data-soda-action="answer"><label>コメント<input name="comment"></label><button>回答</button></form>';
  const info: DisplayInfo = {
    id: "d1",
    paneId: "p1",
    name: "review",
    title: "レビュー",
    kind: "panel",
    format: "html",
    size: 320,
    rev: 1,
    bytes: Buffer.byteLength(content),
    updatedAt: new Date().toISOString(),
    dock: "float",
  };
  const h = await startedApp({
    respond: {
      "display.subscribe": { displays: [] },
      "display.get": () => ({
        id: info.id,
        rev: info.rev,
        format: info.format,
        totalBytes: info.bytes,
        offset: 0,
        base64: Buffer.from(content).toString("base64"),
        eof: true,
      }),
      "display.action": {},
    },
  });
  close = h.close;
  await vi.waitFor(() => expect(h.ws.requests("display.subscribe")).toHaveLength(1));
  await vi.waitFor(() => expect(h.app.displays.connected).toBe(true));
  await Promise.resolve();
  h.ws.event("display.updated", { display: info });
  await vi.waitFor(async () => {
    h.app.renderNow();
    expect(await h.screen()).toContain("コメント:");
  });
  h.io.type("LGTM\t\r");
  await vi.waitFor(() =>
    expect(h.ws.requests("display.action")[0]?.params).toEqual({
      id: "d1",
      rev: 1,
      action: "answer",
      data: { comment: "LGTM" },
    }),
  );
  expect(h.ws.sent.filter((m) => m instanceof Uint8Array)).toHaveLength(0);
  await vi.waitFor(() => expect(h.app.ui.dialogContext).toBeNull());
  h.app.renderNow();
  expect(await h.screen()).not.toContain("コメント:");
  h.app.ui.openDialogWithContext({ kind: "display", paneId: "p1", displayId: "d1" });
  content = "# 更新後の結果\n\n**完了**";
  info.rev = 2;
  info.format = "markdown";
  info.bytes = Buffer.byteLength(content);
  h.ws.event("display.updated", { display: info });
  await vi.waitFor(async () => {
    h.app.renderNow();
    const screen = await h.screen();
    expect(screen).toContain("更新後の結果");
    expect(screen).not.toContain("**完了**");
  });
  h.ws.event("display.removed", { id: "d1", paneId: "p1", name: "review", reason: "closed" });
  h.app.renderNow();
  expect(h.app.ui.dialogContext).toBeNull();
});
