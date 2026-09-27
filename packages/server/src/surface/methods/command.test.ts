import { RpcError } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { MemoryLogger } from "../../log/Logger.js";
import { ControlSurface } from "../ControlSurface.js";
import type { ClientSink } from "../../terminal/OutputFanout.js";
import type { MethodDeps } from "./deps.js";
import { registerCommandMethods } from "./command.js";
import { registerSubscribeMethods } from "./subscribe.js";

const sink = (clientId: string): ClientSink => ({
  clientId,
  sendOutput: () => undefined,
  sendSnapshot: () => undefined,
  bufferedAmount: 0,
});

function setup(withCommands = true) {
  const calls: string[] = [];
  const subscribed: string[] = [];
  const commands = {
    list: () => ({ commands: [{ id: "a", type: "shell" }], problem: null }),
    reload: async () => ({ commands: [], problem: "commands.json: x" }),
    run: async (clientId: string, params: { commandId: string; paneId: string }) => {
      calls.push(`run:${clientId}:${JSON.stringify(params)}`);
      return params.commandId === "pane" ? { type: "pane", pane: { id: "p5" } } : { type: "shell" };
    },
    closePopup: (clientId: string, popupId: string) => {
      if (clientId !== "owner") throw new RpcError("not_found", "x");
      calls.push(`close:${popupId}`);
    },
    popupSize: (clientId: string, popupId: string) =>
      clientId === "owner" && popupId === "p9" ? { cols: 50, rows: 10 } : undefined,
  };
  const deps = {
    session: { getPane: () => undefined },
    terminals: {
      get: (id: string) =>
        id === "p9"
          ? { fanout: { subscribe: (s: ClientSink) => subscribed.push(s.clientId) } }
          : undefined,
    },
    clients: { touch: () => undefined, addSubscription: () => undefined },
    sizeAuthority: { noteInteraction: (c: string, p: string) => calls.push(`note:${c}:${p}`) },
    ...(withCommands ? { commands } : {}),
  } as unknown as MethodDeps;
  const surface = new ControlSurface(new MemoryLogger());
  registerCommandMethods(surface, deps);
  registerSubscribeMethods(surface, deps);
  return { surface, calls, subscribed };
}

describe("command.* の方式（20260927-custom-command-keys）", () => {
  it("list・reload は係の結果をそのまま返す", async () => {
    const { surface } = setup();
    expect(await surface.invoke({ clientId: "c", sink: sink("c") }, "command.list", {})).toEqual({
      ok: true,
      result: { commands: [{ id: "a", type: "shell" }], problem: null },
    });
    expect(await surface.invoke({ clientId: "c", sink: sink("c") }, "command.reload", {})).toEqual({
      ok: true,
      result: { commands: [], problem: "commands.json: x" },
    });
  });

  it("run は接続の id と検証した値だけを係へ渡す（コマンドの文字列などは取り除かれる）。pane 種はサイズ権限を取る", async () => {
    const { surface, calls } = setup();
    await surface.invoke({ clientId: "c1", sink: sink("c1") }, "command.run", {
      commandId: "a",
      paneId: "p1",
      command: "rm -rf /",
    });
    await surface.invoke({ clientId: "c1", sink: sink("c1") }, "command.run", {
      commandId: "pane",
      paneId: "p1",
    });
    expect(calls).toEqual([
      `run:c1:{"commandId":"a","paneId":"p1"}`,
      `run:c1:{"commandId":"pane","paneId":"p1"}`,
      "note:c1:p5",
    ]);
    const bad = await surface.invoke({ clientId: "c1", sink: sink("c1") }, "command.run", {
      commandId: "A;B",
      paneId: "p1",
    });
    expect(bad).toMatchObject({ ok: false, error: { code: "invalid_params" } });
    expect(calls).toHaveLength(3);
  });

  it("popup_close は持ち主でなければ not_found", async () => {
    const { surface, calls } = setup();
    expect(
      await surface.invoke({ clientId: "owner", sink: sink("owner") }, "command.popup_close", {
        popupId: "p9",
      }),
    ).toEqual({ ok: true, result: {} });
    expect(
      await surface.invoke({ clientId: "other", sink: sink("other") }, "command.popup_close", {
        popupId: "p9",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(calls).toEqual(["close:p9"]);
  });

  it("pane.subscribe は popup を持ち主の接続にだけ許し、大きさは popup の値", async () => {
    const { surface, subscribed } = setup();
    expect(
      await surface.invoke({ clientId: "owner", sink: sink("owner") }, "pane.subscribe", {
        paneId: "p9",
        scrollbackLines: 10,
      }),
    ).toEqual({
      ok: true,
      result: { cols: 50, rows: 10 },
    });
    expect(
      await surface.invoke({ clientId: "other", sink: sink("other") }, "pane.subscribe", {
        paneId: "p9",
        scrollbackLines: 10,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(subscribed).toEqual(["owner"]);
  });

  it("係が無い組み立てでは、一覧は空・走らせると command_not_found・popup は購読できない", async () => {
    const { surface } = setup(false);
    expect(await surface.invoke({ clientId: "c", sink: sink("c") }, "command.list", {})).toEqual({
      ok: true,
      result: { commands: [], problem: null },
    });
    expect(
      await surface.invoke({ clientId: "c", sink: sink("c") }, "command.run", {
        commandId: "a",
        paneId: "p1",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "command_not_found" },
    });
    expect(
      await surface.invoke({ clientId: "owner", sink: sink("owner") }, "pane.subscribe", {
        paneId: "p9",
        scrollbackLines: 10,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });
});
