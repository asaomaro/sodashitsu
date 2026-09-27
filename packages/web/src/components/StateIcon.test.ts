import type { DisplayState } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "../store/settings.js";
import StateIcon from "./StateIcon.vue";

let pinia: Pinia;

beforeEach(() => {
  // 設定のストアは作る時点で `soda.prefs.v1` を読む。前のテストの記号表示を持ち越さない。
  localStorage.clear();
  pinia = createPinia();
});
afterEach(() => {
  localStorage.clear();
});

function mountIcon(state: DisplayState | null, attrs: Record<string, string> = {}) {
  return mount(StateIcon, { props: { state }, attrs, global: { plugins: [pinia] } });
}

const CASES: [DisplayState, string, string][] = [
  ["blocked", "×", "入力待ち"],
  ["working", "◐", "作業中"],
  ["done", "✓", "完了"],
  ["idle", "○", "待機中"],
  ["unknown", "·", "状態不明"],
];

describe("StateIcon — 記号「入」（既定。AC4・AC7）", () => {
  it.each(CASES)("%s は字形 %s と読み上げの名前 %s", (state, glyph, label) => {
    const w = mountIcon(state);
    const el = w.get("span");
    expect(el.text()).toBe(glyph);
    expect(el.attributes("data-state")).toBe(state);
    expect(el.attributes("data-symbols")).toBe("on");
    expect(el.attributes("role")).toBe("img");
    expect(el.attributes("aria-label")).toBe(label);
    expect(el.attributes("title")).toBe(label);
    expect(el.attributes("aria-hidden")).toBeUndefined();
  });
});

describe("StateIcon — 記号「切」（AC6）", () => {
  it.each(CASES)("%s は字形を出さず、読み上げの名前は残す", (state, _glyph, label) => {
    useSettingsStore(pinia).setStatusSymbols(false);
    const el = mountIcon(state).get("span");
    expect(el.text()).toBe("");
    expect(el.attributes("data-symbols")).toBe("off");
    // 色の丸にも名前が無かった（WCAG 1.1.1）。記号を切っても名前は付ける。**役割も残す**——役割の無い span に
    // 名前を付けることは ARIA 1.2 で禁じられており、役割を記号の入／切に連動させると「切」で名前が失われる。
    expect(el.attributes("role")).toBe("img");
    expect(el.attributes("aria-label")).toBe(label);
    expect(el.attributes("title"), "マウスを載せると名前が出る").toBe(label);
  });

  it("設定を切り替えると、その場で字形が消え・戻る", async () => {
    const w = mountIcon("blocked");
    const settings = useSettingsStore(pinia);
    settings.setStatusSymbols(false);
    await w.vm.$nextTick();
    expect(w.get("span").text()).toBe("");
    settings.setStatusSymbols(true);
    await w.vm.$nextTick();
    expect(w.get("span").text()).toBe("×");
  });
});

describe("StateIcon — エージェントが居ない行（AC8）", () => {
  it.each([true, false])("記号 %s でも字形も名前も出さない（読み上げからも隠す）", (symbols) => {
    useSettingsStore(pinia).setStatusSymbols(symbols);
    const el = mountIcon(null).get("span");
    expect(el.text()).toBe("");
    expect(el.attributes("data-state")).toBe("none");
    expect(el.attributes("aria-hidden")).toBe("true");
    expect(el.attributes("role")).toBeUndefined();
    expect(el.attributes("aria-label")).toBeUndefined();
  });
});

// 呼ぶ側のクラスが根要素に付く——既存のテストと E2E のセレクタ（`.sidebar-state-icon[data-state]`）がそのまま効く。
describe("StateIcon — 呼ぶ側のクラス", () => {
  it("呼ぶ側のクラスが根要素に付き、data-state と並ぶ", () => {
    const w = mountIcon("blocked", { class: "sidebar-state-icon" });
    expect(w.find('.sidebar-state-icon.state-icon[data-state="blocked"]').exists()).toBe(true);
  });
});
