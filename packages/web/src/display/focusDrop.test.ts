import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startFocusDropWatch, stopFocusDropWatch, FOCUS_DROP_NOTICE_COUNT, FOCUS_DROP_NOTICE_EVERY_MS, FOCUS_DROP_PATROL_MS } from "./focusDrop.js";
import { installFocusOriginTracking, resetFocusOriginTracking } from "./focusOrigin.js";
import { registerScriptFrame, scriptFramesSnapshot, unregisterScriptFrame } from "./frameRegistry.js";

/**
 * フォーカスの脱落: アプリの要素にあったフォーカスが body へ落ちたら、**戻すだけ**（数えない・サーバへ知らせない）。
 * 利用者が自分で外した場合（余白を押した・要素が無くなった・ウィンドウが離れた）は戻さない。端末（フォーカスを受ける要素）を押した直後の脱落は戻す。
 */
describe("focusDrop", () => {
  let active: Element | null;
  const deps = { focusSelectedTerminal: vi.fn(), notify: vi.fn() };
  let term: HTMLInputElement;
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    term = document.createElement("input");
    term.getClientRects = () => [{}] as unknown as DOMRectList; // 見えている
    document.body.appendChild(term);
    active = term;
    vi.spyOn(document, "activeElement", "get").mockImplementation(() => active);
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    deps.focusSelectedTerminal.mockReset();
    deps.notify.mockReset();
    resetFocusOriginTracking();
    installFocusOriginTracking();
    term.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    registerScriptFrame("s1", { paneId: "p1", format: "script-html", name: "g" });
  });
  afterEach(() => {
    stopFocusDropWatch();
    for (const f of scriptFramesSnapshot()) unregisterScriptFrame(f.id);
    resetFocusOriginTracking();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const start = (): void => {
    startFocusDropWatch(deps);
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS); // アプリの要素にある印
  };
  const drop = (): void => {
    active = document.body;
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
  };
  const pointer = (target: Element, trusted = true): void => {
    const e = new Event("pointerdown", { bubbles: true });
    if (trusted) Object.defineProperty(e, "isTrusted", { value: true });
    target.dispatchEvent(e);
  };

  it("body へ落ちたら、元の場所へ戻す。数えない（サーバへ知らせる依存が無い）", () => {
    start();
    term.focus = vi.fn(() => void (active = term));
    drop();
    expect(term.focus).toHaveBeenCalled();
    expect(active).toBe(term);
  });

  it("戻したあとも検知を続ける: 落ちる→戻す→落ちる…を、落ちるたびに戻す（4ms ごとの繰り返しの相当）", () => {
    start();
    term.focus = vi.fn(() => void (active = term));
    for (let i = 0; i < 5; i++) {
      drop();
      expect(active).toBe(term);
    }
    expect(term.focus).toHaveBeenCalledTimes(5);
  });

  it("利用者が端末（フォーカスを受ける要素）を押した直後の脱落も、戻す（クリックの直後 1 秒を免除にしない）。免除のあとも次の脱落を見る", () => {
    start();
    term.focus = vi.fn(() => void (active = term));
    pointer(term); // フォーカスを受ける要素を押した
    drop();
    expect(term.focus).toHaveBeenCalledTimes(1);
    drop();
    expect(term.focus).toHaveBeenCalledTimes(2);
  });

  it("余白（フォーカスを受けない要素）を押して外した脱落は、戻さない。そのあとの次の脱落は戻す", () => {
    start();
    term.focus = vi.fn(() => void (active = term));
    const margin = document.createElement("div");
    document.body.appendChild(margin);
    pointer(margin);
    drop();
    expect(term.focus).not.toHaveBeenCalled();
    expect(deps.focusSelectedTerminal).not.toHaveBeenCalled();
    // 利用者が端末へ戻り、そのあとスクリプトが落とした
    vi.advanceTimersByTime(2000);
    active = term;
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    drop();
    expect(term.focus).toHaveBeenCalledTimes(1);
  });

  it("合成のポインタ（isTrusted でない）は、利用者の操作に数えない", () => {
    start();
    term.focus = vi.fn(() => void (active = term));
    const margin = document.createElement("div");
    document.body.appendChild(margin);
    pointer(margin, false);
    drop();
    expect(term.focus).toHaveBeenCalledTimes(1);
  });

  it("フォーカスのあった要素が文書から外れた・隠れた（ダイアログ・メニュー・重ね表示を閉じた、pane・タブが替わった）ときは、戻さない", () => {
    start();
    term.focus = vi.fn(() => void (active = term));
    term.remove(); // アプリが外した
    drop();
    expect(term.focus).not.toHaveBeenCalled();
    expect(deps.focusSelectedTerminal).not.toHaveBeenCalled();
  });

  it("文書がフォーカスを持たないとき（別のウィンドウ・タブ）は戻さない。スクリプトの枠が載っていないときも戻さない", () => {
    start();
    term.focus = vi.fn(() => void (active = term));
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    drop();
    expect(term.focus).not.toHaveBeenCalled();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    active = term;
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    unregisterScriptFrame("s1");
    drop();
    expect(term.focus).not.toHaveBeenCalled();
  });

  it("短い間に何度も戻したら、利用者への知らせを 1 回出す（面の名前を並べる。自動では閉じない）。間隔をあけるまで、もう出さない", () => {
    registerScriptFrame("s2", { paneId: "p2", format: "script-html", name: "evil" });
    start();
    term.focus = vi.fn(() => void (active = term));
    for (let i = 0; i < FOCUS_DROP_NOTICE_COUNT + 3; i++) {
      drop();
      vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    }
    expect(deps.notify).toHaveBeenCalledTimes(1);
    expect(deps.notify.mock.calls[0]![0]).toContain("入力のフォーカスを繰り返し外しています");
    expect(deps.notify.mock.calls[0]![0]).toContain("evil");
    vi.advanceTimersByTime(FOCUS_DROP_NOTICE_EVERY_MS);
    for (let i = 0; i < FOCUS_DROP_NOTICE_COUNT; i++) {
      drop();
      vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    }
    expect(deps.notify).toHaveBeenCalledTimes(2);
  });

  it("枠（表示の iframe）にフォーカスがあるのは脱落ではない（枠ごとの番が扱う）。戻せなかった body は数え直さない", () => {
    start();
    const frame = document.createElement("iframe");
    frame.setAttribute("data-display-frame", "");
    document.body.appendChild(frame);
    active = frame;
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    active = document.body;
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    expect(deps.focusSelectedTerminal).not.toHaveBeenCalled();
    term.focus = vi.fn();
    active = term;
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    drop();
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS * 5);
    expect(deps.focusSelectedTerminal).toHaveBeenCalledTimes(1);
  });
});
