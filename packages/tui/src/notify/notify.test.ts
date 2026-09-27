import type { AgentInfo } from "@sodashitsu/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrefsModel } from "../model/PrefsModel.js";
import { SessionModel } from "../model/SessionModel.js";
import { UiState } from "../model/UiState.js";
import { startedApp } from "../testing/appHarness.js";
import { agent, pane, snapshot } from "../testing/fixtures.js";
import {
  BLOCKED_DELAY_MS,
  CLOSED_TARGET_MESSAGE,
  NO_NOTIFICATION_MESSAGE,
  NotificationController,
} from "./NotificationController.js";
import {
  deliveryOf,
  detectDelivery,
  notificationSequence,
  sanitizeText,
  wrapTmux,
} from "./terminalNotify.js";

/** 通知（05 の T3。design「通知」・AC13）。 */
describe("外側の端末の判定と通知の列（herdr の terminal_notify.rs）", () => {
  it("端末の判定：kitty → OSC 99、ghostty・iTerm2・WezTerm → OSC 9、Windows Terminal → OSC 777、ほかは出さない", () => {
    const cases: [Record<string, string>, string][] = [
      [{ TERM_PROGRAM: "ghostty" }, "osc9"],
      [{ TERM_PROGRAM: "iTerm.app" }, "osc9"],
      [{ TERM_PROGRAM: "WezTerm" }, "osc9"],
      [{ KITTY_WINDOW_ID: "1" }, "osc99"],
      [{ TERM: "xterm-kitty" }, "osc99"],
      [{ TERM: "xterm-ghostty" }, "osc9"],
      [{ GHOSTTY_RESOURCES_DIR: "/x" }, "osc9"],
      [{ TERM: "wezterm" }, "osc9"],
      [{ WT_SESSION: "abc" }, "osc777"],
      [{ TERM_PROGRAM: "vscode", TERM: "xterm-256color" }, "none"],
      [{}, "none"],
    ];
    for (const [env, want] of cases) expect(detectDelivery(env)).toBe(want);
  });

  it("設定 tui.notifyDelivery が判定より先（SSH 越し用）。off は出さない", () => {
    expect(deliveryOf("auto", { WT_SESSION: "1" })).toBe("osc777");
    expect(deliveryOf("osc9", {})).toBe("osc9");
    expect(deliveryOf("bell", { KITTY_WINDOW_ID: "1" })).toBe("bell");
    expect(deliveryOf("off", { KITTY_WINDOW_ID: "1" })).toBe("none");
  });

  it("列：OSC 9・99・777・ベル。tmux の中は素通しの包み。ESC・BEL を落とし改行は空白", () => {
    expect(notificationSequence("osc9", "完了: a", "w / t", false)).toBe(
      "\x1b]9;完了: a: w / t\x1b\\",
    );
    expect(notificationSequence("osc99", "T", "B", false)).toBe(
      "\x1b]99;i=1:d=0;T\x1b\\\x1b]99;i=1:p=body;B\x1b\\",
    );
    expect(notificationSequence("osc99", "T", "", false)).toBe("\x1b]99;;T\x1b\\");
    expect(notificationSequence("osc777", "a;b", "c", false)).toBe("\x1b]777;notify;a，b;c\x1b\\");
    expect(notificationSequence("bell", "T", "B", true)).toBe("\x07");
    expect(notificationSequence("none", "T", "B", false)).toBe("");
    expect(notificationSequence("osc9", "hi", "", true)).toBe(wrapTmux("\x1b]9;hi\x1b\\"));
    expect(wrapTmux("\x1b]9;hi\x1b\\")).toBe("\x1bPtmux;\x1b\x1b]9;hi\x1b\x1b\\\x1b\\");
    expect(sanitizeText("a\n\tb\x1bc\x07\x9c")).toBe("a  bc");
  });
});

