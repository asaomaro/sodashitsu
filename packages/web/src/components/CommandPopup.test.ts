import { mount, type VueWrapper } from "@vue/test-utils";
import type { MethodName, ParamsOf, ResultOf } from "@sodashitsu/protocol";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { ConnectionKey, TerminalRegistryKey } from "../injection.js";
import type { ConnectionPort, TerminalSinkPort } from "@sodashitsu/client-core";
import { useCommandsStore } from "../store/commands.js";
import { useViewStore } from "../store/view.js";
import CommandPopup from "./CommandPopup.vue";

let pinia: Pinia;
let wrapper: VueWrapper | null = null;

beforeEach(() => {
  localStorage.clear();
  pinia = createPinia();
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = "";
});

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await nextTick();
    await Promise.resolve();
  }
}

function setup(
  run: () => Promise<unknown> = async () => ({ type: "popup", popupId: "p9", cols: 60, rows: 20 }),
) {
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
  const focused: string[] = [];
  const registry = {
    baseTerminalOptions: () => ({}),
    attachExternal: (id: string, sink: TerminalSinkPort) => {
      sinks.set(id, sink);
      return () => sinks.delete(id);
    },
    focus: (id: string) => focused.push(id),
  };
  const view = useViewStore(pinia);
  view.onConnectionState("open");
  view.focusPane("p1");
  const outside = vi.fn();
  window.addEventListener("keydown", outside);
  wrapper = mount(CommandPopup, {
    global: {
      plugins: [pinia],
      provide: { [ConnectionKey as symbol]: conn, [TerminalRegistryKey as symbol]: registry },
    },
    attachTo: document.body,
  });
  const cleanupOutside = () => window.removeEventListener("keydown", outside);
  return {
    conn,
    requests,
    sinks,
    focused,
    view,
    commands: useCommandsStore(pinia),
    outside,
    cleanupOutside,
  };
}

function openPopup(
  view: ReturnType<typeof useViewStore>,
  extra: { width?: number | `${number}%`; height?: number | `${number}%` } = {},
) {
  view.openDialogWithContext({
    kind: "commandPopup",
    commandId: "git",
    paneId: "p1",
    title: "lazygit",
    ...extra,
  });
}

