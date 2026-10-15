import { expect, it, vi } from "vitest";
import { EmbeddedTerminalSize } from "./EmbeddedTerminalSize.js";
it("serializes the newest app dimensions and releases its independent attachment", async () => {
  let state!: (ready: boolean) => void, resolve!: () => void;
  const request = vi
    .fn()
    .mockReturnValueOnce(
      new Promise<void>((r) => {
        resolve = r;
      }),
    )
    .mockResolvedValue({});
  const connection = { request, connect: vi.fn(), dispose: vi.fn() };
  const controller = new EmbeddedTerminalSize(
    "p",
    (cb) => {
      state = cb;
      return connection;
    },
    vi.fn(),
  );
  controller.resize(40, 10);
  state(true);
  controller.resize(60, 15);
  controller.resize(70, 20);
  expect(request).toHaveBeenCalledTimes(1);
  resolve();
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(request.mock.calls[0]).toEqual(["pane.attach", { paneId: "p", cols: 40, rows: 10 }]);
  expect(request.mock.calls[1]).toEqual([
    "pane.attach_resize",
    { paneId: "p", cols: 70, rows: 20 },
  ]);
  state(false);
  state(true);
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  expect(request.mock.calls[2]![0]).toBe("pane.attach");
  controller.dispose();
  controller.resize(80, 25);
  expect(connection.dispose).toHaveBeenCalledTimes(1);
});
it("does not steal other attachment ownership or retry in a sizing loop", async () => {
  let state!: (ready: boolean) => void;
  const failed = vi.fn(),
    request = vi.fn().mockRejectedValue({ code: "pane_attached" });
  const controller = new EmbeddedTerminalSize(
    "p",
    (cb) => {
      state = cb;
      return { request, connect() {}, dispose() {} };
    },
    failed,
  );
  controller.resize(40, 10);
  state(true);
  await vi.waitFor(() => expect(failed).toHaveBeenCalledWith(true));
  controller.resize(80, 30);
  await Promise.resolve();
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0]![1]).not.toHaveProperty("takeover");
  controller.dispose();
});

it("acquires the latest size when a competing attachment releases, without polling", async () => {
  let state!: (ready: boolean) => void,
    event!: (event: import("@sodashitsu/protocol").ServerEvent) => void;
  const request = vi.fn().mockRejectedValueOnce({ code: "pane_attached" }).mockResolvedValue({}),
    failed = vi.fn();
  const size = new EmbeddedTerminalSize(
    "p",
    (s, e) => {
      state = s;
      event = e;
      return { request, connect() {}, dispose() {} };
    },
    failed,
  );
  size.resize(40, 10);
  state(true);
  await vi.waitFor(() => expect(failed).toHaveBeenCalledWith(true));
  size.resize(70, 20);
  await Promise.resolve();
  expect(request).toHaveBeenCalledTimes(1);
  event({ event: "pane.attach_changed", data: { paneId: "other", clientId: null } });
  expect(request).toHaveBeenCalledTimes(1);
  event({ event: "pane.attach_changed", data: { paneId: "p", clientId: null } });
  await vi.waitFor(() => expect(failed).toHaveBeenLastCalledWith(false));
  expect(request.mock.calls[1]).toEqual(["pane.attach", { paneId: "p", cols: 70, rows: 20 }]);
  size.dispose();
});

it("reattaches when ownership is released before an in-flight attach response", async () => {
  let event!: (event: import("@sodashitsu/protocol").ServerEvent) => void, resolve!: () => void;
  const request = vi
    .fn()
    .mockReturnValueOnce(
      new Promise<void>((r) => {
        resolve = r;
      }),
    )
    .mockResolvedValue({});
  const size = new EmbeddedTerminalSize(
    "p",
    (state, e) => {
      event = e;
      return {
        request,
        connect() {
          queueMicrotask(() => state(true));
        },
        dispose() {},
      };
    },
    vi.fn(),
  );
  size.resize(40, 10);
  await Promise.resolve();
  event({ event: "pane.attach_changed", data: { paneId: "p", clientId: null } });
  resolve();
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(request.mock.calls[1]![0]).toBe("pane.attach");
  size.dispose();
});
