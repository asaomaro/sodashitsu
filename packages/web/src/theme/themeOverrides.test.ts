import { describe, expect, it } from "vitest";
import { CSS_VARS, type CssVar } from "@sodashitsu/client-core";
import {
  CSS_VAR_LABELS,
  emptyThemeOverrides,
  isValidCssColor,
  loadThemeOverrides,
  mergeVars,
  serializeThemeOverrides,
  withOverride,
  withoutOverride,
  type ThemeOverrides,
} from "./themeOverrides.js";

describe("isValidCssColor — 実物の要素の style.color へ代入して読み戻す（research F10。CSS.supports は使わない）", () => {
  it("妥当な色は真：16 進（3〜8 桁）・rgb()・hsl()・named color・キーワード", () => {
    for (const ok of ["#fff", "#ffffff", "#ffffffaa", "rgb(1,2,3)", "rgba(1,2,3,0.5)", "hsl(120, 100%, 50%)", "red", "transparent", "inherit", "currentColor"])
      expect(isValidCssColor(ok), ok).toBe(true);
  });

  it("妥当でない文字列は偽：読めない色・herdr の別名・桁の不正な 16 進", () => {
    // **`none` は含めない**——実物の Chromium では偽（研究どおり）だが、happy-dom はこの語だけ緩く受け入れるスタブの癖があり
    // （実測。ほかの語は一致する）、ここで含めると happy-dom の癖を確かめるテストになってしまう。実物の確認は E2E（T5）で行う。
    for (const bad of ["notacolor", "reset", "default", "#gggggg", "#12345", "javascript:alert(1)"])
      expect(isValidCssColor(bad), bad).toBe(false);
  });

  it("空文字列・空白だけ・文字列でない値は偽（未入力の扱い）", () => {
    for (const bad of ["", "   ", 42, null, undefined, {}, ["#fff"]]) expect(isValidCssColor(bad), String(bad)).toBe(false);
  });

  it("プロトタイプ経由の名前は無害に拒否される（constructor・__proto__）", () => {
    expect(isValidCssColor("constructor")).toBe(false);
    expect(isValidCssColor("__proto__")).toBe(false);
  });

  it("続けて呼んでも前回の値を持ち越さない（内部の使い回す要素の値をクリアしている）", () => {
    expect(isValidCssColor("#fff")).toBe(true);
    expect(isValidCssColor("notacolor")).toBe(false); // 直前が真でも、今回は偽のまま
    expect(isValidCssColor("#000")).toBe(true);
  });
});

describe("loadThemeOverrides / serializeThemeOverrides — 値ごとに読む・既定との差だけを持つ（AC8）", () => {
  it("空・null・配列・オブジェクトでない値は空の上書き", () => {
    for (const raw of [null, undefined, 42, "x", [], { light: [] }]) expect(loadThemeOverrides(raw)).toEqual(emptyThemeOverrides());
  });

  it("妥当な値だけを層ごとに読み、CssVar でないキー・妥当でない色は値ごとに落とす", () => {
    const o = loadThemeOverrides({
      light: { "--soda-accent": "#fff", "--not-a-var": "#000", "--soda-bg": "notacolor" },
      dark: { "--soda-menu-bg": "rgb(1,2,3)" },
    });
    expect(o).toEqual({ light: { "--soda-accent": "#fff" }, dark: { "--soda-menu-bg": "rgb(1,2,3)" } });
  });

  it("往復：serializeThemeOverrides → loadThemeOverrides は同じ内容に戻る", () => {
    const o: ThemeOverrides = { light: { "--soda-accent": "#a6e3a1" }, dark: { "--soda-bg": "#000" } };
    expect(loadThemeOverrides(serializeThemeOverrides(o))).toEqual(o);
  });

  it("両方の層が空なら serializeThemeOverrides は undefined（差が無くなれば keys ごと消える。keys と同じ規則）", () => {
    expect(serializeThemeOverrides(emptyThemeOverrides())).toBeUndefined();
    expect(serializeThemeOverrides({ light: {}, dark: { "--soda-accent": "#fff" } })).toEqual({ dark: { "--soda-accent": "#fff" } });
  });
});

describe("withOverride / withoutOverride — イミュータブル", () => {
  it("withOverride は新しいオブジェクトを返し、元は変えない", () => {
    const o = emptyThemeOverrides();
    const next = withOverride(o, "light", "--soda-accent", "#fff");
    expect(o).toEqual(emptyThemeOverrides());
    expect(next).toEqual({ light: { "--soda-accent": "#fff" }, dark: {} });
    expect(next).not.toBe(o);
  });

  it("withoutOverride はその 1 項目だけを外し、ほかは残す", () => {
    const o: ThemeOverrides = { light: { "--soda-accent": "#fff", "--soda-bg": "#000" }, dark: {} };
    const next = withoutOverride(o, "light", "--soda-accent");
    expect(next).toEqual({ light: { "--soda-bg": "#000" }, dark: {} });
  });

  it("無い項目を外しても壊れない（そのまま）", () => {
    const o = emptyThemeOverrides();
    expect(withoutOverride(o, "dark", "--soda-accent")).toEqual(o);
  });
});

describe("mergeVars — 既定の値に層を重ねる（純粋）", () => {
  it("層にあるキーだけを差し替え、無いキーは base のまま", () => {
    const base = Object.fromEntries(CSS_VARS.map((k) => [k, `base:${k}`])) as Record<CssVar, string>;
    const merged = mergeVars(base, { "--soda-accent": "#fff" });
    expect(merged["--soda-accent"]).toBe("#fff");
    expect(merged["--soda-bg"]).toBe(base["--soda-bg"]);
    for (const key of CSS_VARS) if (key !== "--soda-accent") expect(merged[key]).toBe(base[key]);
  });

  it("空の層は base と同じ内容になる（別のオブジェクト）", () => {
    const base = Object.fromEntries(CSS_VARS.map((k) => [k, `v:${k}`])) as Record<CssVar, string>;
    const merged = mergeVars(base, {});
    expect(merged).toEqual(base);
    expect(merged).not.toBe(base);
  });
});

describe("CSS_VAR_LABELS — 20 個すべてに日本語の説明がある（AC12）", () => {
  it("CSS_VARS の全項目を漏れなくカバーする", () => {
    for (const key of CSS_VARS) {
      expect(CSS_VAR_LABELS[key], key).toBeTypeOf("string");
      expect(CSS_VAR_LABELS[key].length, key).toBeGreaterThan(0);
    }
    expect(Object.keys(CSS_VAR_LABELS)).toHaveLength(CSS_VARS.length);
  });
});