describe("CommandPopup（20260927-custom-command-keys の AC4・AC5・AC-I1〜AC-I5）", () => {
  it("開くと role=dialog の枠を出し、大きさを決めて command.run を送り、popup の id で購読する。端末にフォーカスがある", async () => {
    const s = setup();
    openPopup(s.view, { width: 60, height: 20 });
    await settle();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)!.textContent).toBe(
      "lazygit",
    );
    expect(s.requests[0]).toEqual([
      "command.run",
      { commandId: "git", paneId: "p1", cols: 60, rows: 20 },
    ]);
    expect(s.requests[1]).toEqual(["pane.subscribe", { paneId: "p9", scrollbackLines: 1000 }]);
    expect(s.sinks.has("p9")).toBe(true);
    expect(document.activeElement?.classList.contains("xterm-helper-textarea")).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
    s.cleanupOutside();
  });

  it("端末への入力は popup の id で送られる（AC-I3）", async () => {
    const s = setup();
    openPopup(s.view);
    await settle();
    const textarea = document.querySelector<HTMLTextAreaElement>(
      ".command-popup .xterm-helper-textarea",
    )!;
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "q",
        code: "KeyQ",
        keyCode: 81,
        bubbles: true,
        cancelable: true,
      }),
    );
    textarea.dispatchEvent(
      new KeyboardEvent("keypress", {
        key: "q",
        code: "KeyQ",
        charCode: 113,
        keyCode: 113,
        bubbles: true,
        cancelable: true,
      }),
    );
    await settle();
    expect(s.conn.sendInput).toHaveBeenCalledWith("p9", "q");
    s.cleanupOutside();
  });

  it("キー（Esc・prefix を含む）とホイールは枠の外へ漏れず、Esc では閉じない（AC-I2・AC-I5）", async () => {
    const s = setup();
    openPopup(s.view);
    await settle();
    const textarea = document.querySelector<HTMLTextAreaElement>(
      ".command-popup .xterm-helper-textarea",
    )!;
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        keyCode: 27,
        bubbles: true,
        cancelable: true,
      }),
    );
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "b",
        code: "KeyB",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(s.outside).not.toHaveBeenCalled();
    const wheelOutside = vi.fn();
    document.body.addEventListener("wheel", wheelOutside);
    document
      .querySelector(".command-popup-backdrop")!
      .dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true }));
    document
      .querySelector(".command-popup")!
      .dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true }));
    expect(wheelOutside).not.toHaveBeenCalled();
    await settle();
    expect(s.view.openDialog).toBe("commandPopup");
    s.cleanupOutside();
  });

  it("コマンドが終わった知らせで閉じ、開く前の pane の端末へフォーカスを戻す。0 以外なら終了コードを知らせる（AC-I1・AC-I4）", async () => {
    const s = setup();
    openPopup(s.view);
    await settle();
    s.commands.notePopupClosed("p9", 127);
    await settle();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(s.view.openDialog).toBeNull();
    expect(s.focused).toEqual(["p1"]);
    expect(s.sinks.has("p9")).toBe(false);
    expect(s.view.toasts.map((t) => t.message)).toEqual([
      "「lazygit」が終了コード 127 で終わりました。",
    ]);
    s.cleanupOutside();
  });

  it("0 で終われば知らせない。別の popup の知らせは無視する", async () => {
    const s = setup();
    openPopup(s.view);
    await settle();
    s.commands.notePopupClosed("p77", 1);
    await settle();
    expect(s.view.openDialog).toBe("commandPopup");
    s.commands.notePopupClosed("p9", 0);
    await settle();
    expect(s.view.openDialog).toBeNull();
    expect(s.view.toasts).toEqual([]);
    s.cleanupOutside();
  });

  it("閉じるボタンで popup_close を送り、閉じる（AC-I1）", async () => {
    const s = setup();
    openPopup(s.view);
    await settle();
    document.querySelector<HTMLElement>("[data-command-popup-close]")!.click();
    await settle();
    expect(s.requests.at(-1)).toEqual(["command.popup_close", { popupId: "p9" }]);
    expect(s.view.openDialog).toBeNull();
    expect(s.focused).toEqual(["p1"]);
    s.cleanupOutside();
  });

  it("応答より先に閉じた知らせが来ていたら、応答の後すぐ閉じる", async () => {
    let resolve!: (v: unknown) => void;
    const s = setup(() => new Promise((r) => (resolve = r)));
    openPopup(s.view);
    await settle();
    s.commands.notePopupClosed("p9", 2);
    resolve({ type: "popup", popupId: "p9", cols: 60, rows: 20 });
    await settle();
    expect(s.view.openDialog).toBeNull();
    expect(s.view.toasts.map((t) => t.message)).toEqual([
      "「lazygit」が終了コード 2 で終わりました。",
    ]);
    s.cleanupOutside();
  });

  it("失敗（popup が既に開いている等）はトーストで知らせて閉じる（AC6）", async () => {
    const s = setup(async () =>
      Promise.reject(
        Object.assign(new Error("command_popup_open: x"), { code: "command_popup_open" }),
      ),
    );
    openPopup(s.view);
    await settle();
    expect(s.view.openDialog).toBeNull();
    expect(s.view.toasts.map((t) => t.message)).toEqual([
      "popup がすでに開いています。先に閉じてください。",
    ]);
    s.cleanupOutside();
  });

  it("接続が切れたら要求を送らずに閉じる（サーバが止めている）", async () => {
    const s = setup();
    openPopup(s.view);
    await settle();
    s.view.onConnectionState("reconnecting");
    await settle();
    expect(s.view.openDialog).toBeNull();
    expect(s.requests.map(([m]) => m)).toEqual(["command.run", "pane.subscribe"]);
    expect(s.view.toasts.map((t) => t.message)).toEqual(["接続が切れたため popup を閉じました。"]);
    s.cleanupOutside();
  });

  it("応答を待つ間に閉じるボタンを押すと、後から来た成功の応答で popup_close を送る", async () => {
    let resolve!: (v: unknown) => void;
    const s = setup(() => new Promise((r) => (resolve = r)));
    openPopup(s.view);
    await settle();
    document.querySelector<HTMLElement>("[data-command-popup-close]")!.click();
    await settle();
    expect(s.view.openDialog).toBeNull();
    resolve({ type: "popup", popupId: "p9", cols: 60, rows: 20 });
    await settle();
    expect(s.requests.at(-1)).toEqual(["command.popup_close", { popupId: "p9" }]);
    s.cleanupOutside();
  });

  it("開いたまま部品が外れたら（本体の差し替え等）popup_close を送り、閉じる", async () => {
    const s = setup();
    openPopup(s.view);
    await settle();
    wrapper!.unmount();
    wrapper = null;
    await settle();
    expect(s.requests.at(-1)).toEqual(["command.popup_close", { popupId: "p9" }]);
    expect(s.view.openDialog).toBeNull();
    s.cleanupOutside();
  });

  it("見出しの mousedown は既定の動作（フォーカスの移動）を止め、端末の上は止めない", async () => {
    const s = setup();
    openPopup(s.view);
    await settle();
    const onTitle = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    document.querySelector(".command-popup-title")!.dispatchEvent(onTitle);
    expect(onTitle.defaultPrevented).toBe(true);
    const onTerm = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    document.querySelector(".command-popup-term")!.dispatchEvent(onTerm);
    expect(onTerm.defaultPrevented).toBe(false);
    s.cleanupOutside();
  });

  it("開いている間に別のダイアログへ差し替わったら、コマンドを止めて後始末し、フォーカスは奪わない（cross の点検）", async () => {
    const s = setup();
    openPopup(s.view);
    await settle();
    s.view.openDialogWithContext({ kind: "help" });
    await settle();
    expect(s.requests.at(-1)).toEqual(["command.popup_close", { popupId: "p9" }]);
    expect(s.sinks.has("p9")).toBe(false);
    expect(s.view.openDialog).toBe("help");
    expect(s.focused).toEqual([]);
    expect(document.querySelector(".command-popup")).toBeNull();
    s.cleanupOutside();
  });
});
