import { expect, it, vi } from "vitest";
import type { DisplayInfo } from "@sodashitsu/protocol";
import type { RequestPort } from "../term/PaneRegistry.js";
import { DisplayModel } from "./DisplayModel.js";
const info: DisplayInfo = {
  id: "d",
  paneId: "p",
  name: "view",
  title: "view",
  kind: "panel",
  format: "text",
  size: 320,
  rev: 1,
  bytes: 3,
  updatedAt: "",
};
it("does not retain content fetched across connection loss or a revision change", async () => {
  let finish: (v: unknown) => void = () => {};
  const request = vi.fn(async (method: string) =>
    method === "display.subscribe"
      ? { displays: [{ ...info }] }
      : await new Promise((r) => {
          finish = r;
        }),
  );
  const model = new DisplayModel({ request } as unknown as RequestPort, vi.fn(), vi.fn());
  await model.connect();
  const reading = model.content("d");
  model.disconnect();
  finish({ id: "d", rev: 1, offset: 0, totalBytes: 3, base64: "YWJj", eof: true });
  expect(await reading).toBeNull();
  expect(model.infos.size).toBe(0);
  await model.connect();
  const second = model.content("d");
  model.apply({ event: "display.updated", data: { display: { ...info, rev: 2 } } });
  finish({ id: "d", rev: 1, offset: 0, totalBytes: 3, base64: "YWJj", eof: true });
  expect(await second).toBeNull();
});
it("re-subscribes when an update races the initial snapshot", async () => {
  let finish: (v: unknown) => void = () => {};
  let count = 0;
  const request = vi.fn(async () =>
    ++count === 1
      ? await new Promise((r) => {
          finish = r;
        })
      : { displays: [info] },
  );
  const model = new DisplayModel({ request } as unknown as RequestPort, vi.fn(), vi.fn());
  const connecting = model.connect();
  model.apply({ event: "display.updated", data: { display: info } });
  finish({ displays: [] });
  await connecting;
  await vi.waitFor(() => expect(model.infos.has("d")).toBe(true));
  expect(request).toHaveBeenCalledTimes(2);
});
