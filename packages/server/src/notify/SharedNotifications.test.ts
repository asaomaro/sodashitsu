import { it, expect, vi } from "vitest";
import { SharedNotifications } from "./SharedNotifications.js";
import type { PrefsStore } from "../persist/PrefsStore.js";
import type { Pane, SharedPrefs } from "@sodashitsu/protocol";
it("serializes decisions across clients, preserves resolved priority and rejects foreign keys", async () => {
  let prefs: SharedPrefs = {};
  const store = {
    get: () => ({ prefs, rev: 1 }),
    set: async (patch: SharedPrefs) => {
      await Promise.resolve();
      prefs = { ...prefs, ...patch };
    },
  } as unknown as PrefsStore;
  const pane = { agent: { instanceId: "a", state: "idle", completionSeq: 3 } } as Pane;
  const publish = vi.fn(),
    service = new SharedNotifications(store, () => pane, publish);
  await Promise.all([
    service.update({ paneId: "p", key: "done:a:3", status: "resolved" }, "web"),
    service.update({ paneId: "p", key: "done:a:3", status: "deferred" }, "tui"),
  ]);
  expect(service.state().notices).toMatchObject([{ status: "resolved" }]);
  expect(publish).toHaveBeenCalledTimes(2);
  await expect(
    service.update({ paneId: "p", key: "done:other:3", status: "resolved" }, "web"),
  ).rejects.toThrow();
});
