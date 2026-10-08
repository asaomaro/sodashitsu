import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FOCUS_DROP_BREAKER_COUNT,
  FOCUS_DROP_NOTICE_COUNT,
  FOCUS_DROP_NOTICE_EVERY_MS,
  FOCUS_DROP_PATROL_MS,
  noteFocusRestored,
  startFocusDropWatch,
  stopFocusDropWatch,
} from "./focusDrop.js";
import { installFocusOriginTracking, resetFocusOriginTracking } from "./focusOrigin.js";
import { registerScriptFrame, scriptFramesSnapshot, setFrameEngaged, unregisterScriptFrame } from "./frameRegistry.js";

/**
 * フォーカスの脱落（5 回目の再レビューで、状態を持たない作りに替えた）。見回りのたびに、いまの状態だけで決める:
 *   `activeElement` が body ・ 文書がフォーカスを持つ ・ 操作中の枠が無い  →  戻し先（アプリの要素。無い・隠れていれば選んでいる pane の端末）へ戻す。
 * 「利用者が自分で外した」の免除は無い。一度戻さなかったら以後も見なくなる、という状態を持たない。
 */
describe("focusDrop（状態を持たない）", () => {
  let active: Element | null;
  let hasFocus = true;
  const deps = { focusSelectedTerminal: vi.fn(), notify: vi.fn(), trip: vi.fn() };
  let term: HTMLInputElement;
  let other: HTMLInputElement; // 別のアプリの要素（ダイアログの入力欄など）
  let frame: HTMLIFrameElement;
  const shown = (el: Element): void => void ((el as HTMLElement).getClientRects = () => [{}] as unknown as DOMRectList);
  /** 端末を、押されても動けるフォーカス先にする（戻したら activeElement になる）。 */
  const focusable = (el: HTMLElement): void => void (el.focus = vi.fn(() => void (active = el)));
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    term = document.createElement("input");
    other = document.createElement("input");
    frame = document.createElement("iframe");
    frame.setAttribute("data-display-frame", "");
    for (const e of [term, other, frame]) {
      shown(e);
      document.body.appendChild(e);
    }
    focusable(term);
    focusable(other);
    active = term;
    hasFocus = true;
    vi.spyOn(document, "activeElement", "get").mockImplementation(() => active);
    vi.spyOn(document, "hasFocus").mockImplementation(() => hasFocus);
    deps.focusSelectedTerminal.mockReset();
    deps.focusSelectedTerminal.mockImplementation(() => void (active = term));
    deps.notify.mockReset();
    deps.trip.mockReset();
    resetFocusOriginTracking();
    installFocusOriginTracking();
    term.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); // 戻し先の記憶
    registerScriptFrame("s1", { paneId: "p1", format: "script-html", name: "g" });
  });
  afterEach(() => {
    stopFocusDropWatch();
    for (const f of scriptFramesSnapshot()) unregisterScriptFrame(f.id);
    setFrameEngaged("s1", false);
    resetFocusOriginTracking();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const start = (): void => {
    startFocusDropWatch(deps);
    vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS);
  };
  const patrol = (n = 1): void => void vi.advanceTimersByTime(FOCUS_DROP_PATROL_MS * n);
  const drop = (): void => {
    active = document.body;
    term.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
    patrol();
  };

  // ---- 見回りの各状態の組み合わせ ------------------------------------------------------------------
  type Expect = "origin" | "terminal" | "none";
  interface Row {
    name: string;
    active: () => Element;
    hasFocus: boolean;
    engaged: boolean;
    origin: "live" | "removed" | "hidden" | "none";
    expect: Expect;
    /** 「戻さない」結果のあと、この変更を入れたら、次の見回りで戻る。 */
    then?: () => void;
  }
  const rows: Row[] = [
    { name: "body・文書あり・操作中なし・戻し先あり", active: () => document.body, hasFocus: true, engaged: false, origin: "live", expect: "origin" },
    { name: "body・文書あり・操作中なし・戻し先が外れた → 端末", active: () => document.body, hasFocus: true, engaged: false, origin: "removed", expect: "terminal" },
    { name: "body・文書あり・操作中なし・戻し先が隠れた（閉じたダイアログの要素）→ 端末", active: () => document.body, hasFocus: true, engaged: false, origin: "hidden", expect: "terminal" },
    { name: "body・文書あり・操作中なし・戻し先が無い → 端末", active: () => document.body, hasFocus: true, engaged: false, origin: "none", expect: "terminal" },
    { name: "body・文書なし（別のウィンドウ・ブラウザの UI）→ 戻さない", active: () => document.body, hasFocus: false, engaged: false, origin: "live", expect: "none", then: () => void (hasFocus = true) },
    { name: "body・文書あり・操作中の枠がある → 戻さない", active: () => document.body, hasFocus: true, engaged: true, origin: "live", expect: "none", then: () => setFrameEngaged("s1", false) },
    { name: "アプリの別の要素（ダイアログ・入力欄）→ 脱落ではない", active: () => other, hasFocus: true, engaged: false, origin: "live", expect: "none" },
    { name: "枠（操作中でない）→ 枠ごとの番が戻す。ここでは何もしない", active: () => frame, hasFocus: true, engaged: false, origin: "live", expect: "none" },
    { name: "枠（操作中）→ 利用者の操作。何もしない", active: () => frame, hasFocus: true, engaged: true, origin: "live", expect: "none" },
  ];
  for (const r of rows) {
    it(`${r.name}`, () => {
      start();
      const originEl = term;
      if (r.origin === "removed") originEl.remove();
      if (r.origin === "hidden") originEl.getClientRects = () => [] as unknown as DOMRectList;
      if (r.origin === "none") {
        resetFocusOriginTracking();
        installFocusOriginTracking();
      }
      hasFocus = r.hasFocus;
      setFrameEngaged("s1", r.engaged);
      active = r.active();
      patrol(2);
      if (r.expect === "origin") {
        expect(originEl.focus).toHaveBeenCalled();
        expect(active).toBe(originEl);
        expect(deps.focusSelectedTerminal).not.toHaveBeenCalled();
      } else if (r.expect === "terminal") {
        expect(deps.focusSelectedTerminal).toHaveBeenCalled();
        expect(active).toBe(term);
      } else {
        expect(originEl.focus).not.toHaveBeenCalled();
        expect(deps.focusSelectedTerminal).not.toHaveBeenCalled();
        expect(active).toBe(r.active());
      }
      if (r.expect === "none" && r.then) {
        // 戻さない結果のあとに、状態が変われば、次の見回りで戻す（一度戻さなかったら以後も見なくなる、が無い）
        r.then();
        active = document.body;
        patrol(2);
        expect(originEl.focus).toHaveBeenCalled();
      }
    });
  }

  it("枠が取る・body へ落ちる、が交互に来ても（見回りの位相がどちらでも）、body のたびに戻す。枠のあとの body も戻す", () => {
    start();
    for (let i = 0; i < 6; i++) {
      active = frame;
      patrol();
      active = document.body;
      patrol();
      expect(active).toBe(term);
    }
    expect(term.focus).toHaveBeenCalledTimes(6);
  });

  it("押下の直後でも、押した先がどこでも、focusout の relatedTarget が何でも、戻す（免除が無い）", () => {
    start();
    const margin = document.createElement("div");
    document.body.appendChild(margin);
    for (const ev of ["pointerdown", "mousedown", "touchstart"]) {
      const e = new Event(ev, { bubbles: true });
      Object.defineProperty(e, "isTrusted", { value: true });
      margin.dispatchEvent(e);
      active = document.body;
      term.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
      vi.advanceTimersByTime(0);
      patrol();
      expect(active).toBe(term);
    }
    expect(term.focus).toHaveBeenCalledTimes(3);
  });

  it("スクリプトの枠が載っていないときは見ない", () => {
    start();
    unregisterScriptFrame("s1");
    active = document.body;
    patrol(3);
    expect(term.focus).not.toHaveBeenCalled();
  });

  it("戻し先も端末も動かせないとき（端末が無い）は、数えない。見回りのたびに遮断器が働くことはない", () => {
    start();
    deps.focusSelectedTerminal.mockImplementation(() => {});
    term.remove();
    active = document.body;
    patrol(FOCUS_DROP_BREAKER_COUNT * 3);
    expect(deps.trip).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
    // 端末が現れたら、次の見回りで戻す
    deps.focusSelectedTerminal.mockImplementation(() => void (active = term));
    patrol(2);
    expect(active).toBe(term);
  });

  it("短い間に何度も戻したら、利用者への知らせを 1 回出す（面の名前を並べる）。間隔をあけるまで、もう出さない", () => {
    registerScriptFrame("s2", { paneId: "p2", format: "script-html", name: "evil" });
    start();
    for (let i = 0; i < FOCUS_DROP_NOTICE_COUNT + 3; i++) {
      drop();
      patrol();
    }
    expect(deps.notify).toHaveBeenCalledTimes(1);
    expect(deps.notify.mock.calls[0]![0]).toContain("入力のフォーカスを繰り返し外しています");
    expect(deps.notify.mock.calls[0]![0]).toContain("evil");
    vi.advanceTimersByTime(FOCUS_DROP_NOTICE_EVERY_MS);
    for (let i = 0; i < FOCUS_DROP_NOTICE_COUNT; i++) {
      drop();
      patrol();
    }
    expect(deps.notify).toHaveBeenCalledTimes(2);
  });

  it("遮断器: 3 秒に 15 回戻したら trip。ゆっくりした落とし（300ms ごと）は止めない", () => {
    start();
    for (let i = 0; i < 12; i++) {
      drop();
      vi.advanceTimersByTime(300);
    }
    expect(deps.trip).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalled();
    for (let i = 0; i < FOCUS_DROP_BREAKER_COUNT + 2; i++) {
      drop();
      patrol();
    }
    expect(deps.trip).toHaveBeenCalledTimes(1);
  });

  it("遮断器: 余白を押すふつうの操作（1 秒に 1 回）では働かない", () => {
    start();
    for (let i = 0; i < 30; i++) {
      drop();
      vi.advanceTimersByTime(1000);
    }
    expect(deps.trip).not.toHaveBeenCalled();
  });

  it("枠が取る・body へ落とすが交互に来る面でも、遮断器が働く。枠ごとの番の戻し（noteFocusRestored）も同じ数に入る", () => {
    start();
    for (let i = 0; i < FOCUS_DROP_BREAKER_COUNT + 2; i++) {
      active = frame;
      patrol();
      drop();
    }
    expect(deps.trip).toHaveBeenCalledTimes(1);
    deps.trip.mockReset();
    vi.advanceTimersByTime(5000);
    for (let i = 0; i < FOCUS_DROP_BREAKER_COUNT - 1; i++) noteFocusRestored();
    expect(deps.trip).not.toHaveBeenCalled();
    noteFocusRestored();
    expect(deps.trip).toHaveBeenCalledTimes(1);
  });

  it("遮断器が働いた直後、枠が外れるまでの間に落とされた body は、遅れて戻す（数えない）", () => {
    start();
    for (let i = 0; i < FOCUS_DROP_BREAKER_COUNT; i++) {
      drop();
      vi.advanceTimersByTime(10);
    }
    expect(deps.trip).toHaveBeenCalledTimes(1);
    const before = (term.focus as ReturnType<typeof vi.fn>).mock.calls.length;
    active = document.body;
    vi.advanceTimersByTime(300);
    expect((term.focus as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(before);
    expect(active).toBe(term);
  });
});
