import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { useCommandsStore } from "../store/commands.js";
import { useSettingsStore } from "../store/settings.js";
import { readPrefs, useViewStore } from "../store/view.js";
import KeySettings from "./KeySettings.vue";

let pinia: Pinia;
let wrapper: VueWrapper | null = null;

beforeEach(() => {
  localStorage.clear();
  pinia = createPinia();
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  localStorage.clear();
  document.body.innerHTML = "";
});

async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
}

async function mountKeys() {
  const view = useViewStore(pinia);
  view.openDialogWithContext({ kind: "settings" });
  const w = mount(KeySettings, { global: { plugins: [pinia] }, attachTo: document.body });
  wrapper = w;
  await settle();
  return { w, view, settings: useSettingsStore(pinia) };
}

function press(el: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(ev);
  return ev;
}

const capture = (): HTMLElement | null => document.querySelector<HTMLElement>(".keys-capture");
const row = (id: string): HTMLElement =>
  document.querySelector<HTMLElement>(`[data-action="${id}"]`)!;
const summaryText = (id: string): string =>
  row(id).querySelector(".keys-bindings")!.textContent!.trim();
const status = (): string => document.querySelector('[role="status"]')!.textContent!.trim();
const changeBtn = (id: string, binding: string): HTMLElement =>
  document.querySelector<HTMLElement>(`[data-change="${id}|${binding}"]`)!;
const addBtn = (id: string, via: "prefix" | "direct"): HTMLElement =>
  row(id).querySelector<HTMLElement>(`[data-add="${via}"]`)!;
const deleteBtn = (id: string, binding: string): HTMLElement =>
  Array.from(row(id).querySelectorAll<HTMLElement>("button")).find((b) =>
    b.getAttribute("aria-label")?.endsWith(`の ${binding} を削除`),
  )!;
const prefixBtn = (): HTMLElement => document.querySelector<HTMLElement>("[data-prefix-change]")!;
const filterInput = (): HTMLInputElement =>
  document.querySelector<HTMLInputElement>("#keys-filter-input")!;
async function typeFilter(text: string): Promise<void> {
  filterInput().value = text;
  filterInput().dispatchEvent(new Event("input"));
  await settle();
}
const moveHereBtn = (): HTMLElement | null =>
  document.querySelector<HTMLElement>("[data-move-here]");

describe("KeySettings — 一覧（AC1）", () => {
  it("prefix と、3 群 60 個の操作＋navigate 6操作の現在の割り当てが見える（既定は今のキー）。割り当てなしは「なし」", async () => {
    const { settings } = await mountKeys();
    expect(document.querySelector("h3")!.textContent).toBe("キー");
    expect(document.querySelector(".keys-prefix .keys-binding")!.textContent).toBe("ctrl+b");
    expect(
      Array.from(document.querySelectorAll(".keys-group-name")).map((h) => h.textContent),
    ).toEqual(["全体", "workspace / tab", "pane", "独自コマンド", "navigate モードの移動"]); // 独自コマンドが 0 件なら群の代わりに置き場所の案内（20260927-custom-command-keys）
    expect(document.querySelectorAll(".keys-details")).toHaveLength(69); // 61 + navigate 8（20261005-notify-bell で open_notification_history が加わった）。内訳:（group-worktree-items で navigate_toggle_collapse が加わった。20260925-sidebar-keyboard-menu で navigate_open_menu が加わった。20260926-edit-scrollback で edit_scrollback が加わった。20260927-clipboard-image-paste で remote_image_paste が加わった。20260927-cli-mode で D-7 の 5 操作が加わった。20260927-agent-graph で open_graph が加わった。20261004-subagent-display で show_subagents・20261004-ui-interaction-polish で toggle_spaces_section / toggle_agents_section が加わった）
    expect(summaryText("split_vertical")).toBe("prefix+v");
    expect(summaryText("switch_tab")).toBe("prefix+1..9");
    expect(summaryText("cycle_pane_previous")).toBe("prefix+shift+tab");
    settings.setKeyBindings("help", []);
    await settle();
    expect(summaryText("help")).toBe("なし");
  });

  it("おすすめの一式の注記：環境で届かないキーがあり、［変更］で付け替える", async () => {
    await mountKeys();
    const note = document.querySelector(".keys-recommended-note")!.textContent!;
    expect(note).toContain("Ctrl+Alt+L");
    expect(note).toContain("AltGr");
    expect(note).toContain("［変更］で付け替えてください");
    // ［足す］ボタンから注記へ結ばれている（Tab だけで辿る利用者にも、ボタンの説明として届く）。
    const btn = document.querySelector<HTMLElement>("[data-add-preset]")!;
    const id = btn.getAttribute("aria-describedby")!;
    expect(document.getElementById(id)?.textContent).toBe(note);
  });

  it("節は見出しで名前が付いている（読み上げ）。割り当てごとの操作のボタンは、何の操作かが分かる名前を持つ", async () => {
    await mountKeys();
    const sec = document.querySelector("section")!;
    expect(sec.querySelector(`#${sec.getAttribute("aria-labelledby")}`)).not.toBeNull();
    expect(changeBtn("split_vertical", "prefix+v").getAttribute("aria-label")).toBe(
      "「右へ分割」の prefix+v を変更",
    );
    expect(deleteBtn("split_vertical", "prefix+v")).toBeDefined();
    expect(addBtn("goto", "direct").getAttribute("aria-label")).toBe(
      "追加：直接（「goto（workspace・tab・pane から探す）」）",
    );
  });
});

// 20260923-missing-keybinding-actions（AC8）。`bindings.ts` へ登録するだけで KeySettings.vue が
// 汎用に拾うことは design で確認済み（新規実装なし）——ここでは実際にその12操作のうち代表1つで
// 「なし」表示・追加・削除・既定に戻す（defaults: [] なので「なし」に戻る）を通しで確かめる。
describe("KeySettings — herdr にあって本製品に操作自体が無かった12操作（AC8）", () => {
  it("既定は「なし」として現れ、追加・削除・既定に戻す（[]へ）ができる", async () => {
    const { settings } = await mountKeys();
    expect(summaryText("last_pane")).toBe("なし");
    expect(resetActionBtn("last_pane")).toBeNull(); // 既定（[]）のままなので出ない

    addBtn("last_pane", "prefix").focus();
    addBtn("last_pane", "prefix").click();
    await settle();
    press(capture()!, "y");
    await settle();
    expect(settings.keymap.bindingsOf("last_pane")).toEqual(["prefix+y"]);
    expect(summaryText("last_pane")).toBe("prefix+y");
    expect(resetActionBtn("last_pane")).not.toBeNull(); // 既定（[]）から変わったので出る

    resetActionBtn("last_pane")!.click();
    await settle();
    expect(settings.keymap.bindingsOf("last_pane")).toEqual([]);
    expect(summaryText("last_pane")).toBe("なし"); // 既定へ戻すと「なし」（defaults: []）
  });

  it("focus_agent は範囲キー（1..9）を割り当てられる（switch_tab と同じ indexed 操作）", async () => {
    const { settings } = await mountKeys();
    addBtn("focus_agent", "prefix").click();
    await settle();
    press(capture()!, "3", { altKey: true }); // 数字のキー1つでその修飾の組の範囲になる
    await settle();
    expect(settings.keymap.bindingsOf("focus_agent")).toEqual(["prefix+alt+1..9"]);
    expect(settings.keymap.prefixMap.get("alt+7")).toEqual({ type: "focusAgentIndex", index: 6 });
  });
});

describe("KeySettings — prefix の変更（AC3・AC-I1〜I5）", () => {
  it("［変更］で取り込み待ちに入り、フォーカスが取り込みの部品へ移る。押したキーで確定し、フォーカスは［変更］へ戻る", async () => {
    const { w, settings } = await mountKeys();
    prefixBtn().focus();
    prefixBtn().click();
    await settle();
    expect(capture()).not.toBeNull();
    expect(document.activeElement).toBe(capture());
    expect(w.emitted("update:capturing")?.[0]).toEqual([true]);

    press(capture()!, "a", { ctrlKey: true });
    await settle();
    expect(settings.keymap.prefix).toBe("ctrl+a");
    expect(document.querySelector(".keys-prefix .keys-binding")!.textContent).toBe("ctrl+a");
    expect(status()).toBe("prefix を ctrl+a にしました。");
    expect(capture()).toBeNull();
    expect(document.activeElement).toBe(prefixBtn());
    expect(w.emitted("update:capturing")?.at(-1)).toEqual([false]);
    expect((readPrefs()["keys"] as { prefix: string }).prefix).toBe("ctrl+a");
  });

  it("送れない形は理由を出して元のまま終わる（AC6・AC-I2）", async () => {
    const { settings } = await mountKeys();
    prefixBtn().click();
    await settle();
    press(capture()!, "a"); // 修飾なし
    await settle();
    expect(settings.keymap.prefix).toBe("ctrl+b");
    expect(status()).toContain("prefix には");
    expect(capture()).toBeNull();
    expect(document.activeElement).toBe(prefixBtn());
  });

  it("いま直接のキーに使われているキーは prefix にできない（持ち主の名前を出す）", async () => {
    const { settings } = await mountKeys();
    settings.setKeyBindings("goto", ["prefix+g", "ctrl+g"]);
    prefixBtn().click();
    await settle();
    press(capture()!, "g", { ctrlKey: true });
    await settle();
    expect(status()).toContain("goto");
    expect(settings.keymap.prefix).toBe("ctrl+b");
  });
});

