import { describe, expect, it } from "vitest";
import type { HandoffReply } from "./HandoffController.js";
import type { StopReply } from "./HandoffSocket.js";
import { createControlRequests } from "./controlRequests.js";

/** 制御の socket の受け付けの判断（20260927-session-stop の T1）。 */
function setup(opts: { busy?: boolean; idle?: Promise<void> } = {}) {
  const handoffCalls: number[] = [];
  let idleWaits = 0;
  const handoff = {
    isBusy: opts.busy ?? false,
    waitIdle: async () => {
      idleWaits++;
      await opts.idle;
    },
    status: () => ({ lastHandoff: null }),
    request: async (reply: (r: HandoffReply) => Promise<void>) => {
      handoffCalls.push(1);
      await reply({ ok: true, id: "x", panes: 0 });
    },
  };
  const control = createControlRequests({ handoff, pid: 777 });
  const stopped: number[] = [];
  return { handoff, control, handoffCalls, stopped, idleWaits: () => idleWaits };
}

async function askStop(
  control: ReturnType<typeof createControlRequests>,
): Promise<StopReply | undefined> {
  let got: StopReply | undefined;
  await control.stop(async (r) => {
    got = r;
  });
  return got;
}

describe("createControlRequests", () => {
  it("止める指示: 返事（pid）を返してから止める入口を 1 回だけ呼ぶ。2 回目は alreadyStopping で何もしない", async () => {
    const { control, stopped } = setup();
    const order: string[] = [];
    control.setStopHandler(() => {
      order.push("handler");
      stopped.push(1);
    });
    let first: StopReply | undefined;
    await control.stop(async (r) => {
      order.push("reply");
      first = r;
    });
    expect(first).toEqual({ ok: true, pid: 777, alreadyStopping: false });
    expect(order).toEqual(["reply", "handler"]);
    expect(control.isClosing).toBe(true);
    expect(await askStop(control)).toEqual({ ok: true, pid: 777, alreadyStopping: true });
    expect(stopped).toHaveLength(1);
  });

  it("止める指示: 返事を書けなかった（CLI が先に切った）ときも止める", async () => {
    const { control, stopped } = setup();
    control.setStopHandler(() => stopped.push(1));
    await expect(
      control.stop(async () => {
        throw new Error("connection closed");
      }),
    ).rejects.toThrow("connection closed");
    expect(stopped).toHaveLength(1);
  });

  it("止める指示: 引き継ぎの最中は busy で断り、止めない", async () => {
    const { control, stopped } = setup({ busy: true });
    control.setStopHandler(() => stopped.push(1));
    expect(await askStop(control)).toEqual({
      ok: false,
      reason: "busy",
      message: "a handoff is in progress",
    });
    expect(stopped).toHaveLength(0);
    expect(control.isClosing).toBe(false);
  });

  it("止める指示: 入口が登録されていなければ unsupported", async () => {
    const { control } = setup();
    expect(await askStop(control)).toMatchObject({ ok: false, reason: "unsupported" });
    expect(control.isClosing).toBe(false);
  });

  it("止める指示: beginClosing の後（Ctrl+C で止まる途中）は alreadyStopping で、入口を呼ばない", async () => {
    const { control, stopped } = setup();
    control.setStopHandler(() => stopped.push(1));
    await control.beginClosing();
    expect(await askStop(control)).toEqual({ ok: true, pid: 777, alreadyStopping: true });
    expect(stopped).toHaveLength(0);
  });

  it("引き継ぎの指示: 止まる途中は stopping で断る。止まる前は HandoffController へ渡す", async () => {
    const { control, handoffCalls } = setup();
    let got: HandoffReply | undefined;
    await control.request(async (r) => {
      got = r;
    });
    expect(got).toEqual({ ok: true, id: "x", panes: 0 });
    expect(handoffCalls).toHaveLength(1);
    control.setStopHandler(() => undefined);
    await askStop(control);
    await control.request(async (r) => {
      got = r;
    });
    expect(got).toEqual({ ok: false, reason: "stopping", message: "the server is stopping" });
    expect(handoffCalls).toHaveLength(1);
  });

  it("status は HandoffController の status をそのまま返す", () => {
    const { control } = setup();
    expect(control.status()).toEqual({ lastHandoff: null });
  });

  it("beginClosing: 印は同期で立ち（直後の引き継ぎを断る）、受け付け済みの引き継ぎが終わるまで解決しない", async () => {
    let finish: () => void = () => undefined;
    const idle = new Promise<void>((r) => (finish = r));
    const { control, idleWaits, handoffCalls } = setup({ idle });
    let done = false;
    const closing = control.beginClosing().then(() => {
      done = true;
    });
    expect(control.isClosing).toBe(true);
    let got: HandoffReply | undefined;
    await control.request(async (r) => {
      got = r;
    });
    expect(got).toMatchObject({ ok: false, reason: "stopping" });
    expect(handoffCalls).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 10));
    expect(idleWaits()).toBe(1);
    expect(done).toBe(false);
    finish();
    await closing;
    expect(done).toBe(true);
  });
});
