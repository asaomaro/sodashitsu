import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { DEFAULT_LAYOUTS } from "@sodashitsu/client-core";
import { useSettingsStore } from "../store/settings.js";
import { readPrefs, useViewStore } from "../store/view.js";
import SidebarRowsSettings from "./SidebarRowsSettings.vue";

/** 20260927-sidebar-row-tokens の AC11・AC13〜AC15・AC-I1〜AC-I5（並びの編集の部品）。 */

let pinia: Pinia;
let wrapper: VueWrapper | null = null;

beforeEach(() => {
  localStorage.clear();
  pinia = createPinia();
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = "";
  localStorage.clear();
});

function mountIt(): VueWrapper {
  const view = useViewStore(pinia);
  view.openDialogWithContext({ kind: "settings" });
  wrapper = mount(SidebarRowsSettings, { attachTo: document.body, global: { plugins: [pinia] } });
  return wrapper;
}
const area = (w: VueWrapper, a: "spaces" | "agents") => w.find(`[data-area="${a}"]`);
const lineOf = (w: VueWrapper, a: "spaces" | "agents", i: number) =>
  area(w, a).findAll("[data-line]")[i]!;
const saved = () => readPrefs()["sidebarRows"] as Record<string, unknown> | undefined;

describe("SidebarRowsSettings — 開閉と既定（AC-I1・AC11）", () => {
  it("折りたたみの見出しと、区画ごとの既定の並びを出す", () => {
    const w = mountIt();
    expect(w.find("details > summary").text()).toBe("サイドバーの行（上級者向け）");
    expect(area(w, "spaces").find("legend").text()).toContain("（既定）");
    expect(area(w, "spaces").findAll("[data-line]")).toHaveLength(DEFAULT_LAYOUTS.spaces.length);
    expect(
      lineOf(w, "spaces", 0)
        .findAll(".sr-token-id")
        .map((c) => c.text()),
    ).toEqual(["state_icon", "workspace"]);
    expect(
      lineOf(w, "agents", 1)
        .findAll(".sr-token-id")
        .map((c) => c.text()),
    ).toEqual(["name", "agent", "unverified"]);
  });

  it("［詳細］は aria-expanded で開閉し、閉じても値は変わらない", async () => {
    const w = mountIt();
    const btn = lineOf(w, "spaces", 0).findAll("[data-toggle-detail]")[1]!;
    expect(btn.attributes("aria-expanded")).toBe("false");
    await btn.trigger("click");
    expect(btn.attributes("aria-expanded")).toBe("true");
    const id = btn.attributes("aria-controls")!;
    expect(w.find(`#${id}`).exists()).toBe(true);
    await btn.trigger("click");
    expect(btn.attributes("aria-expanded")).toBe("false");
    expect(w.find(`#${id}`).exists()).toBe(false);
    expect(saved()).toBeUndefined();
  });
});