describe("KeySettings — 取り込み待ちの取り消しと漏らさない（AC-I1・AC-I5）", () => {
  it("Esc で取り消し、何も変えない。keydown は preventDefault・stopPropagation される（ダイアログを閉じない）", async () => {
    const { settings } = await mountKeys();
    let leaked = 0;
    document.addEventListener("keydown", () => (leaked += 1));
    prefixBtn().click();
    await settle();
    const ev = press(capture()!, "Escape");
    await settle();
    expect(ev.defaultPrevented).toBe(true);
    expect(leaked).toBe(0); // stopPropagation：親（ダイアログ・window）へ届かない
    expect(settings.keymap.prefix).toBe("ctrl+b");
    expect(status(), "取り消しは理由を出さない（検証で拒否したのではない）").toBe("");
    expect(capture()).toBeNull();
    expect(document.activeElement).toBe(prefixBtn());
  });

  it("Esc で取り消したあと、親へ「取り込み待ちが終わった」と知らせるのは次のタスク（ネイティブの cancel が keydown のあとに来ても閉じないため）", async () => {
    const { w } = await mountKeys();
    prefixBtn().click();
    await settle();
    press(capture()!, "Escape");
    await settle();
    expect(capture()).toBeNull(); // 取り込み待ちの部品は直ちに消える
    expect(w.emitted("update:capturing")?.at(-1), "まだ知らせていない").toEqual([true]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(w.emitted("update:capturing")?.at(-1)).toEqual([false]);
  });

  it("Esc のあと次のタスクの前に別の取り込みが始まったら、遅らせた知らせで新しい取り込み待ちを終わらせない（親には true のまま）", async () => {
    const { w } = await mountKeys();
    prefixBtn().click();
    await settle();
    press(capture()!, "Escape"); // 知らせはタイマー（次のタスク）へ回る
    await settle();
    addBtn("goto", "prefix").click(); // タイマーが動く前に、別の取り込みを始める
    await settle();
    expect(capture()).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0)); // 遅らせた知らせが動く
    expect(w.emitted("update:capturing")?.at(-1), "新しい取り込み待ちは続いている").toEqual([true]);
    expect(capture()).not.toBeNull();
  });

  it("取り込み待ちの間に押したキー（確定するキーも）は、どれも親へ漏れず、既定の動作が止まる", async () => {
    await mountKeys();
    let leaked = 0;
    document.addEventListener("keydown", () => (leaked += 1));
    addBtn("goto", "prefix").click();
    await settle();
    const shift = press(capture()!, "Shift", { shiftKey: true });
    const tab = press(capture()!, "y");
    await settle();
    expect(shift.defaultPrevented).toBe(true);
    expect(tab.defaultPrevented).toBe(true);
    expect(leaked).toBe(0);
  });

  it("取り込み待ちでない間は、設定画面の Esc・Tab はそのまま（親へ届く）", async () => {
    await mountKeys();
    let seen = 0;
    document.addEventListener("keydown", () => (seen += 1));
    press(prefixBtn(), "Escape");
    press(prefixBtn(), "Tab");
    expect(seen).toBe(2);
  });

  it("フォーカスを失うと元のまま終わる。**フォーカスは奪い返さない**（利用者が選んだ別の部品のまま）", async () => {
    const { w, settings } = await mountKeys();
    addBtn("goto", "prefix").click();
    await settle();
    const other = addBtn("zoom", "direct");
    other.focus();
    await settle();
    expect(capture()).toBeNull();
    expect(document.activeElement).toBe(other);
    expect(w.emitted("update:capturing")?.at(-1)).toEqual([false]);
    expect(settings.keymap.bindingsOf("goto")).toEqual(["prefix+g"]);
  });

  it.each([
    ["prefix の［変更］", () => prefixBtn()],
    ["割り当ての［変更］", () => changeBtn("split_vertical", "prefix+v")],
    ["［追加］", () => addBtn("goto", "direct")],
  ])(
    "フォーカスを失うと、%s で始めた取り込みも元のまま終わる（親には false。3 つの入口が同じ部品を使う）",
    async (_name, start) => {
      const { w } = await mountKeys();
      start().click();
      await settle();
      expect(capture()).not.toBeNull();
      expect(w.emitted("update:capturing")?.at(-1)).toEqual([true]);
      const other = addBtn("zoom", "prefix");
      other.focus();
      await settle();
      expect(capture()).toBeNull();
      expect(w.emitted("update:capturing")?.at(-1)).toEqual([false]);
      expect(document.activeElement).toBe(other);
    },
  );

  it("設定画面が閉じると、取り込み待ちは元のまま終わる", async () => {
    const { w, view } = await mountKeys();
    prefixBtn().click();
    await settle();
    expect(capture()).not.toBeNull();
    view.closeDialog();
    await settle();
    expect(capture()).toBeNull();
    expect(w.emitted("update:capturing")?.at(-1)).toEqual([false]);
  });

  it("設定画面を閉じると、前回の結果の文も消える（開き直したとき持ち越さない）", async () => {
    const { view } = await mountKeys();
    prefixBtn().click();
    await settle();
    press(capture()!, "a", { ctrlKey: true });
    await settle();
    expect(status()).toBe("prefix を ctrl+a にしました。");
    view.closeDialog();
    await settle();
    expect(status()).toBe("");
  });

  it("取り込み待ちは同時に 1 つだけ（別の［追加］を押すと移る）", async () => {
    await mountKeys();
    addBtn("goto", "prefix").click();
    await settle();
    addBtn("zoom", "direct").click();
    await settle();
    expect(document.querySelectorAll(".keys-capture")).toHaveLength(1);
    expect(row("zoom").querySelector(".keys-capture")).not.toBeNull();
  });
});

describe("KeySettings — 割り当ての追加・変更・削除（AC4・AC-I4）", () => {
  it("［追加：prefix の後］：押したキーで足され、フォーカスは押した［追加］へ戻る", async () => {
    const { settings } = await mountKeys();
    addBtn("goto", "prefix").focus();
    addBtn("goto", "prefix").click();
    await settle();
    press(capture()!, "y");
    await settle();
    expect(settings.keymap.bindingsOf("goto")).toEqual(["prefix+g", "prefix+y"]);
    expect(summaryText("goto")).toBe("prefix+g / prefix+y");
    expect(status()).toBe(
      "「goto（workspace・tab・pane から探す）」に prefix+y を割り当てました。",
    );
    expect(document.activeElement).toBe(addBtn("goto", "prefix"));
  });

  it("［変更］：その割り当てを置き換え、フォーカスは新しい割り当ての［変更］へ移る（chip が作り直されるため）", async () => {
    const { settings } = await mountKeys();
    changeBtn("split_vertical", "prefix+v").click();
    await settle();
    press(capture()!, "|", { shiftKey: true });
    await settle();
    expect(settings.keymap.bindingsOf("split_vertical")).toEqual(["prefix+|"]);
    expect(settings.keymap.prefixMap.has("v")).toBe(false);
    expect(document.activeElement).toBe(changeBtn("split_vertical", "prefix+|"));
  });

  it("［追加：直接］：ctrl+alt の chord を直接のキーとして足す", async () => {
    const { settings } = await mountKeys();
    addBtn("split_vertical", "direct").click();
    await settle();
    press(capture()!, "d", { ctrlKey: true, altKey: true });
    await settle();
    expect(settings.keymap.bindingsOf("split_vertical")).toEqual(["prefix+v", "ctrl+alt+d"]);
    expect(settings.keymap.directMap.get("ctrl+alt+d")).toEqual({ type: "split", dir: "right" });
  });

  it("［削除］：割り当てを外す。フォーカスは同じ行の次の［変更］、無ければ［追加：prefix の後］へ", async () => {
    const { settings } = await mountKeys();
    settings.setKeyBindings("goto", ["prefix+g", "prefix+y", "ctrl+alt+g"]);
    await settle();
    deleteBtn("goto", "prefix+g").click();
    await settle();
    expect(settings.keymap.bindingsOf("goto")).toEqual(["prefix+y", "ctrl+alt+g"]);
    expect(document.activeElement).toBe(changeBtn("goto", "prefix+y")); // 消えた位置の次
    deleteBtn("goto", "ctrl+alt+g").click();
    await settle();
    expect(settings.keymap.bindingsOf("goto")).toEqual(["prefix+y"]);
    expect(document.activeElement).toBe(addBtn("goto", "prefix")); // 最後を消したので、次の部品は無い→［追加：prefix の後］
    deleteBtn("goto", "prefix+y").click();
    await settle();
    expect(settings.keymap.bindingsOf("goto")).toEqual([]);
    expect(summaryText("goto")).toBe("なし");
    expect(document.activeElement).toBe(addBtn("goto", "prefix"));
    expect(status()).toContain("外しました");
  });

  it("外したキーは、別の操作へ割り当てられるようになる", async () => {
    const { settings } = await mountKeys();
    deleteBtn("split_vertical", "prefix+v").click();
    await settle();
    addBtn("goto", "prefix").click();
    await settle();
    press(capture()!, "v");
    await settle();
    expect(settings.keymap.ownerOf("prefix", "v")).toBe("goto");
  });
});

