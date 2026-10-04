import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCommandsStore } from "../store/commands.js";
import { useSettingsStore } from "../store/settings.js";
import { useViewStore } from "../store/view.js";
import HelpDialog from "./HelpDialog.vue";

let pinia: Pinia;

beforeEach(() => {
  localStorage.clear(); // 割り当て（soda.prefs.v1 の keys）を保存するテストがあるので、前のテストの値を持ち越さない
  pinia = createPinia();
});
afterEach(() => {
  localStorage.clear();
});

function mountDialog() {
  return mount(HelpDialog, { global: { plugins: [pinia] }, attachTo: document.body });
}

async function open(view: ReturnType<typeof useViewStore>, wrapper: ReturnType<typeof mountDialog>) {
  view.openDialogWithContext({ kind: "help" });
  await wrapper.vm.$nextTick();
  await wrapper.vm.$nextTick();
}

describe("HelpDialog — 表示", () => {
  it("4 つの群（全体・移動・workspace / tab・pane）を出す。独自コマンドが無ければその群は出ない", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog();
    await open(view, wrapper);
    const names = wrapper.findAll(".help-dialog-group-name").map((el) => el.text());
    expect(names).toEqual(["全体", "移動", "workspace / tab", "pane"]);
  });

  it("独自コマンドは、割り当てのあるものだけを群「独自コマンド」に名前（説明か id）とキーで出す（20260927-custom-command-keys の AC14）", async () => {
    const view = useViewStore(pinia);
    const settings = useSettingsStore(pinia);
    const commands = useCommandsStore(pinia);
    commands.setCatalog({
      commands: [
        { id: "git", type: "popup", description: "lazygit を開く" },
        { id: "build", type: "shell" },
        { id: "unbound", type: "pane" },
      ],
      problem: null,
    });
    settings.setKeyBindings("command:git", ["prefix+alt+g"]);
    settings.setKeyBindings("command:build", ["ctrl+alt+b", "prefix+alt+b"]);
    const wrapper = mountDialog();
    await open(view, wrapper);
    expect(wrapper.findAll(".help-dialog-group-name").map((el) => el.text())).toEqual(["全体", "移動", "workspace / tab", "pane", "独自コマンド"]);
    const label = (keys: string) => wrapper.findAll("dt").find((dt) => dt.text() === keys)?.element.nextElementSibling?.textContent;
    expect(label("prefix+alt+g")).toBe("lazygit を開く");
    expect(label("ctrl+alt+b / prefix+alt+b")).toBe("build"); // 割り当てた順
    expect(wrapper.text()).not.toContain("unbound");
  });

  it("既定の表示：割り当てなしの行は灰色。「未対応（後続: ◯◯）」の行はもう無い（20260926-edit-scrollback で最後の e が昇格）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog();
    await open(view, wrapper);
    const grayed = wrapper.findAll(".help-dialog-grayed");
    expect(grayed.length).toBeGreaterThan(0);
    // `o` は 20260920-agent-notifications で「次の知らせへ移る」になった。
    expect(wrapper.text()).toContain("次の知らせへ移る");
    // `shift+r` は 20260922-appearance-settings-rest T7 で「設定を読み直す」（reload_config）の
    // 既定割り当てに昇格し、「後続」の案内からは外れた。
    expect(wrapper.text()).toContain("設定を読み直す");
    // `s` の行を特定して見る——「設定」は「設定を読み直す」（reload_config）にも含まれるので、全文の `toContain` では
    // `s` の表記が何であっても通ってしまう（20260921-herdr-settings-gaps で「通知の設定」から「設定」に広げた）。
    const sLabel = wrapper.findAll("dt").find((dt) => dt.text() === "prefix+s")?.element.nextElementSibling?.textContent;
    expect(sLabel).toBe("設定");
    expect(wrapper.text(), "壊れた表示（work 名が空）を出さない").not.toContain("未対応（後続: ）");
    // `shift+g`（グルーピングの枠）は 20260920-git-worktree-actions で「新しい worktree」に置き換わった。
    expect(wrapper.text()).toContain("新しい worktree");
    const eLabel = wrapper.findAll("dt").find((dt) => dt.text() === "prefix+e")?.element.nextElementSibling?.textContent;
    expect(eLabel).toBe("スクロールバックをエディタで開く");
    expect(wrapper.text()).not.toContain("未対応");
  });

  it("H/J/K/L（swap）は herdr のヘルプにも出ないので、ここにも出さない（D76）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog();
    await open(view, wrapper);
    expect(wrapper.text()).not.toContain("入れ替え");
  });

  it("/ で絞り込むと、一致 0 件の群は消える", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog();
    await open(view, wrapper);
    await wrapper.get("input").setValue("拡大");
    const names = wrapper.findAll(".help-dialog-group-name").map((el) => el.text());
    expect(names).toEqual(["pane"]);
    expect(wrapper.findAll("dt").map((el) => el.text())).toEqual(["prefix+z"]);
  });
});

