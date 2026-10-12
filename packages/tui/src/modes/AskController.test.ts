import { expect, it, vi } from "vitest";
import { normalizeAskSpec } from "@sodashitsu/protocol";
import { TuiAskController } from "./AskController.js";
const spec = normalizeAskSpec({
  title: "Native",
  questions: [{ id: "q", label: "Q", type: "text" }],
});
if (!spec.ok) throw new Error(spec.message);
const ask = { askId: "a", paneId: "p", spec: spec.spec };
const model = { panes: new Map() };
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
it("opens pending forms and closes them on a shared answer", async () => {
  const request = vi.fn(async () => ({ asks: [ask] }));
  const c = new TuiAskController({ request } as never, model as never, vi.fn());
  c.onOpened();
  await settle();
  expect(request).toHaveBeenCalledWith("ask.subscribe", { renderer: "terminal" });
  expect(c.window).not.toBeNull();
  c.onEvent({ event: "ask.closed", data: { askId: "a" } } as never);
  expect(c.window).toBeNull();
});
it("ignores late subscribe/get results after reset and closed-before-get races", async () => {
  let resolve: (v: unknown) => void = () => {};
  const request = vi.fn(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const c = new TuiAskController({ request } as never, model as never, vi.fn());
  c.onOpened();
  c.reset();
  resolve({ asks: [ask] });
  await settle();
  expect(c.window).toBeNull();
  c.onEvent({ event: "ask.opened", data: { askId: "a", paneId: "p" } });
  c.onEvent({ event: "ask.closed", data: { askId: "a" } } as never);
  resolve(ask);
  await settle();
  expect(c.window).toBeNull();
});
it("cancels active interactions once when a form opens", async () => {
  const onShow = vi.fn();
  const request = vi.fn(async () => ({ asks: [ask] }));
  const c = new TuiAskController({ request } as never, model as never, vi.fn(), onShow);
  c.onOpened();
  await settle();
  expect(onShow).toHaveBeenCalledOnce();
});