describe("SidebarRowsSettings — トークンと行の編集（AC11・AC-I2・AC-I4）", () => {
  it("組み込みのトークンを足すと、選んだ時点で保存・反映される（既定の写しから始める）", async () => {
    const w = mountIt();
    const line = lineOf(w, "spaces", 1);
    await line.find(".sr-add-token select").setValue("branch");
    await line.find("[data-add-token]").trigger("click");
    const settings = useSettingsStore(pinia);
    expect(settings.spacesLayout).toEqual([
      [{ token: "state_icon" }, { token: "workspace" }],
      [{ token: "git" }, { token: "branch" }],
    ]);
    expect(saved()).toEqual({ spaces: settings.spacesLayout });
    expect(DEFAULT_LAYOUTS.spaces[1]).toEqual([{ token: "git" }]); // 既定そのものは変えない
    expect(area(w, "spaces").find("legend").text()).not.toContain("（既定）");
  });

  it("独自トークン: 規則外の名前は足さずに理由を出す。$ は付けても付けなくてもよい。Enter でも足せる", async () => {
    const w = mountIt();
    const line = () => lineOf(w, "agents", 0);
    await line().find(".sr-add-token select").setValue("$");
    const input = line().find(".sr-add-token input");
    await input.setValue("bad.name");
    await line().find("[data-add-token]").trigger("click");
    expect(saved()).toBeUndefined();
    expect(area(w, "agents").find(".sr-message").text()).toContain("独自トークンの名前");
    await input.setValue("summary");
    await input.trigger("keydown", { key: "Enter" });
    expect(useSettingsStore(pinia).agentsLayout[0]!.at(-1)).toEqual({ token: "$summary" });
    await line().find(".sr-add-token select").setValue("$");
    await line().find(".sr-add-token input").setValue("$model");
    await line().find("[data-add-token]").trigger("click");
    expect(useSettingsStore(pinia).agentsLayout[0]!.at(-1)).toEqual({ token: "$model" });
  });

  it("トークンを動かすと、動いた先の同じ向きのボタンへフォーカスが移る", async () => {
    const w = mountIt();
    const next = lineOf(w, "spaces", 0).findAll('[data-move-token="1"]')[0]!;
    (next.element as HTMLElement).focus();
    await next.trigger("click");
    await nextTick();
    expect(useSettingsStore(pinia).spacesLayout[0]).toEqual([
      { token: "workspace" },
      { token: "state_icon" },
    ]);
    // 末尾へ動いたので「後へ」は押せない→「前へ」へ
    expect(document.activeElement).toBe(
      lineOf(w, "spaces", 0).findAll('[data-move-token="-1"]')[1]!.element,
    );
  });

  it("トークンを消すと、繰り上がった項目の［削除］、無ければ［追加］へフォーカスが移る", async () => {
    const w = mountIt();
    await lineOf(w, "spaces", 0).findAll("[data-remove-token]")[0]!.trigger("click");
    await nextTick();
    expect(useSettingsStore(pinia).spacesLayout[0]).toEqual([{ token: "workspace" }]);
    expect(document.activeElement).toBe(
      lineOf(w, "spaces", 0).findAll("[data-remove-token]")[0]!.element,
    );
    await lineOf(w, "spaces", 0).findAll("[data-remove-token]")[0]!.trigger("click");
    await nextTick();
    expect(document.activeElement).toBe(lineOf(w, "spaces", 0).find("[data-add-token]").element);
  });

  it("行を足す・動かす・消す。最後の行を消したら［行を追加］へ", async () => {
    const w = mountIt();
    await area(w, "spaces").find("[data-add-line]").trigger("click");
    expect(useSettingsStore(pinia).spacesLayout).toHaveLength(3);
    await lineOf(w, "spaces", 0).find('[data-move-line="1"]').trigger("click");
    expect(useSettingsStore(pinia).spacesLayout[1]).toEqual([
      { token: "state_icon" },
      { token: "workspace" },
    ]);
    for (let i = 0; i < 3; i++) {
      await area(w, "spaces").findAll("[data-remove-line]").at(-1)!.trigger("click");
      await nextTick();
    }
    expect(useSettingsStore(pinia).spacesLayout).toEqual([]);
    expect(document.activeElement).toBe(area(w, "spaces").find("[data-add-line]").element);
  });

  it("上限に達したら［追加］を押せない", async () => {
    const settings = useSettingsStore(pinia);
    settings.setSidebarLayout("spaces", [
      Array.from({ length: 16 }, () => ({ token: "workspace" })),
      ...Array.from({ length: 15 }, () => []),
    ]);
    const w = mountIt();
    expect(area(w, "spaces").find("[data-add-line]").attributes("disabled")).toBeDefined();
    expect(lineOf(w, "spaces", 0).find("[data-add-token]").attributes("disabled")).toBeDefined();
    expect(lineOf(w, "spaces", 1).find("[data-add-token]").attributes("disabled")).toBeUndefined();
  });
});

