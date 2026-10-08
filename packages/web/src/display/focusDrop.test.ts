import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { noteFocusRestored, startFocusDropWatch, stopFocusDropWatch, FOCUS_DROP_BREAKER_COUNT, FOCUS_DROP_NOTICE_COUNT, FOCUS_DROP_NOTICE_EVERY_MS, FOCUS_DROP_PATROL_MS } from "./focusDrop.js";
import { installFocusOriginTracking, resetFocusOriginTracking } from "./focusOrigin.js";
import { registerScriptFrame, scriptFramesSnapshot, setFrameEngaged, unregisterScriptFrame } from "./frameRegistry.js";

/**
 * フォーカスの脱落: アプリの要素にあったフォーカスが body へ落ちたら、**戻すだけ**（数えない・サーバへ知らせない）。
 * 利用者が自分で外した場合（余白を押した・要素が無くなった・ウィンドウが離れた）は戻さない。端末（フォーカスを受ける要素）を押した直後の脱落は戻す。
 */
describe("focusDrop", () => {
  let active: Element | null;
  const deps = { focusSelectedTerminal: vi.fn(), notify: vi.fn(), trip: vi.fn() };
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
    deps.trip.mockReset();
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
    term.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null })); // フォーカスがどこへも移らず外れた
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
  };
  const PRESS_GAP_MS = 120;
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

  it("利用者が端末を押した後（フォーカスは端末へ移った）の脱落は、押下の直後でも戻す。免除のあとも次の脱落を見る", () => {
    start();
    term.focus = vi.fn(() => void (active = term));
    pointer(term); // 押した（フォーカスは端末のまま）
    vi.advanceTimersByTime(PRESS_GAP_MS); // 押下から 50ms より後に落とされた
    drop();
    expect(term.focus).toHaveBeenCalledTimes(1);
    drop();
    expect(term.focus).toHaveBeenCalledTimes(2);
  });

  it("覆いなど、押してもフォーカスが動かない場所を押した後の脱落は、戻す（押した先の種類では決めない）", () => {
    start();
    term.focus = vi.fn(() => void (active = term));
    const cover = document.createElement("div");
    cover.className = "display-frame-cover";
    document.body.appendChild(cover);
    pointer(cover); // フォーカスは動かない（focusout が起きない）
    vi.advanceTimersByTime(PRESS_GAP_MS);
    drop();
    expect(term.focus).toHaveBeenCalledTimes(1);
  });

  it("余白を押して、その直後にフォーカスが body へ移った（利用者が自分で外した）脱落は、戻さない。そのあとの次の脱落は戻す", () => {
    start();
    term.focus = vi.fn(() => void (active = term));
    const margin = document.createElement("div");
    document.body.appendChild(margin);
    pointer(margin);
    drop(); // 押下の処理の最中（同じタスク）に、フォーカスが body へ移る
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

  /** 枠（表示の iframe）を作る。`engaged` は、利用者が［操作する］で操作を始めた枠。 */
  const makeFrame = (): HTMLIFrameElement => {
    const frame = document.createElement("iframe");
    frame.setAttribute("data-display-frame", "");
    document.body.appendChild(frame);
    return frame;
  };

  it("枠が取っただけでは、印（アプリの要素にフォーカスがあった）を捨てない。見回りが枠を先に見て、次に body を見ても、戻す（交互に来る面の穴）", () => {
    start();
    term.focus = vi.fn(() => void (active = term));
    const frame = makeFrame();
    active = frame; // window.focus(): 枠が取った（見回りが先にこれを見る）
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    active = document.body; // parent.focus(): body へ落ちた
    term.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    expect(term.focus).toHaveBeenCalledTimes(1);
    expect(active).toBe(term);
  });

  it("見回りの位相: 枠 → body、body → 枠 → body のどちらの順で見ても、戻す。戻したぶんは遮断器の数に入る", () => {
    start();
    term.focus = vi.fn(() => void (active = term));
    const frame = makeFrame();
    // 位相 A: 枠を先に見る
    active = frame;
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    drop();
    expect(term.focus).toHaveBeenCalledTimes(1);
    // 位相 B: body を先に見て、戻して、また枠・body
    drop();
    expect(term.focus).toHaveBeenCalledTimes(2);
    active = frame;
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    drop();
    expect(term.focus).toHaveBeenCalledTimes(3);
  });

  it("枠が取る・body へ落とすが交互に来る面（rAF・MessageChannel）でも、毎回戻し、遮断器が働く", () => {
    start();
    term.focus = vi.fn(() => void (active = term));
    const frame = makeFrame();
    for (let i = 0; i < FOCUS_DROP_BREAKER_COUNT + 2; i++) {
      active = frame;
      vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
      drop();
    }
    expect(deps.trip).toHaveBeenCalledTimes(1);
    expect(active).toBe(term);
  });

  it("枠ごとの番が戻した分（noteFocusRestored）も、同じ遮断器の数に入る。1 回の出来事は 1 か所でしか数えない", () => {
    start();
    for (let i = 0; i < FOCUS_DROP_BREAKER_COUNT - 1; i++) noteFocusRestored();
    expect(deps.trip).not.toHaveBeenCalled();
    noteFocusRestored();
    expect(deps.trip).toHaveBeenCalledTimes(1);
    // 二重に数えない: 枠が取って（番が戻す）、アプリの要素に戻ったあとの見回りは、戻しに数えない
    deps.trip.mockReset();
    term.focus = vi.fn(() => void (active = term));
    active = term;
    for (let i = 0; i < 10; i++) {
      noteFocusRestored();
      vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    }
    expect(deps.trip).not.toHaveBeenCalled();
    expect(term.focus).not.toHaveBeenCalled();
  });

  it("利用者が操作を始めた枠（engaged）にフォーカスがあるあいだに body へ落ちても、戻さない（利用者の操作。印は捨てる）。操作を終えてアプリの要素に戻れば、また見る", () => {
    start();
    term.focus = vi.fn(() => void (active = term));
    const frame = makeFrame();
    setFrameEngaged("s1", true);
    active = frame;
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    drop();
    expect(term.focus).not.toHaveBeenCalled();
    setFrameEngaged("s1", false);
    active = term; // 操作を終えて端末へ
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    drop();
    expect(term.focus).toHaveBeenCalledTimes(1);
  });

  it("別のウィンドウ・ブラウザの UI から戻った直後の body は、戻さない（印を捨てる）。そのあと端末に触れれば、また見る", () => {
    start();
    term.focus = vi.fn(() => void (active = term));
    const hasFocus = vi.spyOn(document, "hasFocus");
    hasFocus.mockReturnValue(false);
    window.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(1); // 文書がフォーカスを持たない
    hasFocus.mockReturnValue(true);
    window.dispatchEvent(new Event("focus")); // 戻った
    drop();
    expect(term.focus).not.toHaveBeenCalled();
    active = term;
    term.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    vi.advanceTimersByTime(1100); // 戻った直後ではなくなる
    drop();
    expect(term.focus).toHaveBeenCalledTimes(1);
  });

  it("遮断器が働いた直後、枠が外れるまでの間に落とされた body は、遅れて戻す（0・60・200ms 後の見回り）", () => {
    start();
    term.focus = vi.fn(() => void (active = term));
    for (let i = 0; i < FOCUS_DROP_BREAKER_COUNT; i++) {
      drop();
      vi.advanceTimersByTime(10);
    }
    expect(deps.trip).toHaveBeenCalledTimes(1);
    const before = term.focus.mock.calls.length;
    active = document.body; // 止めた枠が外れる前の、最後の脱落
    vi.advanceTimersByTime(300);
    expect(term.focus.mock.calls.length).toBeGreaterThan(before);
    expect(active).toBe(term);
  });

  it("戻せなかった body は数え直さない（戻し先が無い）", () => {
    start();
    term.focus = vi.fn();
    drop();
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS * 5);
    expect(deps.focusSelectedTerminal).toHaveBeenCalledTimes(1);
  });

  it("遮断器: 3 秒に 15 回戻したら、この画面のスクリプトの枠を全部止める（trip）。ゆっくりした落とし（300ms ごと）・知らせの線（5 回）だけでは止めない", () => {
    start();
    term.focus = vi.fn(() => void (active = term));
    // 300ms ごと: 3 秒に約 10 回 → 止めない
    for (let i = 0; i < 12; i++) {
      drop();
      vi.advanceTimersByTime(300);
    }
    expect(deps.trip).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalled(); // 知らせは出ている
    // 毎フレーム相当: 25ms ごと → 15 回で止める
    for (let i = 0; i < FOCUS_DROP_BREAKER_COUNT + 2; i++) {
      drop();
      vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
    }
    expect(deps.trip).toHaveBeenCalledTimes(1);
  });
});
