import { DEFAULT_THEME, TERMINAL_PALETTES, type Pane, type Tab, type ThemeName } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import type { ClientRecord } from "./ClientRegistry.js";
import { answerAppearanceFor, answerPaletteFor, createPaletteSource, type AnswerPaletteDeps } from "./answerPalette.js";

/** pane p1 は tab t1 にある。t2 は別の tab。 */
const PANE = { id: "p1", tabId: "t1" } as Pane;

function client(id: string, opts: { theme?: ThemeName | null; viewTab?: string | null; at?: number; connectedAt?: number }): ClientRecord {
  return {
    id,
    kind: "desktop",
    fit: false,
    view: opts.viewTab ? { workspaceId: "w1", tabId: opts.viewTab, visible: [] } : null,
    lastInteractionAt: Math.max(opts.at ?? 0, opts.connectedAt ?? 0),
    lastActedAt: opts.at ?? 0,
    subscriptions: new Set(),
    theme: opts.theme ?? null,
  };
}

function deps(owner: string | null, clients: ClientRecord[]): AnswerPaletteDeps {
  const tab = { id: "t1", sizeOwnerClientId: owner } as Tab;
  return {
    getPane: (id) => (id === PANE.id ? PANE : undefined),
    getTab: (id) => (id === tab.id ? tab : undefined),
    clients: { get: (id) => clients.find((c) => c.id === id), list: () => clients },
  };
}

describe("answerPaletteFor（design D6 の順）", () => {
  it("1. サイズを決めているクライアントのテーマで答える——ほかに最近操作した人がいても", () => {
    const d = deps("owner", [
      client("owner", { theme: "catppuccin-latte", viewTab: "t1", at: 1 }),
      client("other", { theme: "nord", viewTab: "t1", at: 99 }),
    ]);
    expect(answerPaletteFor("p1", d)).toBe(TERMINAL_PALETTES["catppuccin-latte"]);
  });

  it("1. 権限者が別の tab を表示していても（権限は前の tab に残る。SizeAuthority の注記）、権限者の配色で答える", () => {
    const d = deps("owner", [
      client("owner", { theme: "vesper", viewTab: "t2", at: 1 }),
      client("viewer", { theme: "nord", viewTab: "t1", at: 99 }),
    ]);
    expect(answerPaletteFor("p1", d)).toBe(TERMINAL_PALETTES.vesper);
  });

  it("2. 権限者がまだテーマを伝えていなければ、その tab を表示していてテーマを伝えた人のうち最後に操作した人", () => {
    const d = deps("owner", [
      client("owner", { theme: null, viewTab: "t1", at: 50 }),
      client("older", { theme: "gruvbox", viewTab: "t1", at: 10 }),
      client("newer", { theme: "rose-pine-dawn", viewTab: "t1", at: 20 }),
      client("elsewhere", { theme: "vesper", viewTab: "t2", at: 99 }),
    ]);
    expect(answerPaletteFor("p1", d)).toBe(TERMINAL_PALETTES["rose-pine-dawn"]);
  });

  it("2. 一度も操作していない後から来た人（接続の時刻だけが新しい）は、操作した人に勝たない（decisions D13）", () => {
    const d = deps(null, [
      client("acted", { theme: "nord", viewTab: "t1", at: 10 }),
      client("justConnected", { theme: "vesper", viewTab: "t1", connectedAt: 99 }),
    ]);
    expect(answerPaletteFor("p1", d)).toBe(TERMINAL_PALETTES.nord);
  });

  it("2. 権限者がいない（fit していないモバイルだけが見ている）ときも、表示している人の配色", () => {
    const mobile = { ...client("m", { theme: "one-light", viewTab: "t1", at: 5 }), kind: "mobile" as const };
    expect(answerPaletteFor("p1", deps(null, [mobile]))).toBe(TERMINAL_PALETTES["one-light"]);
  });

  it("2. 権限者の id が既にいない（切断した）ときも、表示している人の配色", () => {
    expect(answerPaletteFor("p1", deps("gone", [client("v", { theme: "kanagawa", viewTab: "t1" })]))).toBe(TERMINAL_PALETTES.kanagawa);
  });

  it("3. その tab に答えられる人がいなければ（新しい tab はまだ誰も見ていない）、テーマを伝えた全員のうち最後に操作した人", () => {
    const d = deps(null, [
      client("a", { theme: "nord", viewTab: "t2", at: 5 }),
      client("b", { theme: "gruvbox-light", viewTab: null, at: 9 }),
      client("c", { theme: null, viewTab: "t1", at: 99 }), // テーマをまだ伝えていない人は選ばない
    ]);
    expect(answerPaletteFor("p1", d)).toBe(TERMINAL_PALETTES["gruvbox-light"]);
  });

  it("3. pane・tab がまだ引けない（起動の猶予の間・消えた tab）ときも、テーマを伝えた全員のうち最後に操作した人", () => {
    const clients = [client("x", { theme: "one-light", viewTab: "t1", at: 7 }), client("y", { theme: "vesper", viewTab: "t2", at: 3 })];
    expect(answerPaletteFor("not-yet-committed", deps("x", clients))).toBe(TERMINAL_PALETTES["one-light"]);
    const d = deps("x", clients);
    const orphan = { id: "p2", tabId: "gone" } as Pane;
    expect(answerPaletteFor("p2", { ...d, getPane: (id) => (id === "p2" ? orphan : undefined) })).toBe(TERMINAL_PALETTES["one-light"]);
  });

  it("4. 誰もテーマを伝えていなければ dracula（今までの答え）", () => {
    expect(answerPaletteFor("p1", deps(null, []))).toBe(DEFAULT_THEME);
    expect(answerPaletteFor("p1", deps(null, [client("a", { theme: null, viewTab: "t1" })]))).toBe(DEFAULT_THEME);
    expect(answerPaletteFor("missing", deps(null, [client("a", { theme: null, viewTab: "t1" })]))).toBe(DEFAULT_THEME);
  });

  it("毎回引き直す：権限者がテーマを変えたら次の答えも変わる", () => {
    const owner = client("owner", { theme: "nord", viewTab: "t1" });
    const d = deps("owner", [owner]);
    expect(answerPaletteFor("p1", d)).toBe(TERMINAL_PALETTES.nord);
    owner.theme = "solarized-light";
    expect(answerPaletteFor("p1", d)).toBe(TERMINAL_PALETTES["solarized-light"]);
  });
});