describe("SidebarRowsSettings — 見た目（AC13・AC-I2）", () => {
  async function openDetail(w: VueWrapper, a: "spaces" | "agents", ri: number, ti: number) {
    await lineOf(w, a, ri).findAll("[data-toggle-detail]")[ti]!.trigger("click");
    return lineOf(w, a, ri).findAll("[data-token-item]")[ti]!.find(".sr-detail");
  }

  it("前景色: 規則外は保存せず理由を出して入力欄に残す。正しい色は Enter・change で保存。空で既定へ", async () => {
    const w = mountIt();
    let detail = await openDetail(w, "spaces", 0, 1);
    const fg = () => detail.find("input");
    await fg().setValue("red");
    expect(saved()).toBeUndefined();
    expect(area(w, "spaces").find(".sr-message").text()).toContain("#RGB か #RRGGBB");
    expect((fg().element as HTMLInputElement).value).toBe("red");
    (fg().element as HTMLInputElement).value = "#f55";
    await fg().trigger("input");
    await fg().trigger("keydown", { key: "Enter" });
    expect(useSettingsStore(pinia).spacesLayout[0]![1]).toEqual({ token: "workspace", fg: "#f55" });
    detail = lineOf(w, "spaces", 0).findAll("[data-token-item]")[1]!.find(".sr-detail");
    await fg().setValue("  ");
    expect(useSettingsStore(pinia).spacesLayout[0]![1]).toEqual({ token: "workspace" });
  });

  it("太字・薄字は 既定／入／切 の選択（切は false として保存）", async () => {
    const w = mountIt();
    const detail = await openDetail(w, "agents", 1, 1);
    const [bold, dim] = detail.findAll(":scope > label select");
    await bold!.setValue("on");
    await dim!.setValue("off");
    expect(useSettingsStore(pinia).agentsLayout[1]![1]).toEqual({
      token: "agent",
      bold: true,
      dim: false,
    });
    await bold!.setValue("default");
    expect(useSettingsStore(pinia).agentsLayout[1]![1]).toEqual({ token: "agent", dim: false });
  });

  it("文字の値でないトークン（state_icon）には条件を出さない", async () => {
    const w = mountIt();
    const detail = await openDetail(w, "spaces", 0, 0);
    expect(detail.find("[data-add-rule]").exists()).toBe(false);
    expect(detail.text()).toContain("条件を付けられません");
  });
});

describe("SidebarRowsSettings — 条件（AC14・AC-I2・AC-I4）", () => {
  async function detailOf(w: VueWrapper) {
    await lineOf(w, "agents", 1).findAll("[data-toggle-detail]")[1]!.trigger("click");
    return () => lineOf(w, "agents", 1).findAll("[data-token-item]")[1]!.find(".sr-detail");
  }
  const rulesOf = () => useSettingsStore(pinia).agentsLayout[1]![1]!.rules;

  it("足して、文字の値・大文字小文字・隠す・色を付ける", async () => {
    const w = mountIt();
    const d = await detailOf(w);
    await d().find("[data-add-rule]").trigger("click");
    expect(rulesOf()).toEqual([{ when: "equals", value: "" }]);
    await d().find("[data-rule-item] .sr-rule-value").setValue("Claude");
    await d().findAll("[data-rule-item] input[type=checkbox]")[0]!.setValue(true);
    await d().findAll("[data-rule-item] input[type=checkbox]")[1]!.setValue(true);
    expect(rulesOf()).toEqual([{ when: "equals", value: "Claude", ignoreCase: true, hide: true }]);
    await d().findAll("[data-rule-item] input[type=checkbox]")[1]!.setValue(false);
    expect(rulesOf()).toEqual([{ when: "equals", value: "Claude", ignoreCase: true }]);
  });

  it("数の条件に変えると値を数にし、大文字小文字の欄は消える。数でない値は保存しない", async () => {
    const w = mountIt();
    const d = await detailOf(w);
    await d().find("[data-add-rule]").trigger("click");
    await d().find("[data-rule-item] .sr-rule-value").setValue("80");
    await d().find('[data-rule-item] select[aria-label="条件 1 の種類"]').setValue("gt");
    expect(rulesOf()).toEqual([{ when: "gt", value: 80 }]);
    expect(d().findAll("[data-rule-item] input[type=checkbox]")).toHaveLength(1); // 隠すだけ
    await d().find("[data-rule-item] .sr-rule-value").setValue("90%");
    expect(rulesOf()).toEqual([{ when: "gt", value: 80 }]);
    expect(area(w, "agents").find(".sr-message").text()).toContain("数として読めません");
    await d().find("[data-rule-item] .sr-rule-value").setValue("1e2");
    expect(rulesOf()).toEqual([{ when: "gt", value: 100 }]);
  });

  it("条件を動かす・消す。最後を消したら［条件を追加］へフォーカス、条件が空なら rules ごと消える", async () => {
    const w = mountIt();
    const d = await detailOf(w);
    await d().find("[data-add-rule]").trigger("click");
    await d().find("[data-add-rule]").trigger("click");
    await d().findAll("[data-rule-item] .sr-rule-value")[1]!.setValue("second");
    await d().findAll('[data-move-rule="-1"]')[1]!.trigger("click");
    expect(rulesOf()!.map((r) => r.value)).toEqual(["second", ""]);
    await d().findAll("[data-remove-rule]")[1]!.trigger("click");
    await nextTick();
    expect(document.activeElement).toBe(d().find("[data-add-rule]").element);
    await d().findAll("[data-remove-rule]")[0]!.trigger("click");
    expect(useSettingsStore(pinia).agentsLayout[1]![1]).toEqual({ token: "agent" });
  });

  it("上限（16）で［条件を追加］を押せない", async () => {
    useSettingsStore(pinia).setSidebarLayout("agents", [
      [
        {
          token: "agent",
          rules: Array.from({ length: 16 }, () => ({ when: "equals" as const, value: "x" })),
        },
      ],
    ]);
    const w = mountIt();
    await lineOf(w, "agents", 0).find("[data-toggle-detail]").trigger("click");
    expect(lineOf(w, "agents", 0).find("[data-add-rule]").attributes("disabled")).toBeDefined();
  });
});