describe("HelpDialog — Esc/Enter/? の分岐", () => {
  it("絞り込み中の Esc は文字を消して検索欄から離れる（閉じない）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog();
    await open(view, wrapper);
    const input = wrapper.get("input");
    await input.setValue("zoom");
    (input.element as HTMLInputElement).focus();
    await wrapper.get("dialog").trigger("keydown", { key: "Escape" });
    expect((input.element as HTMLInputElement).value).toBe("");
    expect(view.dialogContext).not.toBeNull();
    expect((wrapper.get("dialog").element as HTMLDialogElement).open).toBe(true);
  });

  it("絞り込み中でも Enter は閉じる", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog();
    await open(view, wrapper);
    const input = wrapper.get("input");
    await input.setValue("zoom");
    (input.element as HTMLInputElement).focus();
    await wrapper.get("dialog").trigger("keydown", { key: "Enter" });
    expect(view.dialogContext).toBeNull();
  });

  it("絞り込んでいないときは Esc・Enter・? で閉じる", async () => {
    const view = useViewStore(pinia);
    for (const key of ["Escape", "Enter", "?"]) {
      const wrapper = mountDialog();
      await open(view, wrapper);
      await wrapper.get("dialog").trigger("keydown", { key });
      expect(view.dialogContext).toBeNull();
      wrapper.unmount();
    }
  });

  it("外側（backdrop）のクリックで閉じる", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog();
    await open(view, wrapper);
    await wrapper.get("dialog").trigger("click");
    expect(view.dialogContext).toBeNull();
  });
});

