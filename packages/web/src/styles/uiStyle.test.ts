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
      "--soda-shape-row-h": "36px",
      "--soda-shape-control-h": "32px",
      "--soda-shape-pad-x": "12px",
    });
    for (const k of ["--soda-shape-pane-radius", "--soda-shape-row-h", "--soda-shape-control-h", "--soda-shape-pad-x"]) expect(Object.keys(get(":root")), k).not.toContain(k);
  });

  it("モダンだけが属性の規則。クラシックの規則は属性に依らない（:root だけ）。ほかの規則は無い", () => {
    expect(rules().map((r) => r.selector).sort()).toEqual([':root', ':root[data-ui-style="modern"]'].sort());
  });

  it("色の値（# ・rgb(・rgba(・hsl(・color-mix(・色の名前）が出ない（コメントも含めて）", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color-mix|color)\s*\(/i);
    for (const name of COLOR_NAMES) expect(css.toLowerCase(), name).not.toMatch(new RegExp(`(^|[^a-z-])${name}([^a-z-]|$)`));
    expect(css).not.toMatch(/(^|[^-\w])(color|background|border-color|fill|stroke|box-shadow|outline)\s*:/);
  });

  it("文字（font）を変える宣言が無い", () => {
    expect(css).not.toMatch(/font(-family|-size|-weight)?\s*:/);
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