describe("SidebarRowsSettings — 既定に戻す・閉じるとき（AC15・AC-I2・AC-I4・AC-I5）", () => {
  it("確認を経て戻す。開いたら［やめる］へ、閉じたら［既定に戻す］へフォーカス。［やめる］・Esc では何も変えない", async () => {
    useSettingsStore(pinia).setSidebarLayout("spaces", [[{ token: "workspace" }]]);
    const w = mountIt();
    await area(w, "spaces").find("[data-reset-area]").trigger("click");
    await nextTick();
    expect(document.activeElement).toBe(area(w, "spaces").find("[data-confirm-no]").element);
    await area(w, "spaces").find(".sr-confirm").trigger("keydown", { key: "Escape" });
    await nextTick();
    expect(document.activeElement).toBe(area(w, "spaces").find("[data-reset-area]").element);
    expect(useSettingsStore(pinia).sidebarRows.spaces).toEqual([[{ token: "workspace" }]]);
    await area(w, "spaces").find("[data-reset-area]").trigger("click");
    await area(w, "spaces").find("[data-confirm-no]").trigger("click");
    expect(useSettingsStore(pinia).sidebarRows.spaces).toEqual([[{ token: "workspace" }]]);
    await area(w, "spaces").find("[data-reset-area]").trigger("click");
    await area(w, "spaces").find("[data-confirm-yes]").trigger("click");
    await nextTick();
    expect(useSettingsStore(pinia).sidebarRows.spaces).toBeNull();
    expect(saved()).toBeUndefined();
    expect(document.activeElement).toBe(area(w, "spaces").find("[data-reset-area]").element);
  });

  it("確認の Esc は外（設定画面の cancel）へ伝えない", async () => {
    const w = mountIt();
    await area(w, "agents").find("[data-reset-area]").trigger("click");
    let reached = false;
    document.body.addEventListener("keydown", () => (reached = true), { once: true });
    await area(w, "agents").find(".sr-confirm").trigger("keydown", { key: "Escape" });
    expect(reached).toBe(false);
  });

  it("設定画面を閉じると、規則に合う打ちかけの値は確定し、合わないものは捨てる", async () => {
    const w = mountIt();
    await lineOf(w, "spaces", 0).findAll("[data-toggle-detail]")[1]!.trigger("click");
    const fg = lineOf(w, "spaces", 0).find(".sr-detail input");
    (fg.element as HTMLInputElement).value = "#abc";
    await fg.trigger("input");
    await lineOf(w, "agents", 0).findAll("[data-toggle-detail]")[1]!.trigger("click");
    const fg2 = lineOf(w, "agents", 0).find(".sr-detail input");
    (fg2.element as HTMLInputElement).value = "nope";
    await fg2.trigger("input");
    useViewStore(pinia).closeDialog();
    await nextTick();
    expect(useSettingsStore(pinia).spacesLayout[0]![1]).toEqual({ token: "workspace", fg: "#abc" });
    expect(useSettingsStore(pinia).sidebarRows.agents).toBeNull();
  });
});

