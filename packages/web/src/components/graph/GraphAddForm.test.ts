import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GraphAddForm from "./GraphAddForm.vue";

// 20261008-graph-first の PR3 T14c：フォーム。送るものは種類の id・名前・監督の線の有無だけ（任意のコマンドの欄は無い）。
const kinds = [
  { kind: "claude", label: "Claude Code", available: true },
  { kind: "codex", label: "Codex", available: false },
  { kind: "gemini", label: "Gemini CLI", available: true },
  { kind: "droid", label: "Droid", available: false },
];
const props = { workspaceTitle: "alpha", kinds, supervisorName: "lead", busyText: null, error: null, x: 10, y: 10, retrying: false };

describe("GraphAddForm", () => {
  it("既定はシェル。［足して］で kind=shell・名前なし", async () => {
    const w = mount(GraphAddForm, { props });
    await w.get("[data-add-submit]").trigger("click");
    expect(w.emitted("submit")).toEqual([[{ kind: "shell", name: "", supervise: false }]]);
    expect(w.find("[data-add-name]").exists()).toBe(false);
  });
  it("見つからない種類は選べない。入力欄は種類の id と名前だけ（ほかの文字列の欄が無い）", () => {
    const w = mount(GraphAddForm, { props });
    expect(w.get('[data-add-kind="claude"]').attributes("disabled")).toBeUndefined();
    expect(w.get('[data-add-kind="codex"]').attributes("disabled")).toBeDefined();
    expect(w.findAll("input[type=text], textarea")).toHaveLength(0); // シェルでは名前も出ない
  });
  it("エージェント: 名前の書式が合わなければ送れない。監督の線の既定は結ぶ、外せる", async () => {
    const w = mount(GraphAddForm, { props });
    await w.get('[data-add-kind="claude"]').setValue(true);
    await w.get("[data-add-name]").setValue("Bad Name");
    expect(w.get("[data-add-submit]").attributes("disabled")).toBeDefined();
    await w.get("[data-add-name]").setValue("rev-1");
    await w.get("[data-add-submit]").trigger("click");
    expect(w.emitted("submit")![0]).toEqual([{ kind: "claude", name: "rev-1", supervise: true }]);
    await w.get("[data-add-supervise]").setValue(false);
    await w.get("[data-add-submit]").trigger("click");
    expect(w.emitted("submit")![1]).toEqual([{ kind: "claude", name: "rev-1", supervise: false }]);
  });
  it("選んでいるノードが無ければ監督の項目は出さない。ほかのエージェントは select から（見つかるものだけ）", async () => {
    const w = mount(GraphAddForm, { props: { ...props, supervisorName: null } });
    await w.get('[data-add-kind="claude"]').setValue(true);
    expect(w.find("[data-add-supervise]").exists()).toBe(false);
    await w.get("[data-add-other]").setValue("gemini");
    await w.get("[data-add-submit]").trigger("click");
    expect(w.emitted("submit")![0]![0]).toMatchObject({ kind: "gemini", supervise: false });
    const opts = w.findAll("[data-add-other] option");
    expect(opts.find((o) => o.attributes("value") === "droid")!.attributes("disabled")).toBeDefined();
  });
  it("Esc・取りやめで cancel。キーは外へ渡さない。足している間は操作できない。失敗の理由を出す", async () => {
    const w = mount(GraphAddForm, { props: { ...props, error: "シェルを起動できませんでした" } });
    expect(w.get("[data-add-error]").text()).toContain("シェルを起動できません");
    let leaked = false;
    const host = document.createElement("div");
    host.addEventListener("keydown", () => (leaked = true));
    document.body.append(host);
    const w2 = mount(GraphAddForm, { props, attachTo: host });
    await w2.get("[data-graph-add-form]").trigger("keydown", { key: "Escape" });
    expect(w2.emitted("cancel")).toHaveLength(1);
    expect(leaked).toBe(false);
    const busy = mount(GraphAddForm, { props: { ...props, busyText: "足しています…" } });
    expect(busy.get("[data-add-submit]").attributes("disabled")).toBeDefined();
    expect(busy.get(".graph-add-busy").text()).toBe("足しています…");
    w2.unmount();
    host.remove();
  });
  it("やり直し（pane は足せた）: 種類は固定・ボタンは「もう一度起動する」", () => {
    const w = mount(GraphAddForm, { props: { ...props, retrying: true } });
    expect(w.get("[data-add-submit]").text()).toBe("もう一度起動する");
    expect(w.get("fieldset").attributes("disabled")).toBeDefined();
  });
});
