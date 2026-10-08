import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { check, startFocusDropWatch, stopFocusDropWatch, FOCUS_DROP_PATROL_MS } from "./focusDrop.js";
import { installFocusOriginTracking, resetFocusOriginTracking } from "./focusOrigin.js";
import { registerScriptFrame, scriptFramesSnapshot, unregisterScriptFrame } from "./frameRegistry.js";

/** フォーカスの脱落: アプリの要素にあったフォーカスが、利用者の操作なしに body へ落ちたら、戻して数える。 */
describe("focusDrop", () => {
  let active: Element | null;
  const deps = { focusedPaneId: vi.fn<() => string | null>(), focusSelectedTerminal: vi.fn(), reportSteal: vi.fn() };
  let term: HTMLInputElement;
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    term = document.createElement("input");
    document.body.appendChild(term);
    active = term;
    vi.spyOn(document, "activeElement", "get").mockImplementation(() => active);
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    deps.focusedPaneId.mockReturnValue("p1");
    deps.focusSelectedTerminal.mockReset();
    deps.reportSteal.mockReset();
    resetFocusOriginTracking();
    installFocusOriginTracking();
    term.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    registerScriptFrame("s1", { paneId: "p1", format: "script-html" });
  });
  afterEach(() => {
    stopFocusDropWatch();
    for (const f of scriptFramesSnapshot()) unregisterScriptFrame(f.id);
    resetFocusOriginTracking();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const start = (): void => startFocusDropWatch(deps);
  const drop = (): void => {
    active = document.body;
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
  };

  it("利用者の操作なしに body へ落ちたら、元の場所へ戻し、利用者が選んでいる pane の面に 1 回数える", () => {
    start();
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS); // アプリの要素にある印
    term.focus = vi.fn(() => void (active = term));
    drop();
    expect(term.focus).toHaveBeenCalled();
    expect(deps.reportSteal).toHaveBeenCalledTimes(1);
    expect(deps.reportSteal).toHaveBeenCalledWith("s1", "p1", "script-html");
  });

  it("4ms ごとの繰り返し（落ちる→戻す→落ちる…）でも、落ちるたびに 1 回ずつ数える（サーバが 3 回で冷却）", () => {
    start();
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    term.focus = vi.fn(() => void (active = term));
    for (let i = 0; i < 5; i++) {
      drop();
      vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    }
    expect(deps.reportSteal).toHaveBeenCalledTimes(5);
  });

  it("本物のポインタ・タッチの直後（利用者が余白を押した）は数えない。合成のイベント・キーは利用者の操作に数えない（打っている最中に落とされるのが止めたい被害）", () => {
    start();
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    const real = new Event("pointerdown", { bubbles: true });
    Object.defineProperty(real, "isTrusted", { value: true });
    document.body.dispatchEvent(real);
    drop();
    expect(deps.reportSteal).not.toHaveBeenCalled();
    // 合成のイベントは数えない（中身は、親の文書にイベントを送れないが、念のため）
    vi.advanceTimersByTime(2000);
    active = term;
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    const key = new KeyboardEvent("keydown", { key: "a", bubbles: true });
    Object.defineProperty(key, "isTrusted", { value: true });
    document.body.dispatchEvent(key);
    drop();
    expect(deps.reportSteal).toHaveBeenCalledTimes(1);
  });

  it("文書がフォーカスを持たないとき（別のウィンドウ・タブ）・スクリプトの枠が載っていないときは数えない", () => {
    start();
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    drop();
    expect(deps.reportSteal).not.toHaveBeenCalled();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    active = term;
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    unregisterScriptFrame("s1");
    drop();
    expect(deps.reportSteal).not.toHaveBeenCalled();
  });

  it("利用者が選んでいる pane にスクリプトの面が無いときは、スクリプトの面が載っている pane のそれぞれに 1 回", () => {
    registerScriptFrame("s2", { paneId: "p2", format: "script-html" });
    registerScriptFrame("s3", { paneId: "p2", format: "script-html" });
    deps.focusedPaneId.mockReturnValue("p9");
    start();
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    drop();
    expect(deps.reportSteal.mock.calls.map((c) => c[1]).sort()).toEqual(["p1", "p2"]);
  });

  it("枠（表示の iframe）にフォーカスがあるのは脱落ではない（枠ごとの番が扱う）。落ちたままの body は数え直さない", () => {
    start();
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    const frame = document.createElement("iframe");
    frame.setAttribute("data-display-frame", "");
    document.body.appendChild(frame);
    active = frame;
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    active = document.body;
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    expect(deps.reportSteal).not.toHaveBeenCalled();
    term.focus = vi.fn();
    active = term;
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    drop();
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS * 5);
    expect(deps.reportSteal).toHaveBeenCalledTimes(1);
    void check;
  });
});