describe("SidebarRowsSettings — キーボードだけで完結する部品（AC-I3）", () => {
  it("操作の部品はネイティブの button・select・input・summary だけで、tabindex を負にしない", async () => {
    useSettingsStore(pinia).setSidebarLayout("agents", [
      [{ token: "agent", rules: [{ when: "equals", value: "x" }] }],
    ]);
    const w = mountIt();
    await lineOf(w, "agents", 0).find("[data-toggle-detail]").trigger("click");
    expect(
      w.findAll("[tabindex]").filter((e) => Number(e.attributes("tabindex")) < 0),
    ).toHaveLength(0);
    expect(
      w.findAll("[role=button], [role=checkbox], [role=listbox], [contenteditable]"),
    ).toHaveLength(0);
    expect(w.findAll("button").every((b) => b.attributes("type") === "button")).toBe(true);
  });
});

describe("SidebarRowsSettings — 位置に結び付いた状態とフォーカス（タスク点検 T10 の指摘）", () => {
  const S = () => useSettingsStore(pinia);

  it("動かした先の同じ向きのボタンへ（押せるときは同じ向き）", async () => {
    S().setSidebarLayout("spaces", [
      [{ token: "workspace" }, { token: "branch" }, { token: "state_icon" }],
    ]);
    const w = mountIt();
    await lineOf(w, "spaces", 0).findAll('[data-move-token="1"]')[0]!.trigger("click");
    await nextTick();
    expect(S().spacesLayout[0]!.map((t) => t.token)).toEqual(["branch", "workspace", "state_icon"]);
    expect(document.activeElement).toBe(
      lineOf(w, "spaces", 0).findAll('[data-move-token="1"]')[1]!.element,
    );
  });

  it("［詳細］の開閉は、トークン・行を動かす・消すと一緒に付け替わる", async () => {
    S().setSidebarLayout("spaces", [
      [{ token: "workspace" }, { token: "branch" }],
      [{ token: "git" }],
    ]);
    const w = mountIt();
    await lineOf(w, "spaces", 0).findAll("[data-toggle-detail]")[1]!.trigger("click"); // branch を開く
    await lineOf(w, "spaces", 0).findAll('[data-move-token="-1"]')[1]!.trigger("click");
    const open = () =>
      w
        .findAll('[data-toggle-detail][aria-expanded="true"]')
        .map((b) => b.attributes("aria-label"));
    expect(open()).toEqual(["詳細（branch の見た目と条件）"]);
    await lineOf(w, "spaces", 0).find('[data-move-line="1"]').trigger("click");
    expect(open()).toEqual(["詳細（branch の見た目と条件）"]);
    expect(
      lineOf(w, "spaces", 1).findAll("[data-toggle-detail]")[0]!.attributes("aria-expanded"),
    ).toBe("true");
    await lineOf(w, "spaces", 0).find("[data-remove-line]").trigger("click");
    expect(open()).toEqual(["詳細（branch の見た目と条件）"]);
    await lineOf(w, "spaces", 0).findAll("[data-remove-token]")[0]!.trigger("click"); // branch を消す
    expect(open()).toEqual([]);
  });

  it("行を消すと、繰り上がった行の［行を削除］へ", async () => {
    const w = mountIt();
    await lineOf(w, "spaces", 0).find("[data-remove-line]").trigger("click");
    await nextTick();
    expect(document.activeElement).toBe(lineOf(w, "spaces", 0).find("[data-remove-line]").element);
  });

  it("条件を消すと、繰り上がった条件の［削除］へ", async () => {
    S().setSidebarLayout("agents", [
      [
        {
          token: "agent",
          rules: [
            { when: "equals", value: "a" },
            { when: "equals", value: "b" },
          ],
        },
      ],
    ]);
    const w = mountIt();
    await lineOf(w, "agents", 0).find("[data-toggle-detail]").trigger("click");
    await lineOf(w, "agents", 0).findAll("[data-remove-rule]")[0]!.trigger("click");
    await nextTick();
    expect(S().agentsLayout[0]![0]!.rules).toEqual([{ when: "equals", value: "b" }]);
    expect(document.activeElement).toBe(
      lineOf(w, "agents", 0).findAll("[data-remove-rule]")[0]!.element,
    );
  });

  it("上限で［追加］が押せなくなったら、足した項目の［削除］へ（body へ落とさない）", async () => {
    S().setSidebarLayout("spaces", [Array.from({ length: 15 }, () => ({ token: "workspace" }))]);
    const w = mountIt();
    const add = lineOf(w, "spaces", 0).find("[data-add-token]");
    (add.element as HTMLElement).focus();
    await add.trigger("click");
    await nextTick();
    expect(add.attributes("disabled")).toBeDefined();
    const removes = lineOf(w, "spaces", 0).findAll("[data-remove-token]");
    expect(removes).toHaveLength(16);
    expect(document.activeElement).toBe(removes[15]!.element);
  });

  it("条件の種類を数→文字へ変えると値を文字にし、見た目・隠すは残す。文字→数は前後の空白を除いて読む", async () => {
    S().setSidebarLayout("agents", [
      [
        {
          token: "agent",
          rules: [
            { when: "gt", value: 80, fg: "#f00", hide: true },
            { when: "contains", value: " 42 ", ignoreCase: true, bold: false },
          ],
        },
      ],
    ]);
    const w = mountIt();
    await lineOf(w, "agents", 0).find("[data-toggle-detail]").trigger("click");
    const kinds = () =>
      lineOf(w, "agents", 0).findAll('[data-rule-item] select[aria-label$="の種類"]');
    await kinds()[0]!.setValue("equals");
    await kinds()[1]!.setValue("lt");
    expect(S().agentsLayout[0]![0]!.rules).toEqual([
      { when: "equals", value: "80", fg: "#f00", hide: true },
      { when: "lt", value: 42, bold: false },
    ]);
  });

  it("条件の色を確定し、確定できたら前の理由の文を消す", async () => {
    S().setSidebarLayout("agents", [[{ token: "agent", rules: [{ when: "equals", value: "a" }] }]]);
    const w = mountIt();
    await lineOf(w, "agents", 0).find("[data-toggle-detail]").trigger("click");
    const fg = () =>
      lineOf(w, "agents", 0).find('[data-rule-item] input[aria-label="条件 1 の色"]');
    await fg().setValue("bad");
    expect(area(w, "agents").find(".sr-message").text()).toContain("#RGB");
    await fg().setValue("#0f0");
    expect(S().agentsLayout[0]![0]!.rules).toEqual([{ when: "equals", value: "a", fg: "#0f0" }]);
    expect(area(w, "agents").find(".sr-message").text()).toBe("");
  });

  it("位置が変わる操作（動かす）では下書きを捨てるが、足す操作では残す", async () => {
    const w = mountIt();
    await lineOf(w, "spaces", 0).findAll("[data-toggle-detail]")[1]!.trigger("click");
    const fg = () => lineOf(w, "spaces", 0).find(".sr-detail input");
    (fg().element as HTMLInputElement).value = "bad";
    await fg().trigger("input");
    await area(w, "spaces").find("[data-add-line]").trigger("click");
    expect((fg().element as HTMLInputElement).value).toBe("bad");
    await lineOf(w, "spaces", 0).find('[data-move-line="1"]').trigger("click");
    await lineOf(w, "spaces", 1).find('[data-move-line="-1"]').trigger("click");
    expect(
      (lineOf(w, "spaces", 0).find(".sr-detail input").element as HTMLInputElement).value,
    ).toBe("");
  });

  it("ほかのウィンドウの変更で並びが差し替わったら、下書きと開閉を捨てる（別のトークンへ書かない）", async () => {
    const w = mountIt();
    await lineOf(w, "spaces", 0).findAll("[data-toggle-detail]")[1]!.trigger("click");
    const fg = lineOf(w, "spaces", 0).find(".sr-detail input");
    (fg.element as HTMLInputElement).value = "#abc";
    await fg.trigger("input");
    localStorage.setItem(
      "soda.prefs.v1",
      // 同じ位置（1 行目の 2 つ目）に別のトークンが来る差し替え——捨てないと、その別のトークンに色を書いてしまう（負の確認で見つけた穴）。
      JSON.stringify({ sidebarRows: { spaces: [[{ token: "state_icon" }, { token: "branch" }]] } }),
    );
    window.dispatchEvent(new StorageEvent("storage", { key: "soda.prefs.v1" }));
    await nextTick();
    expect(w.findAll('[data-toggle-detail][aria-expanded="true"]')).toHaveLength(0);
    useViewStore(pinia).closeDialog();
    await nextTick();
    expect(S().spacesLayout).toEqual([[{ token: "state_icon" }, { token: "branch" }]]);
  });
});