describe("KeySettings — 拒否（AC6・AC-I2）", () => {
  it("(a) すでに別の操作が使っているキーは理由（持ち主の名前）を出して、元のまま終わり、フォーカスは押したボタンへ戻る", async () => {
    const { settings } = await mountKeys();
    addBtn("goto", "prefix").focus();
    addBtn("goto", "prefix").click();
    await settle();
    press(capture()!, "v");
    await settle();
    expect(status()).toContain("右へ分割");
    expect(settings.keymap.bindingsOf("goto")).toEqual(["prefix+g"]);
    expect(capture()).toBeNull();
    expect(document.activeElement).toBe(addBtn("goto", "prefix"));
  });

  it("(d) 直接のキーとして、修飾キーの無い文字は拒否する", async () => {
    const { settings } = await mountKeys();
    addBtn("zoom", "direct").click();
    await settle();
    press(capture()!, "y");
    await settle();
    expect(status()).toContain("直接のキーにできません");
    expect(settings.keymap.bindingsOf("zoom")).toEqual(["prefix+z"]);
  });

  it("修飾キー単体は取り込まず、理由を出して待ち続ける。続けて押した文字で確定する（chord の途中）", async () => {
    const { settings } = await mountKeys();
    addBtn("zoom", "direct").click();
    await settle();
    press(capture()!, "Control", { ctrlKey: true });
    await settle();
    expect(capture()).not.toBeNull();
    expect(status()).toContain("修飾キーだけでは");
    press(capture()!, "Alt", { ctrlKey: true, altKey: true });
    press(capture()!, "y", { ctrlKey: true, altKey: true });
    await settle();
    expect(settings.keymap.bindingsOf("zoom")).toEqual(["prefix+z", "ctrl+alt+y"]);
    expect(capture()).toBeNull();
  });

  it("IME の変換中・押しっぱなしの繰り返しは無視して待ち続ける", async () => {
    await mountKeys();
    addBtn("goto", "prefix").click();
    await settle();
    press(capture()!, "y", { isComposing: true });
    press(capture()!, "y", { repeat: true });
    await settle();
    expect(capture()).not.toBeNull();
  });
});

describe("KeySettings — 範囲 1..9（AC7）", () => {
  it("数字のキー 1 つで、その修飾の組の範囲になる。数字以外は拒否する", async () => {
    const { settings } = await mountKeys();
    addBtn("switch_tab", "prefix").click();
    await settle();
    press(capture()!, "a", { altKey: true });
    await settle();
    expect(status()).toContain("1〜9 の数字");
    addBtn("switch_tab", "prefix").click();
    await settle();
    press(capture()!, "3", { altKey: true });
    await settle();
    expect(settings.keymap.bindingsOf("switch_tab")).toEqual(["prefix+1..9", "prefix+alt+1..9"]);
    expect(settings.keymap.prefixMap.get("alt+7")).toEqual({ type: "tabIndex", index: 7 });
  });
});

