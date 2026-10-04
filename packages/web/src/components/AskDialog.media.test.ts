import { describe, expect, it } from "vitest";
import type { AskPending } from "@sodashitsu/protocol";
import type { AskEntry } from "../store/ask.js";
import { type Mounted, installAskDialogHooks, mountDialog, open, shadow } from "./askDialogTestKit.js";

/** 枠（`AskDialog.vue`）が部品へ `resolveMedia` を入れる（20261004-ask-media-popup）。サーバから取り終えた `data:` の URL だけに解く。 */

installAskDialogHooks();

const PNG = "data:image/png;base64,iVBORw0KGgo=";
/** 配る定義の形（参照は `media:<id>`）。pane のプログラムの定義の検査（`normalizeAskSpec`）は `media:` を断るので、検査を通さずに作る。 */
const pending = (image: string, resolved?: AskEntry["resolved"]): AskEntry => {
  const base: AskPending = {
    askId: "a1",
    paneId: "p1",
    spec: { title: "T", submit: "決定", note: true, questions: [{ id: "a", label: "A", type: "single", allowOther: false, required: false, multiline: false, options: [{ value: "x", label: "X", image }, { value: "y", label: "Y" }] }] },
  };
  return resolved ? { ...base, resolved } : base;
};
const imgs = (w: Mounted): HTMLImageElement[] => [...shadow(w).querySelectorAll<HTMLImageElement>("img")];

describe("AskDialog — resolveMedia", () => {
  it("定義の media:<id> を、取り終えた data: の URL に解く（部品の img の src になる）", async () => {
    const w = mountDialog();
    await open(w, pending("media:0", { urls: { "media:0": PNG }, views: [] }));
    expect(imgs(w).some((i) => i.getAttribute("src") === PNG)).toBe(true);
  });

  it("取り終えていない参照・media: 以外の参照（URL・パス・data:）は解かない（img を出さない）", async () => {
    for (const ref of ["media:9", "https://example.com/a.png", "/etc/passwd", PNG]) {
      const w = mountDialog();
      // 定義にこれらの参照が（サーバの付け替えを経ずに）残っていても、解かない。
      await open(w, pending(ref, { urls: { "media:0": PNG }, views: [] }));
      expect(imgs(w).filter((i) => i.getAttribute("src") !== null && i.getAttribute("src") !== ""), ref).toEqual([]);
      w.wrapper.unmount();
    }
  });

  it("取得に失敗して外した画像の件数を、固定の行に出す（0 件なら出さない）", async () => {
    const w = mountDialog();
    await open(w, { ...pending("media:0"), warnings: 2 });
    expect(w.wrapper.get("[data-ask-warnings]").text()).toBe("画像 2 件を取得できませんでした（プレビューなしで出しています）");
  });
  it("0 件なら固定の行に出さない", async () => {
    const w = mountDialog();
    await open(w, pending("media:0"));
    expect(w.wrapper.find("[data-ask-warnings]").exists()).toBe(false);
  });

  it("メディアの無い質問（resolved なし）でも resolveMedia は入り、何も解かない", async () => {
    const w = mountDialog();
    await open(w, pending("media:0"));
    expect(imgs(w).filter((i) => i.getAttribute("src"))).toEqual([]);
  });
});
