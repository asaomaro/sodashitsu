import {
  contrastRatio,
  mixHex,
  TERMINAL_PALETTES,
  THEME_APPEARANCE,
  THEME_NAMES,
} from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import appVue from "../App.vue?raw";
import {
  CSS_VARS,
  MIN_SELECTED_SURFACE_RATIO,
  MUTED_TEXT_ALPHA,
  overlay,
  subtleOver,
  uiTokens,
} from "./uiTokens.js";

/**
 * AC9：どのテーマでも、design の表の相手に対して比が足りる（WCAG 2.2 の 1.4.3・1.4.11）。dracula も同じ検査を通る（今の値のまま足りている。
 * 足りなかったアクセントは decisions D1 で直した）。
 */
const HEX = /^#[0-9a-f]{6}$/;
const RGBA = /^rgba\(\d+, \d+, \d+, [\d.]+\)$/;

function minRatio(color: string, against: string[], alpha = 1): number {
  return Math.min(...against.map((a) => contrastRatio(mixHex(color, a, alpha), a)));
}

describe.each(THEME_NAMES)("uiTokens(%s)", (name) => {
  const t = uiTokens(name);
  const v = t.vars;
  const rows = [
    v["--soda-bg"],
    v["--soda-menu-bg"],
    v["--soda-menu-hover-bg"],
    v["--soda-menu-active-bg"],
  ];
  const terminalBg = TERMINAL_PALETTES[name].background;

  it("全ての変数があり、色は #rrggbb（淡い面・暗幕だけ rgba）", () => {
    expect(Object.keys(v).sort()).toEqual([...CSS_VARS].sort());
    for (const k of CSS_VARS) {
      const pattern =
        k === "--soda-subtle-bg" || k === "--soda-backdrop" || k === "--soda-backdrop-strong"
          ? RGBA
          : HEX;
      expect(v[k], k).toMatch(pattern);
    }
  });

  it("color-scheme はテーマの明暗（AC10）", () => {
    expect(t.colorScheme).toBe(THEME_APPEARANCE[name]);
  });

  it("文字は 0.7 に薄めても、背景・枠・hover・選択の行・淡い面の上で 4.5 以上。枠の文字も同じ色", () => {
    const against = [...rows, subtleOver(t, v["--soda-bg"]), subtleOver(t, v["--soda-menu-bg"])];
    expect(minRatio(v["--soda-fg"], against, MUTED_TEXT_ALPHA)).toBeGreaterThanOrEqual(4.5);
    expect(v["--soda-menu-fg"]).toBe(v["--soda-fg"]);
  });

  it("フォーカスの枠（--soda-fg）は、端末の背景を含めて 3 以上", () => {
    expect(minRatio(v["--soda-fg"], [...rows, terminalBg])).toBeGreaterThanOrEqual(3);
  });

  it("再接続の表示の文字（強い幕の上に直に描き、0.85 に薄める）は、幕を重ねた端末の背景・背景の上で 4.5 以上（decisions D9）", () => {
    const strong = v["--soda-backdrop-strong"];
    expect(
      minRatio(
        v["--soda-fg"],
        [
          overlay(strong, terminalBg),
          overlay(strong, v["--soda-bg"]),
          overlay(strong, v["--soda-menu-bg"]),
        ],
        0.85,
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("選択の面（表示中の tab・行・選んだ項目）は、枠の背景から 1.5 以上離れる（review ラウンド 1。decisions D15）", () => {
    expect(contrastRatio(v["--soda-menu-active-bg"], v["--soda-menu-bg"])).toBeGreaterThanOrEqual(
      MIN_SELECTED_SURFACE_RATIO,
    );
  });

  it("選ばれている pane の枠は、周りの背景と端末の背景に対して 3 以上（dracula は今の #44475a のまま。decisions D15）", () => {
    if (name === "dracula") {
      expect(v["--soda-pane-current"]).toBe("#44475a");
      return;
    }
    expect(minRatio(v["--soda-pane-current"], [v["--soda-bg"], terminalBg])).toBeGreaterThanOrEqual(
      3,
    );
  });

  it("アクセントの上の文字（押された状態）は 4.5 以上", () => {
    expect(contrastRatio(v["--soda-accent-fg"], v["--soda-accent"])).toBeGreaterThanOrEqual(4.5);
  });

  it("エラーの文字は背景・枠・端末の背景の上で 4.5 以上、警告の文字はサイドバーの行の上で 4.5 以上", () => {
    expect(
      minRatio(v["--soda-error-fg"], [v["--soda-bg"], v["--soda-menu-bg"], terminalBg]),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      minRatio(v["--soda-warn-fg"], [
        v["--soda-menu-bg"],
        v["--soda-menu-hover-bg"],
        v["--soda-menu-active-bg"],
      ]),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("状態の記号の 4 色は、背景・枠・hover・選択の行の上で 3 以上（unknown は文字の色で、上で確かめた）", () => {
    for (const k of [
      "--soda-state-blocked",
      "--soda-state-working",
      "--soda-state-done",
      "--soda-state-idle",
    ] as const) {
      expect(minRatio(v[k], rows), k).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("dracula は今の見た目", () => {
  it("今の値そのもの（変えたのはアクセントだけ。decisions D1）", () => {
    expect(uiTokens("dracula")).toEqual({
      vars: {
        "--soda-bg": "#1e1f29",
        "--soda-fg": "#f8f8f2",
        "--soda-menu-bg": "#282a36",
        "--soda-menu-fg": "#f8f8f2",
        "--soda-menu-border": "#44475a",
        "--soda-menu-active-bg": "#44475a",
        "--soda-menu-hover-bg": "#343746",
        "--soda-accent": "#6070a1",
        "--soda-accent-fg": "#f8f8f2",
        "--soda-error-fg": "#ff5555",
        "--soda-warn-fg": "#ffb86c",
        "--soda-state-blocked": "#ff6e6e",
        "--soda-state-working": "#f1fa8c",
        "--soda-state-done": "#50fa7b",
        "--soda-state-idle": "#8a9ad0",
        "--soda-subtle-bg": "rgba(255, 255, 255, 0.08)",
        "--soda-backdrop": "rgba(0, 0, 0, 0.4)",
        "--soda-backdrop-strong": "rgba(0, 0, 0, 0.5)",
        "--soda-pane-current": "#44475a",
      },
      colorScheme: "dark",
    });
  });

  it('App.vue の :root（JS が走る前の既定）は uiTokens("dracula") の写し', () => {
    const root = /:root\s*\{([\s\S]*?)\n\}/.exec(appVue)?.[1] ?? "";
    const declared = Object.fromEntries(
      [
        ...root
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .matchAll(/(--soda-[a-z-]+|color-scheme):\s*([^;]+);/g),
      ].map((m) => [m[1], m[2]!.trim()]),
    );
    const t = uiTokens("dracula");
    expect(declared).toEqual({ ...t.vars, "color-scheme": t.colorScheme });
  });
});

describe("組み立ての規則（design の表）", () => {
  it("dracula 以外：hover は枠と選択の行の中間、背景は枠を黒へ寄せた色、アクセントの上の文字は fg か枠の背景", () => {
    for (const n of THEME_NAMES.filter((x) => x !== "dracula")) {
      const v = uiTokens(n).vars;
      const dark = THEME_APPEARANCE[n] === "dark";
      expect(v["--soda-menu-hover-bg"], n).toBe(
        mixHex(v["--soda-menu-bg"], v["--soda-menu-active-bg"], 0.5),
      );
      expect(v["--soda-bg"], n).toBe(mixHex(v["--soda-menu-bg"], "#000000", dark ? 0.75 : 0.96));
      expect([v["--soda-fg"], v["--soda-menu-bg"]], n).toContain(v["--soda-accent-fg"]);
      expect(v["--soda-subtle-bg"], n).toBe(
        dark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)",
      );
    }
  });

  it("暗いテーマ・明るいテーマの 1 つずつを値で固定する（herdr の値から寄せた結果。警告は peach・idle は overlay1 から）", () => {
    expect(uiTokens("catppuccin").vars).toEqual({
      "--soda-bg": "#12121c",
      "--soda-fg": "#cdd6f4",
      "--soda-menu-bg": "#181825",
      "--soda-menu-fg": "#cdd6f4",
      "--soda-menu-border": "#313244",
      "--soda-menu-active-bg": "#37384a",
      "--soda-menu-hover-bg": "#282838",
      "--soda-accent": "#89b4fa",
      "--soda-accent-fg": "#181825",
      "--soda-error-fg": "#f38ba8",
      "--soda-warn-fg": "#fab387",
      "--soda-state-blocked": "#f38ba8",
      "--soda-state-working": "#f9e2af",
      "--soda-state-done": "#a6e3a1",
      "--soda-state-idle": "#7f849c",
      "--soda-subtle-bg": "rgba(255, 255, 255, 0.08)",
      "--soda-backdrop": "rgba(0, 0, 0, 0.4)",
      "--soda-backdrop-strong": "rgba(0, 0, 0, 0.5)",
      "--soda-pane-current": "#696976",
    });
    expect(uiTokens("catppuccin-latte").vars).toEqual({
      "--soda-bg": "#e5e7eb",
      "--soda-fg": "#1f202b",
      "--soda-menu-bg": "#eff1f5",
      "--soda-menu-fg": "#1f202b",
      "--soda-menu-border": "#ccd0da",
      "--soda-menu-active-bg": "#c2c6cf",
      "--soda-menu-hover-bg": "#d9dce2",
      "--soda-accent": "#1d63ee",
      "--soda-accent-fg": "#eff1f5",
      "--soda-error-fg": "#ce0f38",
      "--soda-warn-fg": "#8e3806",
      "--soda-state-blocked": "#d20f39",
      "--soda-state-working": "#986114",
      "--soda-state-done": "#317b21",
      "--soda-state-idle": "#6a6d7a",
      "--soda-subtle-bg": "rgba(0, 0, 0, 0.06)",
      "--soda-backdrop": "rgba(0, 0, 0, 0.4)",
      "--soda-backdrop-strong": "rgba(255, 255, 255, 0.6)",
      "--soda-pane-current": "#818389",
    });
  });

  it("半透明の変数を下地に重ねた色（手で計算した値）", () => {
    // #ffffff を 0.08・#282a36 を 0.92：0x28*0.92+255*0.08 = 57.2 → 0x39。
    expect(subtleOver(uiTokens("dracula"), "#282a36")).toBe("#393b46");
    expect(subtleOver(uiTokens("catppuccin-latte"), "#eff1f5")).toBe("#e1e3e6");
    // 0x28*0.5 = 20 → 0x14、0x2a*0.5 = 21 → 0x15、0x36*0.5 = 27 → 0x1b。
    expect(overlay("rgba(0, 0, 0, 0.5)", "#282a36")).toBe("#14151b");
  });
});

describe("寄せても明暗の向きは変わらない", () => {
  it("背景と文字の明暗の向きがテーマの明暗と合う", () => {
    for (const n of THEME_NAMES) {
      const v = uiTokens(n).vars;
      const bgLighter =
        contrastRatio(v["--soda-menu-bg"], "#000000") > contrastRatio(v["--soda-fg"], "#000000");
      expect(bgLighter ? "light" : "dark", n).toBe(THEME_APPEARANCE[n]);
    }
  });
});

/**
 * 薄めて描く文字（`opacity`）は MUTED_TEXT_ALPHA 以上（decisions D2）。上の検査は MUTED_TEXT_ALPHA で比を確かめるので、部品の CSS がそれより
 * 薄ければ検査が実態を守らない——部品の CSS を読んで確かめる。対象外は decisions D6 の 3 種（無効な部品・未対応の行・状態の丸）だけ。
 */
describe("部品の CSS の透明度", () => {
  const sources = import.meta.glob(["../components/*.vue", "../mobile/*.vue"], {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  // `[aria-disabled="true"]` も無効な部品（Tab で辿れるよう `disabled` の代わりに使う。20260927-multi-host-machines の切れているマシンの行）。
  const EXEMPT = [/:disabled/, /\[aria-disabled="true"\]/, /\.help-dialog-grayed/, /\.state-icon/];

  it("無効な部品・未対応の行・状態の丸を除き、opacity は MUTED_TEXT_ALPHA 以上", () => {
    const found: string[] = [];
    for (const [file, src] of Object.entries(sources)) {
      const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(src)?.[1] ?? "";
      for (const m of style.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const selector = m[1]!.trim();
        const opacity = /(?:^|;|\s)opacity:\s*([\d.]+)/.exec(m[2]!)?.[1];
        if (opacity === undefined || Number(opacity) === 0 || Number(opacity) >= MUTED_TEXT_ALPHA)
          continue;
        if (EXEMPT.some((re) => re.test(selector))) continue;
        found.push(`${file} ${selector} ${opacity}`);
      }
    }
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    expect(found).toEqual([]);
  });
});

/**
 * 警告の文字（`--soda-warn-fg`）は不透明のまま 4.5 に寄せる（上の検査）。だから**薄めて描いてはならない**——サイドバーの 2 行目は補足の文字を
 * 0.75 に薄めるが、警告（未検証）は薄めない（review ラウンド 2・decisions D16）。行ごと薄めると子の警告も薄まる（`opacity` は子に掛かる）。
 */
describe("警告の文字を薄めない（Sidebar.vue）", () => {
  const sidebar = import.meta.glob("../components/Sidebar.vue", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const css = (
    /<style[^>]*>([\s\S]*?)<\/style>/.exec(Object.values(sidebar)[0]!)?.[1] ?? ""
  ).replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
    selector: m[1]!.trim(),
    body: m[2]!,
  }));
  const opacityOf = (selector: string) => {
    const r = rules.find((x) => x.selector === selector);
    return r ? /(?:^|;|\s)opacity:\s*([\d.]+)/.exec(r.body)?.[1] : undefined;
  };

  it("2 行目の入れ物は薄めず、警告は不透明（補足の文字だけ 0.75）", () => {
    expect(opacityOf(".sidebar-row-line2"), "行ごと薄めると警告も薄まる").toBeUndefined();
    expect(opacityOf(".sidebar-row-line2 > span")).toBe("0.75");
    expect(opacityOf(".sidebar-row-line2 > .sidebar-unverified")).toBe("1");
  });
});