describe("NotificationController（web と同じ判定）", () => {
  function setup(
    opts: { focused?: boolean; visible?: string[]; env?: Record<string, string> } = {},
  ) {
    const model = new SessionModel();
    model.applySnapshot(
      snapshot({
        panes: [
          pane("p1", "t1"),
          pane("p2", "t1"),
          pane("p3", "t2", {
            agent: agent({ instanceId: "a3", state: "working", label: "Claude" }),
          }),
        ],
      }),
      "c1",
    );
    const ui = new UiState(model, () => undefined);
    const prefs = new PrefsModel();
    prefs.apply({ notify: { toast: true, desktop: true, sound: true } }, 1);
    const written: string[] = [];
    const focused: string[] = [];
    const timers: { fn: () => void; ms: number }[] = [];
    const state = { focused: opts.focused ?? true, visible: new Set(opts.visible ?? ["p1", "p2"]) };
    const n = new NotificationController({
      model,
      ui,
      prefs,
      env: opts.env ?? {},
      hasFocus: () => state.focused,
      isPaneVisible: (id) => state.visible.has(id),
      write: (s) => written.push(s),
      focusPane: (id) => {
        focused.push(id);
        model.focusPane(id);
      },
      setTimer: (fn, ms) => {
        timers.push({ fn, ms });
        return 0 as unknown as ReturnType<typeof setTimeout>;
      },
    });
    const change = (paneId: string, next: Partial<AgentInfo>) => {
      const prev = model.panes.get(paneId)!.agent;
      const a = { ...prev!, ...next };
      model.panes.set(paneId, { ...model.panes.get(paneId)!, agent: a });
      n.onAgentChanged(paneId, prev, a);
    };
    return { model, ui, prefs, n, written, focused, timers, state, change };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it("入力待ちは 1 秒続いてから。見えていない pane ならトースト（押すと移る）と行き先。見ている pane は何も出さない", async () => {
    const s = setup();
    s.change("p3", { state: "blocked", since: 5 });
    expect(s.timers.map((t) => t.ms)).toEqual([BLOCKED_DELAY_MS]);
    s.timers[0]!.fn();
    expect(s.ui.toasts.map((t) => t.message)).toEqual(["Claude（w2 / t2）が入力待ちです"]);
    expect(s.n.queued).toHaveLength(1);
    // フォーカスはあるので、デスクトップ通知・ベルは出さない（離れているときだけ）。
    expect(s.written).toEqual([]);
    s.ui.clickToast(s.ui.toasts[0]!.id);
    expect(s.focused).toEqual(["p3"]);
    expect(s.n.queued).toHaveLength(0);
    // 見ている pane の完了は何も出さない。
    s.state.visible.add("p3");
    s.change("p3", { state: "idle", completionSeq: 1 });
    await tick();
    expect(s.ui.toasts).toHaveLength(0);
    expect(s.n.queued).toHaveLength(0);
  });

  it("外側の端末を離れているとき：デスクトップ通知（tmux の中は包む）とベル", async () => {
    const s = setup({ focused: false, env: { TERM_PROGRAM: "WezTerm", TMUX: "/tmp/tmux" } });
    s.change("p3", { state: "idle", completionSeq: 1 });
    await tick();
    expect(s.written).toEqual([wrapTmux("\x1b]9;完了: Claude: w2 / t2\x1b\\") + "\x07"]);
    // 設定でベルに寄せたら、ベルは 1 回だけ。
    s.prefs.apply(
      { notify: { toast: true, desktop: true, sound: true }, tui: { notifyDelivery: "bell" } },
      2,
    );
    s.change("p3", { completionSeq: 2 });
    await tick();
    expect(s.written[1]).toBe("\x07");
  });

  it("最初のスナップショットは判定済みにするだけ。再接続のスナップショットは切れていた間の出来事を知らせる", async () => {
    const s = setup();
    const withDone = { paneId: "p3", agent: agent({ instanceId: "a3", completionSeq: 3 }) };
    s.n.onSnapshotApplied([withDone], true);
    await tick();
    expect(s.ui.toasts).toHaveLength(0);
    s.n.onSnapshotApplied(
      [{ paneId: "p3", agent: agent({ instanceId: "a3", completionSeq: 4 }) }],
      false,
    );
    await tick();
    expect(s.ui.toasts.map((t) => t.message)).toEqual(["Claude（w2 / t2）が完了しました"]);
  });

  it("prefix+o：いちばん古い知らせへ移る。無ければ知らせ、対象が閉じていれば飛ばして知らせる", async () => {
    const s = setup();
    s.n.focusNext();
    expect(s.ui.toasts.map((t) => t.message)).toEqual([NO_NOTIFICATION_MESSAGE]);
    s.change("p3", { state: "idle", completionSeq: 1 });
    await tick();
    s.model.panes.delete("p3");
    s.n.focusNext();
    expect(s.ui.toasts.map((t) => t.message)).toContain(CLOSED_TARGET_MESSAGE);
    expect(s.focused).toEqual([]);
    expect(s.n.queued).toHaveLength(0);
  });

  it("pane が閉じたら判定の印と行き先・トーストを消す", async () => {
    const s = setup();
    s.change("p3", { state: "idle", completionSeq: 1 });
    await tick();
    expect(s.ui.toasts).toHaveLength(1);
    s.n.onPaneClosed("p3");
    expect(s.n.queued).toHaveLength(0);
    expect(s.ui.toasts).toHaveLength(0);
  });
});

describe("端末版の通知（組み立て）", () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of closers.splice(0)) await c();
  });

  it("トーストを押すと対象へ移り、prefix+o でも移る。全体のメニューから知らせの一覧を開ける", async () => {
    const snap = snapshot({
      panes: [
        pane("p1", "t1"),
        pane("p2", "t1"),
        pane("p3", "t2", { agent: agent({ instanceId: "a3", state: "working", label: "Claude" }) }),
      ],
    });
    const h = await startedApp({ snapshot: snap });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    const done = (seq: number) =>
      h.ws.event("pane.agent_status_changed", {
        paneId: "p3",
        agent: agent({ instanceId: "a3", state: "idle", label: "Claude", completionSeq: seq }),
      });
    done(1);
    await vi.waitFor(() => expect(h.app.ui.toasts).toHaveLength(1));
    h.app.renderNow();
    const hits = (h.app as unknown as { toastHits: { x: number; y: number }[] }).toastHits;
    expect(hits).toHaveLength(1);
    h.io.type(
      `\x1b[<0;${hits[0]!.x + 2};${hits[0]!.y + 1}M\x1b[<0;${hits[0]!.x + 2};${hits[0]!.y + 1}m`,
    );
    await vi.waitFor(() => expect(h.app.model.focusedPaneId).toBe("p3"));
    // 戻って、次の完了は prefix+o で。
    h.app.model.focusPane("p1");
    done(2);
    await vi.waitFor(() => expect(h.app.notify.queued).toHaveLength(1));
    // 知らせの一覧（全体のメニュー）。
    h.app.ui.openContextMenu({ kind: "global" }, { x: 40, y: 10 });
    h.app.renderNow();
    expect(await h.screen()).toContain("知らせの一覧");
    h.app.ui.closeContextMenu();
    h.app.ui.openDialogWithContext({ kind: "notifications" });
    h.app.renderNow();
    expect(await h.screen()).toContain("知らせ（1 件）");
    h.io.type("\r");
    await vi.waitFor(() => expect(h.app.model.focusedPaneId).toBe("p3"));
    expect(h.app.notify.queued).toHaveLength(0);
    h.app.model.focusPane("p1");
    done(3);
    await vi.waitFor(() => expect(h.app.notify.queued).toHaveLength(1));
    h.io.type("\x02o");
    await vi.waitFor(() => expect(h.app.model.focusedPaneId).toBe("p3"));
  });
});