describe("createPaletteSource（composeServer の後から埋める箱）", () => {
  it("attach されるまでは dracula、attach 後は answerPaletteFor の答え", () => {
    const src = createPaletteSource();
    expect(src.paletteFor("p1")).toBe(DEFAULT_THEME);
    src.attach(deps("owner", [client("owner", { theme: "tokyo-night-day", viewTab: "t1" })]));
    expect(src.paletteFor("p1")).toBe(TERMINAL_PALETTES["tokyo-night-day"]);
  });

  it("attach されるまでは dark（dracula）、attach 後は answerAppearanceFor の答え（20260924-dark-mode-report）", () => {
    const src = createPaletteSource();
    expect(src.appearanceFor("p1")).toBe("dark");
    src.attach(deps("owner", [client("owner", { theme: "tokyo-night-day", viewTab: "t1" })]));
    expect(src.appearanceFor("p1")).toBe("light"); // tokyo-night-day は light
  });
});

// 20260924-dark-mode-report。resolveThemeFor（answerPaletteFor と共有）は既に上のテストで
// 網羅されているので、ここでは「同じ優先順位を辿ること」と「ThemeName→明暗の変換」だけを確認する。
describe("answerAppearanceFor（design「設計方針」: resolveThemeFor を answerPaletteFor と共有）", () => {
  it("1. サイズを決めているクライアントのテーマの明暗で答える", () => {
    const d = deps("owner", [
      client("owner", { theme: "catppuccin-latte", viewTab: "t1", at: 1 }), // light
      client("other", { theme: "nord", viewTab: "t1", at: 99 }), // dark
    ]);
    expect(answerAppearanceFor("p1", d)).toBe("light");
  });

  it("2. 権限者がいなければ、その tab を表示していて最後に操作した人の明暗", () => {
    const d = deps(null, [client("v", { theme: "one-light", viewTab: "t1", at: 5 })]);
    expect(answerAppearanceFor("p1", d)).toBe("light");
  });

  it("4. 誰もテーマを伝えていなければ dark（dracula の明暗）", () => {
    expect(answerAppearanceFor("p1", deps(null, []))).toBe("dark");
  });

  it("毎回引き直す：テーマが変われば明暗の答えも変わる", () => {
    const owner = client("owner", { theme: "nord", viewTab: "t1" }); // dark
    const d = deps("owner", [owner]);
    expect(answerAppearanceFor("p1", d)).toBe("dark");
    owner.theme = "solarized-light"; // light
    expect(answerAppearanceFor("p1", d)).toBe("light");
  });
});
