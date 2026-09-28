import { describe, expect, it } from "vitest";
import { displayBinding, type LayoutMap } from "./chordDisplay.js";

function layoutMap(entries: Record<string, string>): LayoutMap {
  const m = new Map(Object.entries(entries));
  return { get: (code) => m.get(code) };
}

describe("displayBinding（20260922-keybinding-usability。design「US3」・AC8〜AC10）", () => {
  it("layoutMap が null なら元の binding をそのまま返す（AC9）", () => {
    expect(displayBinding("alt+w", null)).toBe("alt+w");
    expect(displayBinding("prefix+alt+w", null)).toBe("prefix+alt+w");
  });

  it("alt を含む英字 1 文字の binding で、layoutMap が別の文字を返すとき置き換わる（AC8）", () => {
    const lm = layoutMap({ KeyW: "z" }); // 例：AZERTY で物理 W キーは z を打つ
    expect(displayBinding("alt+w", lm)).toBe("alt+z");
    expect(displayBinding("prefix+alt+w", lm)).toBe("prefix+alt+z");
  });

  it("shift を伴う alt の chord も、大文字の配列文字なら shift 付きで置き換わる", () => {
    const lm = layoutMap({ KeyW: "z" });
    expect(displayBinding("alt+shift+w", lm)).toBe("alt+shift+z");
  });

  it("layoutMap に対応する code が無い・変わらないときは元の表示のまま", () => {
    const lm = layoutMap({});
    expect(displayBinding("alt+w", lm)).toBe("alt+w");
    const same = layoutMap({ KeyW: "w" });
    expect(displayBinding("alt+w", same)).toBe("alt+w");
  });

  it("ctrl・cmd を含む binding は対象外（Option の文字化けとは無関係）", () => {
    const lm = layoutMap({ KeyW: "z" });
    expect(displayBinding("ctrl+alt+w", lm)).toBe("ctrl+alt+w");
    expect(displayBinding("cmd+alt+w", lm)).toBe("cmd+alt+w");
  });

  it("英字 1 文字でない binding（名前のあるキー・数字・記号）は対象外", () => {
    const lm = layoutMap({ KeyW: "z", Tab: "should-not-be-used" });
    expect(displayBinding("alt+tab", lm)).toBe("alt+tab");
    expect(displayBinding("alt+5", lm)).toBe("alt+5");
    expect(displayBinding("alt+[", lm)).toBe("alt+[");
  });

  it("layoutMap が1文字でない値を返すとき（デッドキー合成途中等）は元のまま返す（防御的）", () => {
    const empty = layoutMap({ KeyW: "" });
    expect(displayBinding("alt+w", empty)).toBe("alt+w");
    const multi = layoutMap({ KeyW: "ab" }); // デッドキーの合成中に複数文字を返す配列を想定
    expect(displayBinding("alt+w", multi)).toBe("alt+w");
  });

  it("読めない binding 文字列は元のまま返す（防御的）", () => {
    const lm = layoutMap({ KeyW: "z" });
    expect(displayBinding("", lm)).toBe("");
    expect(displayBinding("not a chord", lm)).toBe("not a chord");
  });
});
