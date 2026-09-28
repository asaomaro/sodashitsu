import type { DisplayState } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { DISPLAY_STATES, stateGlyph, stateLabel } from "./stateIndicator.js";

const STATES: DisplayState[] = ["blocked", "working", "done", "idle", "unknown"];

describe("stateGlyph", () => {
  // herdr の `symbols`（src/client/shell.rs:190-194）と同じ字形。
  it("herdr の symbols と同じ字形を返す", () => {
    expect(STATES.map(stateGlyph)).toEqual(["×", "◐", "✓", "○", "·"]);
  });

  // **AC4**：色の見分けが付かなくても、形だけで 5 つが別になる。
  it("5 つの状態がそれぞれ別の字形になる", () => {
    expect(new Set(STATES.map(stateGlyph)).size).toBe(5);
  });

  // **AC8**：エージェントが居ない行には記号を出さない。
  it("エージェントが居ない（null）ときは空", () => {
    expect(stateGlyph(null)).toBe("");
  });

  // 絵文字は `color` を受け継がないので、色と併記できない。**絵文字の属性（Emoji=Yes）を持つ文字を混ぜない**。
  // 符号位置の範囲で判定すると BMP の絵文字（✅ U+2705・✔ U+2714・⏳ U+23F3 等）を素通りするので、属性で見る。
  it("絵文字の属性（Emoji=Yes）を持つ文字を使わない", () => {
    for (const g of STATES.map(stateGlyph)) {
      expect(/\p{Emoji}/u.test(g), `${g} は絵文字の属性を持つ`).toBe(false);
      expect([...g], `${g} は 1 文字`).toHaveLength(1);
    }
  });
});

describe("stateLabel", () => {
  // 5 つとも値を固定する——「空でない・互いに別」だけだと、working と idle の名前を入れ替えても通る
  // （読み上げが別の状態を名乗っても気づけない）。入力待ちと完了は通知のトーストと同じ語。
  it("5 つの状態それぞれの読み上げの名前", () => {
    expect(STATES.map(stateLabel)).toEqual(["入力待ち", "作業中", "完了", "待機中", "状態不明"]);
  });

  it("エージェントが居ないときは null（名前も出さない）", () => {
    expect(stateLabel(null)).toBeNull();
  });
});

describe("DISPLAY_STATES", () => {
  // `STATE_PRIORITY` から導く（手で並べると、状態が増えても型で落ちず、並びもコメントで合わせるだけになる）。
  it("5 つの表示状態を、優先度の高い順に並べる", () => {
    expect(DISPLAY_STATES).toEqual(["blocked", "done", "working", "idle", "unknown"]);
  });
});