describe("HelpDialog — スクロール", () => {
  it("絞り込んでいないときは j/k・PageUp/PageDown・Home/End でスクロールする", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog();
    await open(view, wrapper);
    const list = wrapper.get(".help-dialog-list").element as HTMLElement;
    list.scrollTop = 100;

    await wrapper.get("dialog").trigger("keydown", { key: "j" });
    expect(list.scrollTop).toBe(132);
    await wrapper.get("dialog").trigger("keydown", { key: "k" });
    expect(list.scrollTop).toBe(100);
    await wrapper.get("dialog").trigger("keydown", { key: "PageDown" });
    expect(list.scrollTop).toBe(340);
    await wrapper.get("dialog").trigger("keydown", { key: "Home" });
    expect(list.scrollTop).toBe(0);
  });

  it("絞り込み中は j/k はスクロールせず（入力欄の文字として入る）、矢印/PageUp/PageDownはスクロールする", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog();
    await open(view, wrapper);
    const input = wrapper.get("input");
    (input.element as HTMLInputElement).focus();
    const list = wrapper.get(".help-dialog-list").element as HTMLElement;
    list.scrollTop = 50;

    await wrapper.get("dialog").trigger("keydown", { key: "j" });
    expect(list.scrollTop).toBe(50); // 効かない

    await wrapper.get("dialog").trigger("keydown", { key: "ArrowDown" });
    expect(list.scrollTop).toBe(82); // 効く
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// 20260921-keybinding-customization：キー一覧は現在の割り当てから作る（AC11）
// ---------------------------------------------------------------------------------------------------------------------

describe("HelpDialog — 現在の割り当て（AC11）", () => {
  const dts = (w: ReturnType<typeof mountDialog>) => w.findAll("dt").map((el) => el.text());
  const rowOf = (w: ReturnType<typeof mountDialog>, keys: string) => w.findAll("dt").find((dt) => dt.text() === keys);

  it("何も変えていなければ、今のキー（prefix+ を付けた表記）。先頭に prefix の行。tab / shift+tab の行は pane 群の巡回へ", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog();
    await open(view, wrapper);
    const groups = wrapper.findAll(".help-dialog-group");
    // 全体：prefix・?・q・s・o・shift+r・連携（グラフ。a。20260927-agent-graph）・サーバを止める（既定なし。20260927-cli-mode）
    expect(groups[0]!.findAll("dt").map((el) => el.text())).toEqual(["ctrl+b", "prefix+?", "prefix+q", "prefix+s", "prefix+o", "prefix+shift+r", "prefix+a", "なし"]);
    expect(groups[0]!.findAll("dd")[0]!.text()).toContain("prefix");
    // 移動（navigate モードの操作は現在の割り当てから作る。20260923-navigate-mode-keys。AC7）。
    // 既定は up/down/h/j/k/l で、pane 左右は矢印の固定フォールバックが常に併記される（decisions D3）。
    // navigate_open_menu（既定 space）は20260925-sidebar-keyboard-menuで7件目として加わった。
    expect(groups[1]!.findAll("dt").map((el) => el.text())).toEqual([
      "esc",
      "up",
      "down",
      "space",
      "z",
      "h ・ ←",
      "j",
      "k",
      "l ・ →",
      "enter",
    ]);
    // workspace / tab
    expect(groups[2]!.findAll("dt").map((el) => el.text())).toContain("prefix+1..9");
    expect(groups[2]!.findAll("dt").map((el) => el.text())).toContain("prefix+shift+n");
    // pane：巡回（prefix+tab・prefix+shift+tab）は操作の行、swap は出さない、e はスクロールバックをエディタで開く（20260926-edit-scrollback）
    const pane = groups[3]!.findAll("dt").map((el) => el.text());
    expect(pane).toContain("prefix+tab");
    expect(pane).toContain("prefix+shift+tab");
    expect(pane).toContain("prefix+-");
    expect(pane).toContain("prefix+e");
    expect(wrapper.text()).not.toContain("入れ替え");
  });

  it("prefix を変えると先頭の行が変わる。割り当てを変えると、その操作の行が変わる（prefix の後・直接・複数）", async () => {
    const settings = useSettingsStore(pinia);
    settings.setKeyPrefix("ctrl+a");
    settings.setKeyBindings("split_vertical", ["prefix+|", "ctrl+alt+d"]);
    const view = useViewStore(pinia);
    const wrapper = mountDialog();
    await open(view, wrapper);
    expect(dts(wrapper)[0]).toBe("ctrl+a");
    const split = rowOf(wrapper, "prefix+| / ctrl+alt+d");
    expect(split?.element.nextElementSibling?.textContent).toBe("右へ分割");
    expect(rowOf(wrapper, "prefix+v")).toBeUndefined();
  });

  it("開いている間に割り当てを変えても、その場で追従する", async () => {
    const view = useViewStore(pinia);
    const settings = useSettingsStore(pinia);
    const wrapper = mountDialog();
    await open(view, wrapper);
    expect(rowOf(wrapper, "prefix+z")).toBeDefined();
    settings.setKeyBindings("zoom", ["ctrl+alt+z"]);
    await wrapper.vm.$nextTick();
    expect(rowOf(wrapper, "prefix+z")).toBeUndefined();
    expect(rowOf(wrapper, "ctrl+alt+z")?.element.nextElementSibling?.textContent).toBe("拡大表示");
  });

  it("割り当てなしの操作は「なし」（灰色）で出す", async () => {
    const settings = useSettingsStore(pinia);
    settings.setKeyBindings("detach", []);
    const view = useViewStore(pinia);
    const wrapper = mountDialog();
    await open(view, wrapper);
    const none = rowOf(wrapper, "なし");
    expect(none?.element.nextElementSibling?.textContent).toBe("このブラウザを切り離す");
    expect(none?.classes()).toContain("help-dialog-grayed");
  });

  it("e を別の操作に割り当てると、スクロールバックをエディタで開く行は「なし」（灰色）になる（20260926-edit-scrollback の AC10）", async () => {
    const settings = useSettingsStore(pinia);
    settings.setKeyBindings("goto", ["prefix+g", "prefix+e"]);
    const view = useViewStore(pinia);
    const wrapper = mountDialog();
    await open(view, wrapper);
    expect(rowOf(wrapper, "prefix+g / prefix+e")).toBeDefined();
    expect(rowOf(wrapper, "prefix+e")).toBeUndefined();
    const row = wrapper.findAll("dd").find((dd) => dd.text() === "スクロールバックをエディタで開く");
    expect(row?.element.previousElementSibling?.textContent).toBe("なし");
    expect(wrapper.text()).not.toContain("undefined");
  });

  it("shift+r を別の操作に割り当てると、reload_config の既定行は「なし」になる（後続ではなく通常の上書き。全体の群）", async () => {
    // shift+r は 20260922-appearance-settings-rest T7 で reload_config の既定割り当てに昇格した
    // ので、これはもう「後続」の案内の上書きではなく、他の操作と同じ「上書きが既定に勝つ」
    // （黙って割り当てを失う）一般則の確認になる。
    const settings = useSettingsStore(pinia);
    settings.setKeyBindings("help", ["prefix+?", "prefix+R"]);
    const view = useViewStore(pinia);
    const wrapper = mountDialog();
    await open(view, wrapper);
    expect(rowOf(wrapper, "prefix+? / prefix+shift+r")).toBeDefined();
    const none = rowOf(wrapper, "なし");
    expect(none?.element.nextElementSibling?.textContent).toBe("設定を読み直す");
    expect(none?.classes()).toContain("help-dialog-grayed");
    expect(rowOf(wrapper, "prefix+e")?.element.nextElementSibling?.textContent).toBe("スクロールバックをエディタで開く"); // e はそのまま
  });

  it("絞り込みは現在の表記でも効く（ctrl+alt）。一致 0 件の群は消える", async () => {
    const settings = useSettingsStore(pinia);
    settings.setKeyBindings("split_vertical", ["prefix+v", "ctrl+alt+d"]);
    const view = useViewStore(pinia);
    const wrapper = mountDialog();
    await open(view, wrapper);
    await wrapper.get("input").setValue("ctrl+alt");
    expect(wrapper.findAll(".help-dialog-group-name").map((el) => el.text())).toEqual(["pane"]);
    expect(dts(wrapper)).toEqual(["prefix+v / ctrl+alt+d"]);
  });

  it("navigate モードの移動キーを変えると、移動の群の行が即時に追従する（20260923-navigate-mode-keys・AC7）", async () => {
    const settings = useSettingsStore(pinia);
    const view = useViewStore(pinia);
    const wrapper = mountDialog();
    await open(view, wrapper);
    settings.setNavigateKeyBindings("navigate_pane_left", ["ctrl+h"]);
    await wrapper.vm.$nextTick();
    const group = wrapper.findAll(".help-dialog-group")[1]!;
    expect(group.findAll("dt").map((el) => el.text())).toEqual([
      "esc",
      "up",
      "down",
      "space",
      "z",
      "ctrl+h ・ ←",
      "j",
      "k",
      "l ・ →",
      "enter",
    ]);
  });

  it("navigate の割り当てを外しても、矢印は常に併記される（pane 左右は固定フォールバック。decisions D3）", async () => {
    const settings = useSettingsStore(pinia);
    settings.setNavigateKeyBindings("navigate_pane_left", []);
    settings.setNavigateKeyBindings("navigate_workspace_up", []);
    const view = useViewStore(pinia);
    const wrapper = mountDialog();
    await open(view, wrapper);
    const group = wrapper.findAll(".help-dialog-group")[1]!;
    const rows = group.findAll("dt");
    expect(rows.map((el) => el.text())).toContain("なし ・ ←"); // 素の割り当ては無いが矢印は常に効く
    expect(rows.map((el) => el.text())).toContain("なし"); // workspace 上は矢印の固定フォールバックが無い
    expect(rows[1]!.classes()).toContain("help-dialog-grayed"); // navigate_workspace_up の行（未設定なので灰色）
    // pane 左（rows[5]。rows[3]・rows[4] は navigate_open_menu・navigate_toggle_collapse の行）は
    // 素の割り当てが無くても矢印が常に効くので、灰色にしない（design のスケッチどおり）。
    expect(rows[5]!.text()).toBe("なし ・ ←");
    expect(rows[5]!.classes()).not.toContain("help-dialog-grayed");
  });
});
