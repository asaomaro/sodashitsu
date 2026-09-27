import type { MethodName, ParamsOf, ResultOf } from "@wtm/protocol";
import { describe, expect, it, vi } from "vitest";
import type { ConnectionPort, TerminalSinkPort } from "../net/ports.js";
import { CommandPopupSession, type PopupTerminalLike } from "./CommandPopupSession.js";

function setup(run: () => Promise<unknown>) {
  const requests: [string, unknown][] = [];
  const conn = {
    request<M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
      requests.push([method, params]);
      if (method === "command.run") return run() as Promise<ResultOf<M>>;
      return Promise.resolve({} as ResultOf<M>);
    },
    sendInput: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    connect: vi.fn(),
  } as unknown as ConnectionPort;
  const sinks = new Map<string, TerminalSinkPort>();
  const registry = {
    attachExternal: (id: string, sink: TerminalSinkPort) => {
      sinks.set(id, sink);
      return () => sinks.delete(id);
    },
  };
  const writes: (string | Uint8Array)[] = [];
  const resizes: [number, number][] = [];
  let dataListener: ((d: string) => void) | null = null;
  const term: PopupTerminalLike = {
    write: (d) => writes.push(d),
    resize: (c, r) => resizes.push([c, r]),
    onData: (l) => {
      dataListener = l;
      return { dispose: () => (dataListener = null) };
    },
  };
  const session = new CommandPopupSession({ conn, registry, term });
  return {
    session,
    requests,
    conn,
    sinks,
    writes,
    resizes,
    type: (d: string) => dataListener?.(d),
    hasListener: () => dataListener !== null,
  };
}

describe("CommandPopupSession（20260927-custom-command-keys の AC4・AC-I1〜AC-I3）", () => {
  it("id・pane・大きさだけを送り、popup の id で購読し、出力・SNAPSHOT を端末へ、入力を popup の id で送る", async () => {
    const s = setup(async () => ({ type: "popup", popupId: "p9", cols: 80, rows: 24 }));
    expect(await s.session.start("git", "p1", 80, 24)).toEqual({ ok: true, popupId: "p9" });
    expect(s.requests).toEqual([
      ["command.run", { commandId: "git", paneId: "p1", cols: 80, rows: 24 }],
      ["pane.subscribe", { paneId: "p9", scrollbackLines: 1000 }],
    ]);
    s.sinks.get("p9")!.onOutput("p9", new Uint8Array([104, 105]));
    s.sinks.get("p9")!.onSnapshot("p9", 70, 20, "screen");
    expect(s.writes).toEqual([new Uint8Array([104, 105]), "\x1bcscreen"]);
    expect(s.resizes).toEqual([[70, 20]]);
    s.type("q");
    expect(s.conn.sendInput).toHaveBeenCalledWith("p9", "q");
    expect(s.session.isOpen).toBe(true);
  });

  it("閉じるボタン：popup_close を送り、受け手と入力を外す", async () => {
    const s = setup(async () => ({ type: "popup", popupId: "p9", cols: 80, rows: 24 }));
    await s.session.start("git", "p1", 80, 24);
    s.session.close();
    expect(s.requests.at(-1)).toEqual(["command.popup_close", { popupId: "p9" }]);
    expect(s.sinks.has("p9")).toBe(false);
    expect(s.hasListener()).toBe(false);
    s.session.close(); // 2 度目は何もしない
    expect(s.requests.filter(([m]) => m === "command.popup_close")).toHaveLength(1);
  });

  it("サーバが閉じた・切断：要求を送らずに後始末だけ", async () => {
    const s = setup(async () => ({ type: "popup", popupId: "p9", cols: 80, rows: 24 }));
    await s.session.start("git", "p1", 80, 24);
    s.session.closeLocal();
    expect(s.requests.map(([m]) => m)).toEqual(["command.run", "pane.subscribe"]);
    expect(s.sinks.has("p9")).toBe(false);
  });

  it("応答を待つ間に閉じられたら、後から来た成功の応答は表示せず popup_close を送る（サーバに残さない）", async () => {
    let resolve!: (v: unknown) => void;
    const s = setup(() => new Promise((r) => (resolve = r)));
    const pending = s.session.start("git", "p1", 80, 24);
    s.session.close();
    resolve({ type: "popup", popupId: "p9", cols: 80, rows: 24 });
    expect(await pending).toEqual({ ok: false, abandoned: true });
    expect(s.requests.at(-1)).toEqual(["command.popup_close", { popupId: "p9" }]);
    expect(s.sinks.size).toBe(0);
    expect(s.hasListener()).toBe(false);
  });

  it("失敗の応答は code を返す（閉じられていれば abandoned）", async () => {
    const fail = setup(async () =>
      Promise.reject(
        Object.assign(new Error("command_popup_open: x"), { code: "command_popup_open" }),
      ),
    );
    expect(await fail.session.start("git", "p1", 80, 24)).toEqual({
      ok: false,
      code: "command_popup_open",
    });
    let reject!: (e: unknown) => void;
    const s = setup(() => new Promise((_r, j) => (reject = j)));
    const pending = s.session.start("git", "p1", 80, 24);
    s.session.closeLocal();
    reject(new Error("closed"));
    expect(await pending).toEqual({ ok: false, abandoned: true });
  });
});
