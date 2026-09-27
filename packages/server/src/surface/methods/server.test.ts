import { describe, expect, it } from "vitest";
import { ControlSurface } from "../ControlSurface.js";
import type { ClientSink } from "../../terminal/OutputFanout.js";
import type { MethodDeps } from "./deps.js";
import { registerServerMethods } from "./server.js";
import { createControlRequests } from "../../handoff/controlRequests.js";

/** 20260927-cli-mode の T3：`server.stop`。受け付けの判断は制御の socket と共有する（`controlRequests.ts`）。 */
describe("server.stop", () => {
  const ctx = { clientId: "c1", sink: {} as ClientSink };

  function setup(opts: { busy?: boolean; handler?: boolean } = {}) {
    const control = createControlRequests({
      handoff: {
        isBusy: opts.busy ?? false,
        waitIdle: async () => undefined,
        status: () => ({ lastHandoff: null }),
        request: async () => undefined,
      },
      pid: 1,
    });
    const order: string[] = [];
    if (opts.handler !== false) control.setStopHandler(() => order.push("stop"));
    const surface = new ControlSurface();
    registerServerMethods(surface, { stopServer: (reply) => control.stop(reply) } as MethodDeps);
    return { surface, control, order };
  }

  it("応答を返した後（次の macrotask）に止める手順を 1 回だけ呼ぶ。2 回目は止めずに成功で答える", async () => {
    const { surface, order } = setup();
    const done = surface.invoke(ctx, "server.stop", {}).then((r) => {
      order.push("reply");
      return r;
    });
    expect(await done).toEqual({ ok: true, result: {} });
    expect(order).toEqual(["reply"]); // まだ止め始めていない
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));
    expect(order).toEqual(["reply", "stop"]);
    expect(await surface.invoke(ctx, "server.stop", {})).toEqual({ ok: true, result: {} });
    await new Promise<void>((r) => setImmediate(r));
    expect(order).toEqual(["reply", "stop"]);
  });

  it("引き継ぎの最中は server_busy で断り、止めない", async () => {
    const { surface, control, order } = setup({ busy: true });
    expect(await surface.invoke(ctx, "server.stop", {})).toMatchObject({
      ok: false,
      error: { code: "server_busy" },
    });
    await new Promise<void>((r) => setImmediate(r));
    expect(order).toEqual([]);
    expect(control.isClosing).toBe(false);
  });

  it("止める手順が無い（登録していない・依存が無い）なら server_stop_unsupported", async () => {
    const { surface } = setup({ handler: false });
    expect(await surface.invoke(ctx, "server.stop", {})).toMatchObject({
      ok: false,
      error: { code: "server_stop_unsupported" },
    });
    const bare = new ControlSurface();
    registerServerMethods(bare, {} as MethodDeps);
    expect(await bare.invoke(ctx, "server.stop", {})).toMatchObject({
      ok: false,
      error: { code: "server_stop_unsupported" },
    });
  });
});
