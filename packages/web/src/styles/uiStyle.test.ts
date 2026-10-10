import { describe, expect, it } from "vitest";
import css from "./uiStyle.css?raw";
import displayFrame from "../components/DisplayFrame.vue?raw";
import scriptMark from "../components/DisplayScriptMark.vue?raw";
import mobileShell from "../mobile/MobileShell.vue?raw";
import main from "../main.ts?raw";

/** CSS の色の名前（`color`・`background` 等に書ける、名前で指す色）。様式のファイルに、色は出さない。 */
const COLOR_NAMES = [
  "black", "white", "red", "green", "blue", "yellow", "orange", "purple", "pink", "gray", "grey", "silver", "gold", "brown", "cyan", "magenta", "navy", "teal", "lime",
  "maroon", "olive", "aqua", "fuchsia", "transparent", "currentcolor", "crimson", "coral", "salmon", "violet", "indigo", "ivory", "khaki", "beige", "tan", "plum",
];

function rules(): { selector: string; body: string }[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]! }));
}

describe("uiStyle.css（20261008-ui-style の角のトークン）", () => {
  it("角のトークン 3 つを、:root にクラシックの値（3・4・6px）、モダンの属性にモダンの値（6・8・12px）で定義する", () => {
    const get = (selector: string): Record<string, string> =>
      Object.fromEntries(
        rules()
          .filter((r) => r.selector === selector)
          .flatMap((r) => [...r.body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()] as const)),
      );
    expect(get(":root")).toEqual({ "--soda-shape-radius-s": "3px", "--soda-shape-radius": "4px", "--soda-shape-radius-l": "6px" });
    // モダンは、角に加えて、高さ・余白・pane の枠の角を定義する（PR2。仮置き）。クラシックは、これらを**定義しない**（部品の側のフォールバックが、今の値）。
    expect(get(':root[data-ui-style="modern"]')).toEqual({
      "--soda-shape-radius-s": "6px",
      "--soda-shape-radius": "8px",
      "--soda-shape-radius-l": "12px",
      "--soda-shape-pane-radius": "var(--soda-shape-radius-l)",
      "--soda-shape-pane-radius-per-gap": "1.5",
      "--soda-shape-row-h": "36px",
      "--soda-shape-control-h": "32px",
      "--soda-shape-pad-x": "12px",
      "--soda-shape-row-inset": "6px",
      "--soda-shape-row-radius": "var(--soda-shape-radius)",
      "--soda-shape-row-current-ring": "1px",
      "--soda-shape-row-current-tint": "22%",
      "--soda-shape-section-font": "0.95em",
      "--soda-shape-section-inner": "1em",
      "--soda-shape-section-opacity": "0.9",
      "--soda-shape-name-h": "28px",
      "--soda-shape-name-top": "6px",
      "--soda-shape-tag-h": "28px",
      // PR6（20261008-ui-style）: 区画のカードと、tab・切り替えのボタンが共有する形。
      "--soda-shape-card-gap": "8px",
      "--soda-shape-card-radius": "var(--soda-shape-radius-l)",
      "--soda-shape-card-tint": "5%",
      "--soda-shape-seg-font": "0.8em",
      "--soda-shape-seg-pad-y": "0.2em",
      "--soda-shape-seg-pad-x": "0.3em",
      "--soda-shape-seg-gap": "2px",
      "--soda-shape-seg-radius": "var(--soda-shape-radius-s)",
      "--soda-shape-seg-border": "1px",
      "--soda-shape-seg-bar-pad-y": "0.3em",
      "--soda-shape-seg-bar-pad-x": "0.4em",
      "--soda-shape-pad": "20px",
      "--soda-shape-menu-radius": "var(--soda-shape-radius)",
      "--soda-shape-menu-pad-y": "6px",
      "--soda-shape-shadow": "0 8px 24px color-mix(in srgb, black 22%, transparent), 0 1px 3px color-mix(in srgb, black 18%, transparent)",
    });
    for (const k of ["--soda-shape-pad", "--soda-shape-menu-radius", "--soda-shape-menu-pad-y", "--soda-shape-shadow", "--soda-shape-pane-radius", "--soda-shape-pane-radius-per-gap", "--soda-shape-row-h", "--soda-shape-control-h", "--soda-shape-pad-x", "--soda-shape-tag-h", "--soda-shape-row-inset", "--soda-shape-row-radius", "--soda-shape-row-current-ring", "--soda-shape-row-current-tint", "--soda-shape-name-h", "--soda-shape-name-top", "--soda-shape-section-font", "--soda-shape-section-inner", "--soda-shape-section-opacity", "--soda-shape-card-gap", "--soda-shape-card-radius", "--soda-shape-card-tint", "--soda-shape-seg-font", "--soda-shape-seg-pad-y", "--soda-shape-seg-pad-x", "--soda-shape-seg-gap", "--soda-shape-seg-radius", "--soda-shape-seg-border", "--soda-shape-seg-bar-pad-y", "--soda-shape-seg-bar-pad-x"]) expect(Object.keys(get(":root")), k).not.toContain(k);
  });

  it("モダンだけが属性の規則。クラシックの規則は属性に依らない（:root だけ）。ほかの規則は無い", () => {
    expect(rules().map((r) => r.selector).sort()).toEqual([':root', ':root[data-ui-style="modern"]'].sort());
  });

  // 影だけは、黒を透かした `color-mix(in srgb, black N%, transparent)` の形に限って許す（D11。新しい色の値は足さない）。
  const SHADOW_MIX = /color-mix\(in srgb, black \d{1,3}%, transparent\)/g;
  const cssNoShadowMix = css.replace(SHADOW_MIX, "");

  it("色の値（# ・rgb(・rgba(・hsl(・color-mix(・色の名前）が出ない（コメントも含めて）。例外は、影の `color-mix(in srgb, black N%, transparent)` だけ", () => {
    expect(cssNoShadowMix).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(cssNoShadowMix).not.toMatch(/\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color-mix|color)\s*\(/i);
    for (const name of COLOR_NAMES) expect(cssNoShadowMix.toLowerCase(), name).not.toMatch(new RegExp(`(^|[^a-z-])${name}([^a-z-]|$)`));
    expect(cssNoShadowMix).not.toMatch(/(^|[^-\w])(color|background|border-color|fill|stroke|box-shadow|outline)\s*:/);
  });

  it("例外の `color-mix` は、影のトークンの中だけ・モダンだけ。濃さは 30% 以下（明るいテーマでも濃すぎない）", () => {
    const modern = rules().find((r) => r.selector === ':root[data-ui-style="modern"]')!.body;
    const shadow = /--soda-shape-shadow\s*:([^;]+);/.exec(modern)![1]!;
    const all = css.match(SHADOW_MIX) ?? [];
    expect(all.length).toBeGreaterThan(0);
    expect(shadow.match(SHADOW_MIX)?.length).toBe(all.length); // 全部、影の中
    for (const m of all) expect(Number(/(\d+)%/.exec(m)![1])).toBeLessThanOrEqual(30);
  });

  it("文字（font）を変える宣言が無い（font-family は様式で変えない。区画の見出しの大きさのトークン `--soda-shape-section-font` は、名前に font を含む変数で、宣言ではない）", () => {
    expect(css).not.toMatch(/(?<![-\w])font(-family|-size|-weight)?\s*:/);
    expect(css).not.toMatch(/font-family/);
  });

  it("守りの部品のクラス名・部品のクラスの規則が出ない（外から部品を選ばない）", () => {
    for (const name of ["display-frame", "display-script", "script-mark", "mobile-shell", "mobile-", "focus-", "engage", "display-view"]) expect(css, name).not.toContain(name);
    expect(css).not.toMatch(/(^|[\s,>+~])\.[a-zA-Z_-]/); // クラスの選択子
    // 守りのファイルが自分の <style> で使っているクラス名も出ない。
    for (const src of [displayFrame, scriptMark, mobileShell]) {
      const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(src)?.[1] ?? "";
      for (const m of style.matchAll(/\.([a-zA-Z][\w-]+)/g)) expect(css, m[1]).not.toContain(m[1]!);
    }
  });

  it("main.ts が読み込む", () => {
    expect(main).toContain('import "./styles/uiStyle.css";');
  });
});
