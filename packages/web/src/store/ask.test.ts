import type { AskPending } from "@sodashitsu/protocol";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useAskStore } from "./ask.js";
import { useViewStore } from "./view.js";

const ask = (askId: string, paneId = "p1"): AskPending => ({ askId, paneId, spec: { title: "T", submit: "決定", note: true, questions: [] } });

describe("ask store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("受けた順に持ち、先頭が current", () => {
    const s = useAskStore();
    expect(s.current).toBeNull();
    s.add(ask("a"));
    s.add(ask("b", "p2"));
    expect(s.current?.askId).toBe("a");
    expect(s.queue.map((q) => q.askId)).toEqual(["a", "b"]);
  });
  it("同じ askId は足さない。remove で先頭を外すと次が current。知らない id は何もしない", () => {
    const s = useAskStore();
    s.add(ask("a"));
    s.add(ask("a"));
    s.add(ask("b"));
    expect(s.queue).toHaveLength(2);
    s.remove("zzz");
    expect(s.queue).toHaveLength(2);
    s.remove("a");
    expect(s.current?.askId).toBe("b");
  });
  it("replaceAll は丸ごと置き換え（再接続の ask.subscribe の応答）、clear は空にする", () => {
    const s = useAskStore();
    s.add(ask("old"));
    s.replaceAll([ask("x"), ask("y")]);
    expect(s.queue.map((q) => q.askId)).toEqual(["x", "y"]);
    s.clear();
    expect(s.current).toBeNull();
  });
});

describe("view.modalOpen と質問のフォーム", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("askOpen が立つと modalOpen になり（キーを端末へ送らない）、ほかのダイアログとは独立", () => {
    const v = useViewStore();
    expect(v.modalOpen).toBe(false);
    v.setAskOpen(true);
    expect(v.modalOpen).toBe(true);
    expect(v.openDialog).toBeNull();
    v.openDialogWithContext({ kind: "help" } as never);
    v.closeDialog();
    expect(v.modalOpen).toBe(true); // 質問が残っている
    v.setAskOpen(false);
    expect(v.modalOpen).toBe(false);
  });
  it("開いている間に焦点の pane が閉じて差し替わったら、閉じたときに反映する（開いている間は焦点を動かさない）", () => {
    const v = useViewStore();
    v.focusPane("p1");
    v.setAskOpen(true);
    expect(v.preAskFocusPaneId).toBe("p1");
    v.retargetPreAskFocus("p2");
    expect(v.focusedPaneId).toBe("p1"); // 開いている間は動かさない（端末がフォーカスを奪うため）
    v.setAskOpen(false);
    expect(v.focusedPaneId).toBe("p2");
    expect(v.preAskFocusPaneId).toBeNull();
  });
  it("マシンの切り替えでは askOpen を触らない（AskDialog がストアの空に合わせて閉じる）", () => {
    const v = useViewStore();
    v.setAskOpen(true);
    v.resetForMachineSwitch();
    expect(v.askOpen).toBe(true);
  });
});