describe("KeySettings — キーボードだけで通せる（AC-I3）", () => {
  it("操作の行は <details>（標準の開閉）・操作はどれも <button>（Enter/Space で押せる）・取り込みの部品も <button>", async () => {
    await mountKeys();
    expect(row("goto").tagName).toBe("DETAILS");
    expect(row("goto").querySelector("summary")).not.toBeNull();
    for (const b of Array.from(document.querySelectorAll(".keys-btn, .keys-capture")))
      expect(b.tagName).toBe("BUTTON");
    addBtn("goto", "prefix").click();
    await settle();
    expect(capture()!.tagName).toBe("BUTTON");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// T12：既定へ戻す（AC9）・おすすめの直接のキー（AC10）・モバイルの一言（AC1・D11）
// ---------------------------------------------------------------------------------------------------------------------

const resetActionBtn = (id: string): HTMLElement | null =>
  row(id).querySelector<HTMLElement>("[data-reset-action]");
// navigate 6操作版のヘルパー（20260923-navigate-mode-keys）。
const navRow = (id: string): HTMLElement =>
  document.querySelector<HTMLElement>(`[data-navigate-key="${id}"]`)!;
const navSummaryText = (id: string): string =>
  navRow(id).querySelector(".keys-bindings")!.textContent!.trim();
const navChangeBtn = (id: string, binding: string): HTMLElement =>
  document.querySelector<HTMLElement>(`[data-nav-change="${id}|${binding}"]`)!;
const navAddBtn = (id: string): HTMLElement => navRow(id).querySelector<HTMLElement>("[data-nav-add]")!;
const navDeleteBtn = (id: string, binding: string): HTMLElement =>
  Array.from(navRow(id).querySelectorAll<HTMLElement>("button")).find((b) =>
    b.getAttribute("aria-label")?.endsWith(`の ${binding} を削除`),
  )!;
const navResetBtn = (id: string): HTMLElement | null =>
  navRow(id).querySelector<HTMLElement>("[data-reset-navigate-key]");
const resetPrefixBtn = (): HTMLElement | null =>
  document.querySelector<HTMLElement>("[data-reset-prefix]");
const resetAllBtn = (): HTMLElement | null =>
  document.querySelector<HTMLElement>("[data-reset-all]");
const presetAddBtn = (): HTMLElement => document.querySelector<HTMLElement>("[data-add-preset]")!;
const presetSelect = (): HTMLSelectElement =>
  document.querySelector<HTMLSelectElement>("#keys-preset-select")!;
const confirmYes = (): HTMLElement | null =>
  document.querySelector<HTMLElement>("[data-confirm-yes]");
const confirmNo = (): HTMLElement | null =>
  document.querySelector<HTMLElement>("[data-confirm-no]");

describe("KeySettings — 操作ごとの既定へ戻す（AC9）", () => {
  it("［既定に戻す］は上書きしている操作にだけ出る。押すと既定の割り当てへ戻り、フォーカスは［追加：prefix の後］へ", async () => {
    const { settings } = await mountKeys();
    expect(resetActionBtn("zoom")).toBeNull();
    settings.setKeyBindings("zoom", ["prefix+y"]);
    await settle();
    expect(resetActionBtn("zoom")).not.toBeNull();
    expect(resetActionBtn("goto")).toBeNull(); // 他の操作は変わらず出ない
    resetActionBtn("zoom")!.click();
    await settle();
    expect(settings.keymap.bindingsOf("zoom")).toEqual(["prefix+z"]);
    expect(status()).toBe("「拡大表示」を既定へ戻しました。");
    expect(resetActionBtn("zoom")).toBeNull();
    expect(document.activeElement).toBe(addBtn("zoom", "prefix"));
    expect(readPrefs()).not.toHaveProperty("keys");
  });

  it("既定のキーを別の操作が使っていれば、その分は戻さず、持ち主の名前を出す", async () => {
    const { settings } = await mountKeys();
    settings.setKeyBindings("zoom", ["prefix+y"]);
    settings.setKeyBindings("goto", ["prefix+z"]);
    await settle();
    resetActionBtn("zoom")!.click();
    await settle();
    expect(settings.keymap.bindingsOf("zoom")).toEqual([]);
    expect(status()).toContain("上書きを外しました"); // 何も戻っていないので「戻しました」とは言わない
    expect(status()).not.toContain("既定へ戻しました");
    expect(status()).toContain("戻せなかった既定のキー");
    expect(status()).toContain("goto");
    expect(status().match(/prefix\+z/g), "キーが二重に出ない").toHaveLength(1);
  });

  it("割り当てなし（[]）にした操作も戻せる", async () => {
    const { settings } = await mountKeys();
    deleteBtn("help", "prefix+?").click();
    await settle();
    expect(summaryText("help")).toBe("なし");
    expect(resetActionBtn("help")).not.toBeNull();
    resetActionBtn("help")!.click();
    await settle();
    expect(settings.keymap.bindingsOf("help")).toEqual(["prefix+?"]);
  });
});

describe("KeySettings — prefix の既定へ戻す（AC9）", () => {
  it("［既定に戻す］は prefix を変えているときだけ出る。押すと ctrl+b へ戻り、フォーカスは［変更］へ", async () => {
    const { settings } = await mountKeys();
    expect(resetPrefixBtn()).toBeNull();
    settings.setKeyPrefix("ctrl+a");
    await settle();
    resetPrefixBtn()!.click();
    await settle();
    expect(settings.keymap.prefix).toBe("ctrl+b");
    expect(status()).toBe("prefix を既定（ctrl+b）へ戻しました。");
    expect(resetPrefixBtn()).toBeNull();
    expect(document.activeElement).toBe(prefixBtn());
  });

  it("既定の ctrl+b が直接のキー・prefix の後のキーに使われていれば戻さず、理由（持ち主の名前）を出す", async () => {
    const { settings } = await mountKeys();
    settings.setKeyPrefix("ctrl+a");
    settings.setKeyBindings("goto", ["prefix+g", "ctrl+b"]);
    await settle();
    resetPrefixBtn()!.click();
    await settle();
    expect(settings.keymap.prefix).toBe("ctrl+a");
    expect(status()).toContain("goto");
  });
});

describe("KeySettings — すべてを既定へ戻す（インラインの確認。AC9・AC-I2）", () => {
  async function overridden() {
    const ctx = await mountKeys();
    ctx.settings.setKeyPrefix("ctrl+a");
    ctx.settings.setKeyBindings("zoom", ["prefix+y"]);
    ctx.settings.setKeyBindings("help", []);
    await settle();
    return ctx;
  }

  it("押すと確認が出て、フォーカスは安全側の［やめる］へ移る。まだ何も変わらない", async () => {
    const { settings } = await overridden();
    resetAllBtn()!.click();
    await settle();
    expect(confirmYes()).not.toBeNull();
    expect(resetAllBtn()).toBeNull();
    expect(document.activeElement).toBe(confirmNo());
    expect(settings.keymap.prefix).toBe("ctrl+a");
  });

  it("［やめる］：何も変えず、確認を閉じ、フォーカスは［すべて既定に戻す］へ戻る", async () => {
    const { settings } = await overridden();
    resetAllBtn()!.click();
    await settle();
    confirmNo()!.click();
    await settle();
    expect(confirmYes()).toBeNull();
    expect(document.activeElement).toBe(resetAllBtn());
    expect(settings.keymap.prefix).toBe("ctrl+a");
    expect(settings.keymap.bindingsOf("zoom")).toEqual(["prefix+y"]);
  });

  it("［戻す］：prefix も操作もすべて既定へ戻り（AC2 の状態）、keys が消える", async () => {
    const { settings } = await overridden();
    resetAllBtn()!.click();
    await settle();
    confirmYes()!.click();
    await settle();
    expect(settings.keyPrefs).toEqual({ prefix: null, bindings: {}, navigateKeys: {}, commands: {} });
    expect(settings.keymap.prefix).toBe("ctrl+b");
    expect(settings.keymap.bindingsOf("help")).toEqual(["prefix+?"]);
    expect(status()).toBe("すべての割り当てと prefix を既定へ戻しました。");
    expect(readPrefs()).not.toHaveProperty("keys");
    expect(document.activeElement).toBe(resetAllBtn());
  });

  it("確認の中の Esc は確認を閉じるだけで、親（設定画面）へ届かない", async () => {
    await overridden();
    let leaked = 0;
    document.addEventListener("keydown", () => (leaked += 1));
    resetAllBtn()!.click();
    await settle();
    const ev = press(confirmNo()!, "Escape");
    await settle();
    expect(ev.defaultPrevented).toBe(true);
    expect(leaked).toBe(0);
    expect(confirmYes()).toBeNull();
    expect(document.activeElement).toBe(resetAllBtn());
  });

  it("設定画面が閉じると、確認は消える（開き直したとき出たままにならない）", async () => {
    const { view } = await overridden();
    resetAllBtn()!.click();
    await settle();
    view.closeDialog();
    await settle();
    expect(confirmYes()).toBeNull();
  });
});

describe("KeySettings — herdr のおすすめの直接のキー（AC10）", () => {
  it("押すと 10 個の直接のキーが足され、足した数と一覧が出る。prefix の後のキーは残る", async () => {
    const { settings } = await mountKeys();
    presetAddBtn().click();
    await settle();
    expect(settings.keymap.directMap.size).toBe(11); // おすすめの 10 個＋既定の ctrl+v（remote_image_paste。20260927-clipboard-image-paste）
    expect(settings.keymap.bindingsOf("focus_pane_left")).toEqual(["prefix+h", "ctrl+alt+h"]);
    expect(summaryText("focus_pane_left")).toBe("prefix+h / ctrl+alt+h");
    expect(status()).toContain("10 個足しました");
    expect(status()).toContain("ctrl+alt+shift+d");
  });

  it("もう一度押すと、すでに全部入っていることを知らせる（冪等）", async () => {
    const { settings } = await mountKeys();
    presetAddBtn().click();
    await settle();
    const before = JSON.stringify(settings.keyPrefs);
    presetAddBtn().click();
    await settle();
    expect(JSON.stringify(settings.keyPrefs)).toBe(before);
    expect(status()).toBe("herdr のおすすめの直接のキー（ctrl+alt）は、すでに全部入っています。");
  });

  it("別の操作が使っている chord は足さず、理由（持ち主の名前）を出す。残りは足す（足した数・キーが二重に出ない）", async () => {
    const { settings } = await mountKeys();
    settings.setKeyBindings("help", ["prefix+?", "ctrl+alt+z"]);
    await settle();
    presetAddBtn().click();
    await settle();
    expect(settings.keymap.bindingsOf("zoom")).toEqual(["prefix+z"]);
    expect(settings.keymap.directMap.size).toBe(11); // help の ctrl+alt+z を含めて 10（zoom の分は足さない）＋既定の ctrl+v
    expect(status()).toContain("9 個足しました");
    expect(status()).toContain("足さなかった分：ctrl+alt+z");
    expect(status()).toContain("キー一覧");
    expect(status().match(/ctrl\+alt\+z/g), "足さなかった分でキーは 1 回だけ").toHaveLength(1);
  });

  it("足した分と、その操作がすでに持っていた分が混ざる：足した数とすでにあった分を別々に言う", async () => {
    const { settings } = await mountKeys();
    settings.setKeyBindings("zoom", ["prefix+z", "ctrl+alt+z"]); // 一式の 1 つをすでに持っている
    await settle();
    presetAddBtn().click();
    await settle();
    expect(status()).toContain("herdr のおすすめの直接のキー（ctrl+alt）を 9 個足しました"); // すでにあった 1 個は数えない
    expect(status()).toContain("すでにあった分：ctrl+alt+z");
    expect(status()).not.toContain("足さなかった分");
  });

  it("すでに全部あるうえで 1 個が別の操作の持ち物になったときは、「全部入っています」と言わず、足さなかった分を出す", async () => {
    const { settings } = await mountKeys();
    presetAddBtn().click();
    await settle();
    settings.setKeyBindings("zoom", ["prefix+z"]); // 拡大表示から ctrl+alt+z を外す
    settings.setKeyBindings("help", ["prefix+?", "ctrl+alt+z"]); // その chord を別の操作が持つ
    await settle();
    presetAddBtn().click();
    await settle();
    expect(status()).not.toContain("すでに全部入っています");
    expect(status()).toContain("すでにあった分");
    expect(status()).toContain("足さなかった分：ctrl+alt+z");
    expect(status()).not.toContain("足しました");
  });

  it("prefix と同じ chord は足さず、理由（prefix）を出す", async () => {
    const { settings } = await mountKeys();
    settings.setKeyPrefix("ctrl+alt+h");
    await settle();
    presetAddBtn().click();
    await settle();
    expect(settings.keymap.bindingsOf("focus_pane_left")).toEqual(["prefix+h"]);
    expect(status()).toContain("足さなかった分");
    expect(status()).toContain("prefix");
    expect(status()).toContain("9 個足しました");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// 20260922-keybinding-presets：プリセットを選べる（design「振る舞いの詳細」・「受け入れ基準との対応」）
// ---------------------------------------------------------------------------------------------------------------------

describe("KeySettings — プリセットを選ぶ（AC1・AC2・AC-I1・AC-I3）", () => {
  it("herdr のおすすめ（ctrl+alt）・tmux 風の 2 つから選べる。既定は先頭（herdr）", async () => {
    await mountKeys();
    const options = Array.from(presetSelect().options).map((o) => o.value);
    expect(options).toEqual(["herdr-ctrl-alt", "tmux"]);
    expect(presetSelect().value).toBe("herdr-ctrl-alt");
  });

  it("「tmux 風」を選んで足すと、tmux 風の割り当てが足され、案内文にプリセット名が出る（AC2）", async () => {
    const { settings } = await mountKeys();
    presetSelect().value = "tmux";
    await presetSelect().dispatchEvent(new Event("change"));
    await settle();
    presetAddBtn().click();
    await settle();
    expect(settings.keymap.bindingsOf("split_vertical")).toEqual(["prefix+v", "prefix+%"]);
    expect(settings.keymap.bindingsOf("focus_pane_left")).toEqual(["prefix+h", "prefix+left"]);
    expect(status()).toContain("tmux 風を");
    expect(status()).toContain("prefix+%");
  });

  it("キーボードだけで `<select>` → ［足す］の順に Tab で辿れる（AC-I3）", async () => {
    await mountKeys();
    presetSelect().focus();
    expect(document.activeElement).toBe(presetSelect());
    // DOM 順どおりに `<select>` の直後が ［足す］（tabindex を書いていないのでネイティブの順そのまま）。
    const bulk = document.querySelector(".keys-bulk")!;
    const focusables = Array.from(bulk.querySelectorAll("select, button"));
    expect(focusables[0]).toBe(presetSelect());
    expect(focusables[1]).toBe(presetAddBtn());
  });

  it("ダイアログを閉じて開き直しても、選んでいたプリセットは保持される（AC-I1）", async () => {
    const { view } = await mountKeys();
    presetSelect().value = "tmux";
    await presetSelect().dispatchEvent(new Event("change"));
    await settle();
    view.closeDialog();
    await settle();
    view.openDialogWithContext({ kind: "settings" });
    await settle();
    expect(presetSelect().value).toBe("tmux");
  });

  it("tmux 風を足したあと［すべて既定に戻す］を押すと、tmux 風の分も含めて全部消える（AC7）", async () => {
    const { settings } = await mountKeys();
    presetSelect().value = "tmux";
    await presetSelect().dispatchEvent(new Event("change"));
    await settle();
    presetAddBtn().click();
    await settle();
    expect(settings.keymap.bindingsOf("split_vertical")).toContain("prefix+%");
    resetAllBtn()!.click();
    await settle();
    confirmYes()!.click();
    await settle();
    expect(settings.keymap.bindingsOf("split_vertical")).toEqual(["prefix+v"]);
    expect(settings.keyPrefs.bindings).toEqual({});
  });
});

describe("KeySettings — モバイルの一言（AC1・D11）", () => {
  it("モバイルのときだけ、画面のキーボードでは取り込めないことを添える（節そのものは出す）", async () => {
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "settings" });
    wrapper = mount(KeySettings, {
      global: { plugins: [pinia] },
      attachTo: document.body,
      props: { kind: "mobile" },
    });
    await settle();
    expect(document.querySelector("h3")!.textContent).toBe("キー");
    expect(document.querySelector(".keys-mobile-note")!.textContent).toContain(
      "画面のキーボードでは割り当てを取り込めません",
    );
    // 先頭（取り込めると言う案内の文より前）に置く
    expect(document.querySelector("section > p")!.classList.contains("keys-mobile-note")).toBe(
      true,
    );
    wrapper.unmount();
    document.body.innerHTML = "";
    wrapper = mount(KeySettings, { global: { plugins: [pinia] }, attachTo: document.body });
    await settle();
    expect(document.querySelector(".keys-mobile-note")).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// 20260922-keybinding-usability：絞り込み（US1）・こちらへ移す（US2）
// ---------------------------------------------------------------------------------------------------------------------

describe("KeySettings — 絞り込み（AC1・AC2・AC3・AC-I1〜AC-I5）", () => {
  it("最初から表示され（開閉の概念を持たない）、操作名の一部で一致する操作だけが残る（AC1・AC-I1）", async () => {
    await mountKeys();
    expect(filterInput()).not.toBeNull();
    expect(document.querySelectorAll(".keys-details")).toHaveLength(69); // 20261005-notify-bell で open_notification_history・20261004-ui-interaction-polish で toggle_spaces_section / toggle_agents_section・20260927-agent-graph で open_graph が加わった。20261004-subagent-display で show_subagents・group-worktree-items で navigate_toggle_collapse が加わった
    await typeFilter("拡大表示");
    expect(document.querySelectorAll(".keys-details")).toHaveLength(1);
    expect(row("zoom")).not.toBeNull();
  });

  it("群名でも大小文字を区別せず絞り込め、0 件の群は見出しごと消える（AC1・AC2）", async () => {
    await mountKeys();
    await typeFilter("PANE");
    const groups = Array.from(document.querySelectorAll(".keys-group-name")).map(
      (g) => g.textContent,
    );
    // 大小文字を無視して群名 "pane" が一致するので pane 群は出る。「全体」群は
    // 操作名にも群名にも "pane" を含む一致が無いので出ない（大小文字を区別しないことの確認）。
    expect(groups).toContain("pane");
    expect(groups).not.toContain("全体");
    expect(row("zoom")).not.toBeNull(); // pane 群の操作の 1 つ
  });

  it("入力を空にすると全部戻る（即時反映。AC3・AC-I2）", async () => {
    await mountKeys();
    await typeFilter("拡大表示");
    expect(document.querySelectorAll(".keys-details")).toHaveLength(1);
    await typeFilter("");
    expect(document.querySelectorAll(".keys-details")).toHaveLength(69); // 20261005-notify-bell で open_notification_history・20261004-ui-interaction-polish で toggle_spaces_section / toggle_agents_section・20260927-agent-graph で open_graph が加わった。20261004-subagent-display で show_subagents・group-worktree-items で navigate_toggle_collapse が加わった
  });

  it("絞り込み中もフォーカスが入力欄に残る（入力のたびに奪われない。AC-I4）", async () => {
    await mountKeys();
    filterInput().focus();
    await typeFilter("右");
    expect(document.activeElement).toBe(filterInput());
  });

  it("取り込み待ち中でも絞り込み欄への入力は奪われず、取り込み待ちの状態も変わらない（AC-I5）", async () => {
    await mountKeys();
    prefixBtn().click();
    await settle();
    expect(capture()).not.toBeNull();
    await typeFilter("拡大表示");
    expect(filterInput().value).toBe("拡大表示");
    expect(capture(), "絞り込みで取り込み待ちが終わらない").not.toBeNull();
  });
});

describe("KeySettings — こちらへ移す（AC4〜AC7・AC-I6〜AC-I10）", () => {
  it("衝突が無い通常の状態では「こちらへ移す」ボタンが無く、衝突したときだけ現れる（AC4・AC-I6）", async () => {
    await mountKeys();
    expect(moveHereBtn()).toBeNull();
    addBtn("goto", "prefix").click();
    await settle();
    press(capture()!, "v"); // 右へ分割（prefix+v）と衝突
    await settle();
    expect(moveHereBtn()).not.toBeNull();
  });

  it("押すと確認ダイアログなしで衝突相手から外れ対象へ移り、フォーカスが新しい割り当ての［変更］へ行く（AC5・AC-I7・AC-I9）", async () => {
    const { settings } = await mountKeys();
    addBtn("goto", "prefix").click();
    await settle();
    press(capture()!, "v");
    await settle();
    moveHereBtn()!.click();
    await settle();
    expect(settings.keymap.bindingsOf("split_vertical")).not.toContain("prefix+v");
    expect(settings.keymap.bindingsOf("goto")).toContain("prefix+v");
    expect(moveHereBtn(), "使ったら消える").toBeNull();
    expect(document.activeElement).toBe(changeBtn("goto", "prefix+v"));
  });

  it("使わずに別の取り込みを始めると消え、何も変わらない（AC6）", async () => {
    const { settings } = await mountKeys();
    addBtn("goto", "prefix").click();
    await settle();
    press(capture()!, "v");
    await settle();
    expect(moveHereBtn()).not.toBeNull();
    addBtn("help", "prefix").click(); // 別の取り込みを始める
    await settle();
    press(capture()!, "Escape");
    await settle();
    expect(moveHereBtn()).toBeNull();
    expect(settings.keymap.bindingsOf("split_vertical")).toContain("prefix+v"); // 何も変わっていない
  });

  it("ダイアログを閉じると「こちらへ移す」も消える（AC6）", async () => {
    const { view } = await mountKeys();
    addBtn("goto", "prefix").click();
    await settle();
    press(capture()!, "v");
    await settle();
    expect(moveHereBtn()).not.toBeNull();
    view.closeDialog();
    await settle();
    view.openDialogWithContext({ kind: "settings" });
    await settle();
    expect(moveHereBtn()).toBeNull();
  });

  it("prefix 自身との衝突では「こちらへ移す」を出さない（AC7）", async () => {
    await mountKeys();
    addBtn("goto", "prefix").click();
    await settle();
    press(capture()!, "b", { ctrlKey: true }); // 既定の prefix（ctrl+b）と衝突
    await settle();
    expect(status()).toContain("prefix");
    expect(moveHereBtn()).toBeNull();
  });

  it("範囲の操作（switch_tab）の一部との衝突では「こちらへ移す」を出さない（単一の chord として特定できない。AC7）", async () => {
    await mountKeys();
    addBtn("goto", "prefix").click();
    await settle();
    press(capture()!, "5"); // switch_tab の範囲（prefix+1..9）の一部と衝突
    await settle();
    expect(status()).toContain("tab を切り替え");
    expect(moveHereBtn()).toBeNull();
  });

  it("絞り込み欄・「こちらへ移す」ボタンとも通常のタブ順に乗る（明示的な tabindex を持たない。AC-I3・AC-I8）", async () => {
    await mountKeys();
    expect(filterInput().getAttribute("tabindex")).toBeNull();
    addBtn("goto", "prefix").click();
    await settle();
    press(capture()!, "v");
    await settle();
    expect(moveHereBtn()!.getAttribute("tabindex")).toBeNull();
  });

  it("「こちらへ移す」ボタンが実際に出ている状態でも、既存の各ボタンは変わらず存在する（並びを崩さない。AC-I10）", async () => {
    await mountKeys();
    addBtn("goto", "prefix").click();
    await settle();
    press(capture()!, "v"); // 衝突させ、「こちらへ移す」を実際に出す
    await settle();
    expect(moveHereBtn(), "この状態を検証するための前提").not.toBeNull();
    expect(changeBtn("split_vertical", "prefix+v")).not.toBeNull();
    expect(deleteBtn("split_vertical", "prefix+v")).not.toBeNull();
    expect(addBtn("split_vertical", "prefix")).not.toBeNull();
    expect(addBtn("split_vertical", "direct")).not.toBeNull();
    expect(addBtn("goto", "prefix")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// 20260922-keybinding-usability：macOS の Option chord 表示補正（US3）・Keyboard Lock の switch（US4）
// ---------------------------------------------------------------------------------------------------------------------

/** `navigator.platform`/`navigator.keyboard` を差し替える（テスト後に必ず `restore()` で戻す）。 */
function stubNavigator(opts: {
  mac?: boolean;
  getLayoutMap?: () => Promise<{ get(code: string): string | undefined }>;
}) {
  const platformDesc = Object.getOwnPropertyDescriptor(navigator, "platform");
  const keyboardDesc = Object.getOwnPropertyDescriptor(navigator, "keyboard");
  if (opts.mac !== undefined) {
    Object.defineProperty(navigator, "platform", {
      value: opts.mac ? "MacIntel" : "Win32",
      configurable: true,
    });
  }
  if (opts.getLayoutMap !== undefined) {
    Object.defineProperty(navigator, "keyboard", {
      value: { getLayoutMap: opts.getLayoutMap },
      configurable: true,
    });
  }
  return {
    restore() {
      if (platformDesc) Object.defineProperty(navigator, "platform", platformDesc);
      else delete (navigator as { platform?: unknown }).platform;
      if (keyboardDesc) Object.defineProperty(navigator, "keyboard", keyboardDesc);
      else delete (navigator as { keyboard?: unknown }).keyboard;
    },
  };
}

describe("KeySettings — macOS の Option chord 表示補正（AC8〜AC10）", () => {
  it("macOS で getLayoutMap が使えるとき、alt を含む chord の表示が置き換わる（AC8）", async () => {
    const stub = stubNavigator({
      mac: true,
      getLayoutMap: () => Promise.resolve({ get: (code: string) => (code === "KeyD" ? "z" : undefined) }),
    });
    try {
      const { settings } = await mountKeys();
      settings.setKeyBindings("split_vertical", ["prefix+v", "alt+d"]);
      await settle();
      await settle(); // getLayoutMap() の resolve を待つ
      expect(summaryText("split_vertical")).toBe("prefix+v / alt+z");
      // 保存・照合に使う値自体は変わらない（AC10）。
      expect(settings.keymap.bindingsOf("split_vertical")).toEqual(["prefix+v", "alt+d"]);
    } finally {
      stub.restore();
    }
  });

  it("macOS 以外・getLayoutMap 無し・取得失敗のときは今までどおりの表示のまま（AC9）", async () => {
    const stub = stubNavigator({ mac: false });
    try {
      const { settings } = await mountKeys();
      settings.setKeyBindings("split_vertical", ["prefix+v", "alt+d"]);
      await settle();
      expect(summaryText("split_vertical")).toBe("prefix+v / alt+d"); // 変わらない
    } finally {
      stub.restore();
    }
  });

  it("macOS で getLayoutMap が reject しても、例外を投げず今までどおりの表示のまま（AC9）", async () => {
    const stub = stubNavigator({ mac: true, getLayoutMap: () => Promise.reject(new Error("boom")) });
    try {
      const { settings } = await mountKeys();
      settings.setKeyBindings("split_vertical", ["prefix+v", "alt+d"]);
      await settle();
      await settle();
      expect(summaryText("split_vertical")).toBe("prefix+v / alt+d");
    } finally {
      stub.restore();
    }
  });

  it("prefix 自体が alt+<文字> のときも、節「キー」の prefix 表示に補正がかかる（cross 点検の指摘で追加。AC8）", async () => {
    const stub = stubNavigator({
      mac: true,
      getLayoutMap: () => Promise.resolve({ get: (code: string) => (code === "KeyD" ? "z" : undefined) }),
    });
    try {
      const { settings } = await mountKeys();
      settings.setKeyPrefix("alt+d");
      await settle();
      await settle();
      const prefixText = document.querySelector(".keys-prefix .keys-binding")!.textContent!.trim();
      expect(prefixText).toBe("alt+z");
    } finally {
      stub.restore();
    }
  });

  it("chip の［変更］［削除］の aria-label も、表示用に置き換わった chord を使う（cross 点検の指摘で追加。AC8・AC10）", async () => {
    const stub = stubNavigator({
      mac: true,
      getLayoutMap: () => Promise.resolve({ get: (code: string) => (code === "KeyD" ? "z" : undefined) }),
    });
    try {
      const { settings } = await mountKeys();
      settings.setKeyBindings("split_vertical", ["prefix+v", "alt+d"]);
      await settle();
      await settle();
      const chip = row("split_vertical").querySelector('[data-change="split_vertical|alt+d"]')!;
      expect(chip.getAttribute("aria-label")).toBe("「右へ分割」の alt+z を変更");
      const del = Array.from(row("split_vertical").querySelectorAll<HTMLElement>("button")).find((b) =>
        b.getAttribute("aria-label")?.includes("alt+z を削除"),
      );
      expect(del, "削除ボタンの aria-label も alt+z を使う").toBeTruthy();
      // 保存・照合に使う値自体（data-change の実体）は生の chord のまま（AC10：表示専用の変換）。
      expect(chip.getAttribute("data-change")).toBe("split_vertical|alt+d");
    } finally {
      stub.restore();
    }
  });
});

describe("KeySettings — Keyboard Lock の switch（AC11・AC-I11）", () => {
  const keyboardLockSwitch = (): HTMLElement =>
    document.querySelector<HTMLElement>('[role="switch"]')!;

  it("既定は無効。押すと入切が反映・保存される（AC11）", async () => {
    const { settings } = await mountKeys();
    expect(keyboardLockSwitch().getAttribute("aria-checked")).toBe("false");
    expect(settings.keyboardLockInFullscreen).toBe(false);
    keyboardLockSwitch().click();
    await settle();
    expect(settings.keyboardLockInFullscreen).toBe(true);
    expect(keyboardLockSwitch().getAttribute("aria-checked")).toBe("true");
    expect(readPrefs()["keyboardLockInFullscreen"]).toBe(true);
  });

  it("説明文言に「全画面」「対応ブラウザ」を含む（AC-I11）", async () => {
    await mountKeys();
    expect(keyboardLockSwitch().textContent).toContain("全画面");
    expect(keyboardLockSwitch().textContent).toContain("対応ブラウザ");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// 20260923-navigate-mode-keys：navigate モードの移動キー（AC1・AC2・AC4・AC5・AC-I1〜AC-I5）
// ---------------------------------------------------------------------------------------------------------------------

describe("KeySettings — navigate モードの移動（一覧・AC1）", () => {
  it("8操作の現在の割り当てが見える（既定は今のキー）。予約キー・矢印の注記を含む。navigate_open_menu は NAVIGATE_KEYS を直接参照する作りのため無改修で自動的に一覧へ現れる（20260925-sidebar-keyboard-menu。design「依拠する既存の事実」の裏付け）", async () => {
    await mountKeys();
    expect(navSummaryText("navigate_workspace_up")).toBe("up");
    expect(navSummaryText("navigate_workspace_down")).toBe("down");
    expect(navSummaryText("navigate_open_menu")).toBe("space");
    expect(navSummaryText("navigate_toggle_collapse")).toBe("z");
    expect(navSummaryText("navigate_pane_left")).toBe("h");
    expect(navSummaryText("navigate_pane_down")).toBe("j");
    expect(navSummaryText("navigate_pane_up")).toBe("k");
    expect(navSummaryText("navigate_pane_right")).toBe("l");
    const note = document.querySelector(".keys-navigate-note")!.textContent!;
    expect(note).toContain("esc");
    expect(note).toContain("予約");
    expect(note).toContain("pane の左右移動");
  });

  it("注記に navigate モードへ入る現在の割り当て（既定は ctrl+b w）が出る", async () => {
    const { settings } = await mountKeys();
    expect(settings.keymap.hintFor("workspace_picker")).toBe("ctrl+b w"); // 前提の確認
    const note = document.querySelector(".keys-navigate-note")!.textContent!;
    expect(note).toContain("navigate モード（ctrl+b w）");
  });

  it("prefix を変えると、注記の表記も追従する", async () => {
    const { settings } = await mountKeys();
    settings.setKeyPrefix("ctrl+a");
    await settle();
    const note = document.querySelector(".keys-navigate-note")!.textContent!;
    expect(note).toContain("navigate モード（ctrl+a w）");
  });

  it("workspace_picker の割り当てを全部外すと、注記から割り当ての表記が消える（未解決のプレースホルダを出さない。60 review ラウンド2の回帰）", async () => {
    const { settings } = await mountKeys();
    settings.setKeyBindings("workspace_picker", []);
    await settle();
    expect(settings.keymap.hintFor("workspace_picker")).toBeNull(); // 前提の確認
    const note = document.querySelector(".keys-navigate-note")!.textContent!;
    expect(note).not.toContain("prefix+w");
    expect(note).not.toContain("ctrl+b w");
    expect(note).not.toContain("（）"); // 空の丸括弧も残さない
    expect(note).toContain("navigate モードの中だけで効く"); // 注記の本文自体は出る
  });
});

describe("KeySettings — navigate の割り当ての追加・変更・削除（AC1・AC-I4）", () => {
  it("［追加］：押したキーで足され、フォーカスは押した［追加］へ戻る", async () => {
    const { settings } = await mountKeys();
    navAddBtn("navigate_pane_left").focus();
    navAddBtn("navigate_pane_left").click();
    await settle();
    press(capture()!, "h", { ctrlKey: true });
    await settle();
    expect(settings.navigateKeymap.bindingsOf("navigate_pane_left")).toEqual(["h", "ctrl+h"]);
    expect(navSummaryText("navigate_pane_left")).toBe("h / ctrl+h");
    expect(status()).toBe("「pane を左へ選ぶ」に ctrl+h を割り当てました。");
    expect(document.activeElement).toBe(navAddBtn("navigate_pane_left"));
  });

  it("［変更］：その割り当てを置き換え、フォーカスは新しい割り当ての［変更］へ移る", async () => {
    const { settings } = await mountKeys();
    navChangeBtn("navigate_pane_left", "h").click();
    await settle();
    press(capture()!, "h", { ctrlKey: true });
    await settle();
    expect(settings.navigateKeymap.bindingsOf("navigate_pane_left")).toEqual(["ctrl+h"]);
    expect(settings.navigateKeymap.ownerOf("h")).toBeNull();
    expect(document.activeElement).toBe(navChangeBtn("navigate_pane_left", "ctrl+h"));
  });

  it("［削除］：割り当てを外す。フォーカスは同じ行の次の［変更］、無ければ単一の［追加］へ", async () => {
    const { settings } = await mountKeys();
    settings.setNavigateKeyBindings("navigate_pane_left", ["h", "ctrl+h", "alt+h"]);
    await settle();
    navDeleteBtn("navigate_pane_left", "h").click();
    await settle();
    expect(settings.navigateKeymap.bindingsOf("navigate_pane_left")).toEqual(["ctrl+h", "alt+h"]);
    expect(document.activeElement).toBe(navChangeBtn("navigate_pane_left", "ctrl+h"));
    navDeleteBtn("navigate_pane_left", "alt+h").click();
    await settle();
    navDeleteBtn("navigate_pane_left", "ctrl+h").click();
    await settle();
    expect(settings.navigateKeymap.bindingsOf("navigate_pane_left")).toEqual([]);
    expect(navSummaryText("navigate_pane_left")).toBe("なし");
    expect(document.activeElement).toBe(navAddBtn("navigate_pane_left"));
    expect(status()).toContain("外しました");
  });

  it("外したキーは、別の navigate 操作へ割り当てられるようになる", async () => {
    const { settings } = await mountKeys();
    navDeleteBtn("navigate_pane_left", "h").click();
    await settle();
    navAddBtn("navigate_pane_down").click();
    await settle();
    press(capture()!, "h");
    await settle();
    expect(settings.navigateKeymap.ownerOf("h")).toBe("navigate_pane_down");
  });
});

describe("KeySettings — navigate の拒否（AC2・AC4・AC-I2）", () => {
  it("予約キー（tab・enter・shift+tab・left・right・修飾無し1〜9）は理由を出して拒否される（Esc 自体は「取り消し」の特別扱いを先に取るので対象外——AC-I1 の既存挙動）", async () => {
    const { settings } = await mountKeys();
    navAddBtn("navigate_pane_left").click();
    await settle();
    press(capture()!, "Enter");
    await settle();
    expect(status()).toContain("予約");
    expect(settings.navigateKeymap.bindingsOf("navigate_pane_left")).toEqual(["h"]);
    expect(capture()).toBeNull(); // 拒否：取り込み待ちは終わる（AC-I2）
  });

  it("別の navigate 操作がすでに使っているキーは理由（持ち主の名前）を出して拒否される", async () => {
    const { settings } = await mountKeys();
    navAddBtn("navigate_pane_left").click();
    await settle();
    press(capture()!, "j");
    await settle();
    expect(status()).toContain("下へ選ぶ");
    expect(settings.navigateKeymap.bindingsOf("navigate_pane_left")).toEqual(["h"]);
  });

  it("34〜35操作側で使われているキーとは衝突しない（表が完全に別）", async () => {
    const { settings } = await mountKeys();
    navAddBtn("navigate_workspace_up").click();
    await settle();
    press(capture()!, "v"); // prefix の後で split_vertical が使っている文字だが、navigate は別表
    await settle();
    expect(settings.navigateKeymap.bindingsOf("navigate_workspace_up")).toEqual(["up", "v"]);
  });

  it("修飾キー単体・IME・繰り返しは無視して待ち続ける", async () => {
    await mountKeys();
    navAddBtn("navigate_pane_left").click();
    await settle();
    press(capture()!, "Control", { ctrlKey: true });
    await settle();
    expect(capture()).not.toBeNull();
    expect(status()).toContain("修飾キーだけでは");
  });

  it("Escape（取り込み待ちの取り消し自体）で元のまま終わる", async () => {
    const { settings } = await mountKeys();
    navChangeBtn("navigate_pane_left", "h").focus();
    navChangeBtn("navigate_pane_left", "h").click();
    await settle();
    press(capture()!, "Escape");
    await settle();
    expect(settings.navigateKeymap.bindingsOf("navigate_pane_left")).toEqual(["h"]);
    expect(capture()).toBeNull();
    expect(document.activeElement).toBe(navChangeBtn("navigate_pane_left", "h"));
  });
});

describe("KeySettings — navigate の既定へ戻す（AC5）", () => {
  it("［既定に戻す］は上書きしている操作にだけ出る。押すと既定へ戻り、フォーカスは単一の［追加］へ", async () => {
    const { settings } = await mountKeys();
    expect(navResetBtn("navigate_pane_left")).toBeNull();
    settings.setNavigateKeyBindings("navigate_pane_left", ["ctrl+h"]);
    await settle();
    expect(navResetBtn("navigate_pane_left")).not.toBeNull();
    expect(navResetBtn("navigate_pane_down")).toBeNull(); // 他の操作は変わらず出ない
    navResetBtn("navigate_pane_left")!.click();
    await settle();
    expect(settings.navigateKeymap.bindingsOf("navigate_pane_left")).toEqual(["h"]);
    expect(status()).toBe("「pane を左へ選ぶ」を既定へ戻しました。");
    expect(navResetBtn("navigate_pane_left")).toBeNull();
    expect(document.activeElement).toBe(navAddBtn("navigate_pane_left"));
    expect(readPrefs()).not.toHaveProperty("keys");
  });

  it("既定のキーを別の navigate 操作が使っていれば、その分は戻さず、持ち主の名前を出す", async () => {
    const { settings } = await mountKeys();
    settings.setNavigateKeyBindings("navigate_pane_left", ["ctrl+h"]);
    settings.setNavigateKeyBindings("navigate_pane_down", ["h"]);
    await settle();
    navResetBtn("navigate_pane_left")!.click();
    await settle();
    expect(settings.navigateKeymap.bindingsOf("navigate_pane_left")).toEqual([]);
    expect(status()).toContain("上書きを外しました");
    expect(status()).not.toContain("既定へ戻しました");
    expect(status()).toContain("戻せなかった既定のキー");
    expect(status()).toContain("下へ選ぶ");
  });

  it("割り当てなし（[]）にした操作も戻せる", async () => {
    const { settings } = await mountKeys();
    navDeleteBtn("navigate_workspace_up", "up").click();
    await settle();
    expect(navSummaryText("navigate_workspace_up")).toBe("なし");
    expect(navResetBtn("navigate_workspace_up")).not.toBeNull();
    navResetBtn("navigate_workspace_up")!.click();
    await settle();
    expect(settings.navigateKeymap.bindingsOf("navigate_workspace_up")).toEqual(["up"]);
  });

  it("「すべて既定に戻す」でも navigate の上書きが消える（既存34〜35操作のボタンを共用）", async () => {
    const { settings } = await mountKeys();
    settings.setNavigateKeyBindings("navigate_pane_left", ["ctrl+h"]);
    await settle();
    resetAllBtn()!.click();
    await settle();
    document.querySelector<HTMLElement>("[data-confirm-yes]")!.click();
    await settle();
    expect(settings.keyPrefs).toEqual({ prefix: null, bindings: {}, navigateKeys: {}, commands: {} });
    expect(navSummaryText("navigate_pane_left")).toBe("h");
  });
});

describe("KeySettings — navigate は絞り込みの対象に含まれる（AC1）", () => {
  it("操作名の一部で一致すれば残り、一致しなければ節ごと消える", async () => {
    await mountKeys();
    await typeFilter("workspace を上へ選ぶ");
    expect(navRow("navigate_workspace_up")).not.toBeNull();
    expect(document.querySelector('[data-navigate-key="navigate_pane_left"]')).toBeNull();
    expect(
      Array.from(document.querySelectorAll(".keys-group-name")).map((h) => h.textContent),
    ).not.toContain("全体"); // 34〜35操作側は一致が無いので消える

    await typeFilter("該当なしのはずの文字列ｚｚｚ");
    expect(document.querySelector('[data-navigate-key]')).toBeNull();
    expect(
      Array.from(document.querySelectorAll(".keys-group-name")).map((h) => h.textContent),
    ).not.toContain("navigate モードの移動");
  });
});

// 20260927-custom-command-keys：群「独自コマンド」（AC12）
describe("KeySettings — 独自コマンド（AC12）", () => {
  async function mountWithCommands() {
    const commands = useCommandsStore(pinia);
    commands.setCatalog({
      commands: [
        { id: "lazygit", type: "popup", description: "lazygit を開く" },
        { id: "build", type: "shell" },
      ],
      problem: null,
    });
    const r = await mountKeys();
    return { ...r, commands };
  }

  it("一覧の各コマンドが群「独自コマンド」に名前（説明か id）で並び、割り当てなしは「なし」。［既定に戻す］は出ない", async () => {
    await mountWithCommands();
    expect(Array.from(document.querySelectorAll(".keys-group-name")).map((h) => h.textContent)).toEqual([
      "全体",
      "workspace / tab",
      "pane",
      "独自コマンド",
      "navigate モードの移動",
    ]);
    expect(row("command:lazygit").querySelector(".keys-action-label")!.textContent).toBe("lazygit を開く");
    expect(row("command:build").querySelector(".keys-action-label")!.textContent).toBe("build");
    expect(summaryText("command:build")).toBe("なし");
    expect(document.querySelector(".keys-commands-note")).toBeNull();
  });

  it("既存の操作と同じ手順で追加・変更・削除でき、保存に残る", async () => {
    const { settings } = await mountWithCommands();
    addBtn("command:lazygit", "prefix").click();
    await settle();
    press(capture()!, "g", { altKey: true });
    await settle();
    expect(settings.keymap.bindingsOf("command:lazygit")).toEqual(["prefix+alt+g"]);
    expect(status()).toBe("「lazygit を開く」に prefix+alt+g を割り当てました。");
    expect((readPrefs()["keys"] as { commands: unknown }).commands).toEqual({ lazygit: ["prefix+alt+g"] });
    changeBtn("command:lazygit", "prefix+alt+g").click();
    await settle();
    press(capture()!, "l", { altKey: true });
    await settle();
    expect(settings.keymap.bindingsOf("command:lazygit")).toEqual(["prefix+alt+l"]);
    expect(row("command:lazygit").querySelector("[data-reset-action]")).toBeNull();
    deleteBtn("command:lazygit", "prefix+alt+l").click();
    await settle();
    expect(settings.keymap.bindingsOf("command:lazygit")).toEqual([]);
    expect(readPrefs()["keys"]).toBeUndefined();
  });

  it("既存の操作とぶつかれば理由を出して断り、「こちらへ移す」で移せる", async () => {
    const { settings } = await mountWithCommands();
    addBtn("command:build", "prefix").click();
    await settle();
    press(capture()!, "v");
    await settle();
    expect(status()).toContain("prefix+v は「右へ分割");
    expect(settings.keymap.bindingsOf("command:build")).toEqual([]);
    moveHereBtn()!.click();
    await settle();
    expect(settings.keymap.bindingsOf("command:build")).toEqual(["prefix+v"]);
    expect(settings.keymap.bindingsOf("split_vertical")).not.toContain("prefix+v");
    expect(status()).toContain("「build」へ移しました");
  });

  it("［変更］の後は新しい割り当ての［変更］へ、［削除］の後は同じ行の［追加：prefix の後］へフォーカスが移る（AC-I4）", async () => {
    await mountWithCommands();
    addBtn("command:lazygit", "prefix").click();
    await settle();
    press(capture()!, "g", { altKey: true });
    await settle();
    changeBtn("command:lazygit", "prefix+alt+g").click();
    await settle();
    press(capture()!, "l", { altKey: true });
    await settle();
    expect(document.activeElement).toBe(changeBtn("command:lazygit", "prefix+alt+l"));
    deleteBtn("command:lazygit", "prefix+alt+l").click();
    await settle();
    expect(document.activeElement).toBe(addBtn("command:lazygit", "prefix"));
  });

  it("独自コマンドが持っているキーを操作に取り込むと、コマンドの名前で断り、「こちらへ移す」で操作へ移せる", async () => {
    const { settings } = await mountWithCommands();
    settings.setKeyBindings("command:lazygit", ["prefix+alt+g"]);
    await settle();
    addBtn("goto", "prefix").click();
    await settle();
    press(capture()!, "g", { altKey: true });
    await settle();
    expect(status()).toContain("「lazygit を開く」がすでに使っています");
    moveHereBtn()!.click();
    await settle();
    expect(settings.keymap.bindingsOf("command:lazygit")).toEqual([]);
    expect(settings.keymap.bindingsOf("goto")).toContain("prefix+alt+g");
    expect(status()).toContain("「lazygit を開く」から「");
  });

  it("絞り込みは名前・群名で効く", async () => {
    await mountWithCommands();
    await typeFilter("独自");
    expect(document.querySelectorAll('[data-action^="command:"]')).toHaveLength(2);
    await typeFilter("lazygit");
    expect(document.querySelectorAll('[data-action^="command:"]')).toHaveLength(1);
  });

  it("一覧が 0 件なら群の代わりに置き場所の案内、読めなかった理由があればそれも出す", async () => {
    const commands = useCommandsStore(pinia);
    commands.setCatalog({ commands: [], problem: "commands.json: 知らない項目です（env）" });
    await mountKeys();
    const note = document.querySelector(".keys-commands-note")!;
    expect(note.textContent).toContain("commands.json");
    expect(note.textContent).toContain("設定を読み直す」（ctrl+b shift+r）");
    expect(note.querySelector(".keys-commands-problem")!.textContent).toContain("知らない項目です（env）");
    expect(document.querySelectorAll('[data-action^="command:"]')).toHaveLength(0);
    // 絞り込みが群名に当たらなければ案内も消える（0 件の群は見出しごと消える）。
    await typeFilter("pane");
    expect(document.querySelector(".keys-commands-note")).toBeNull();
    await typeFilter("独自");
    expect(document.querySelector(".keys-commands-note")).not.toBeNull();
  });
});
