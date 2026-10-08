import { mount, enableAutoUnmount } from "@vue/test-utils";
import type { ExtensionInfo, ExtensionListResult } from "@sodashitsu/protocol";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import type { ExtensionController } from "../extensions/ExtensionController.js";
import { ExtensionControllerKey } from "../injection.js";
import { useExtensionsStore } from "../store/extensions.js";
import { useSettingsStore } from "../store/settings.js";
import { useViewStore } from "../store/view.js";
import ExtensionApprovalDialog from "./ExtensionApprovalDialog.vue";

// 20261007-ext-host T26：承認のダイアログと、承認待ちの知らせ。コマンドの全文が読める・うっかり承認しない・中身が替わったら聞き直す。
const D = (c: string): string => c.repeat(64);
const ROOT = "/home/me/repo";
function proj(id: string, extra: Partial<ExtensionInfo> = {}, approval: Partial<NonNullable<ExtensionInfo["approval"]>> = {}, root = ROOT): ExtensionInfo {
  return {
    key: `project:${root}:${id}`,
    id,
    scope: "project",
    root,
    configPath: `${root}/.soda/extensions.json`,
    allow: [],
    onUnresponsive: "pass",
    state: "pending",
    enabledInConfig: true,
    disabledByUser: false,
    failures: 0,
    displays: 0,
    approval: { digest: D("a"), status: "none", command: "node a.mjs", cwd: root, groupWritable: false, deniedBefore: false, approvedAlive: false, ...approval },
    ...extra,
  };
}
const list = (extensions: ExtensionInfo[]): ExtensionListResult => ({ extensions, problems: [], userConfigPath: "/x/extensions.json", approvals: [] });

let pinia: Pinia;
const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await nextTick();
};
const q = (sel: string): HTMLElement | null => document.querySelector<HTMLElement>(sel);

function mountIt(ctl: Partial<ExtensionController> = {}) {
  return mount(ExtensionApprovalDialog, { global: { plugins: [pinia], provide: { [ExtensionControllerKey as symbol]: ctl } }, attachTo: document.body });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  localStorage.clear();
  pinia = createPinia();
  setActivePinia(pinia);
  HTMLDialogElement.prototype.showModal ??= function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function () {
    this.open = false;
  };
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});
enableAutoUnmount(afterEach);

describe("ExtensionApprovalDialog（開く・中身）", () => {
  it("store.dialogKey が入ったときだけ開く。サーバのイベント（一覧の更新）では開かない", async () => {
    const store = useExtensionsStore();
    mountIt();
    store.setList(list([proj("a")]));
    await settle();
    expect(q("dialog")?.hasAttribute("open")).toBe(false);
    expect(useViewStore().extensionApprovalOpen).toBe(false);
    store.openApproval(store.list!.extensions[0]!.key);
    await settle();
    expect(q("dialog")?.hasAttribute("open")).toBe(true);
    expect(useViewStore().extensionApprovalOpen).toBe(true);
    expect(useViewStore().modalOpen).toBe(true); // キーが端末へ流れない
  });

  it("コマンドの全文が <pre> の textContent にあり、<b> は要素にならない。高さの上限・内側のスクロールは付かない", async () => {
    const store = useExtensionsStore();
    const command = `node ${"x".repeat(900)} <b>bold</b> '"&`;
    mountIt();
    store.setList(list([proj("a", {}, { command })]));
    store.openApproval(store.list!.extensions[0]!.key);
    await settle();
    const pre = q("[data-ext-approval-command]")!;
    expect(pre.tagName).toBe("PRE");
    expect(pre.textContent).toBe(command);
    expect(pre.querySelector("b")).toBeNull();
    const css = [...document.querySelectorAll("style")].map((s) => s.textContent).join("\n");
    expect(css).not.toMatch(/\.ext-approval-command[^}]*(max-height|overflow:\s*(auto|scroll|hidden))/);
  });

  it("根・設定ファイル・id・作業ディレクトリ・固定の文言・許可（なし）・応答しないとき・作者の説明の見出し", async () => {
    const store = useExtensionsStore();
    mountIt();
    store.setList(list([proj("a", { description: "あいさつ" })]));
    store.openApproval(store.list!.extensions[0]!.key);
    await settle();
    expect(q("[data-ext-approval-root]")?.textContent).toContain(ROOT);
    expect(q("[data-ext-approval-config]")?.textContent).toContain(`${ROOT}/.soda/extensions.json`);
    expect(q("[data-ext-approval-id]")?.textContent).toContain("a");
    expect(q("[data-ext-approval-cwd]")?.textContent).toContain(ROOT);
    expect(q("[data-ext-approval-fixed]")?.textContent).toContain("隔離されません");
    expect(q("[data-ext-approval-fixed]")?.textContent).toContain("後で変わっても、確認は出ません");
    expect(q("[data-ext-approval-fixed]")?.textContent).toContain("承認は、フォルダの場所（パス）に結びつきます。同じ場所に別のリポジトリを置くと、聞き直されないことがあります");
    expect(q("[data-ext-approval-allow]")?.textContent).toContain("なし");
    expect(q("[data-ext-approval-unresponsive]")?.textContent).toContain("素通し");
    expect(q("[data-ext-approval-description]")?.textContent).toBe("あいさつ");
    expect(document.body.textContent).toContain("作者が書いた説明（Sodashitsu は、中身を確かめていません）");
    expect(q("[data-ext-approval-script]")).toBeNull();
  });

  it("説明に HTML を書いても要素にならない。コマンドの ASCII でない文字は、符号位置を出す", async () => {
    const store = useExtensionsStore();
    mountIt();
    store.setList(list([proj("a", { description: "<img src=x onerror=alert(1)>" }, { command: "nоde a.mjs" })]));
    store.openApproval(store.list!.extensions[0]!.key);
    await settle();
    expect(q("[data-ext-approval-description]")?.querySelector("img")).toBeNull();
    expect(q("[data-ext-approval-nonascii]")?.textContent).toContain("о (U+043E)");
  });

  it("script-html: 固定の文 3 つ。「いまは、無効／有効です」は、画面の設定のストアから出し、開いたままで替わる", async () => {
    const store = useExtensionsStore();
    const settings = useSettingsStore();
    settings.displayScriptEnabled = false;
    mountIt();
    store.setList(list([proj("a", { allow: ["script-html"] })]));
    store.openApproval(store.list!.extensions[0]!.key);
    await settle();
    const box = q("[data-ext-approval-script]")!;
    expect(box.textContent).toContain("スクリプトが動く表示: ブラウザの中で、この拡張のスクリプトが動きます");
    expect(box.textContent).toContain("有効のときだけ動きます");
    expect(box.textContent).toContain("拡張からの守りではありません");
    expect(q("[data-ext-approval-script-state]")?.textContent).toContain("いまは、無効です");
    settings.displayScriptEnabled = true;
    await settle();
    expect(q("[data-ext-approval-script-state]")?.textContent).toContain("いまは、有効です");
  });

  it("グループの注意・前に承認した登録からの変更（前と後）・記録が残っている旨・前に「承認しない」とした旨", async () => {
    const store = useExtensionsStore();
    mountIt();
    store.setList(
      list([
        proj("a", {}, { groupWritable: true, deniedBefore: true, approvedAlive: true, command: "node new.mjs", previous: { command: "node old.mjs", description: null, enabled: true, allow: [], onUnresponsive: "pass" } }),
      ]),
    );
    store.openApproval(store.list!.extensions[0]!.key);
    await settle();
    expect(q("[data-ext-approval-group]")?.textContent).toContain("同じグループ");
    expect(q("[data-ext-approval-diff]")?.textContent).toContain("node old.mjs");
    expect(q("[data-ext-approval-diff]")?.textContent).toContain("node new.mjs");
    expect(q("[data-ext-approval-previous]")?.textContent).toContain("前に承認した中身の記録は、残っています");
    expect(q("[data-ext-approval-denied-before]")?.textContent).toContain("前に、別の中身を「承認しない」");
  });
});

describe("ExtensionApprovalDialog（操作・フォーカス・待ち）", () => {
  it("開いた直後のフォーカスは［承認しない］。［承認して動かす］は 1 秒 disabled で、過ぎると押せる。disabled の間の押下は何も送らない", async () => {
    const store = useExtensionsStore();
    const approve = vi.fn(async () => "done" as const);
    mountIt({ approve });
    store.setList(list([proj("a")]));
    store.openApproval(store.list!.extensions[0]!.key);
    await settle();
    expect(document.activeElement).toBe(q("[data-ext-approval-deny]"));
    const btn = q("[data-ext-approval-approve]") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    btn.click();
    await settle();
    expect(approve).not.toHaveBeenCalled();
    vi.advanceTimersByTime(999);
    await settle();
    expect(btn.disabled).toBe(true);
    vi.advanceTimersByTime(2);
    await settle();
    expect(btn.disabled).toBe(false);
  });

  it("［承認して動かす］は、描いた digest を extension.approve に送る。済んだら閉じる（次が無ければ）", async () => {
    const store = useExtensionsStore();
    const approve = vi.fn(async () => "done" as const);
    mountIt({ approve });
    store.setList(list([proj("a", {}, { digest: D("c") })]));
    const key = store.list!.extensions[0]!.key;
    store.openApproval(key);
    await settle();
    vi.advanceTimersByTime(1100);
    await settle();
    (q("[data-ext-approval-approve]") as HTMLButtonElement).click();
    await settle();
    expect(approve).toHaveBeenCalledWith(key, D("c"));
    expect(store.dialogKey).toBeNull();
    expect(q("dialog")?.hasAttribute("open")).toBe(false);
    expect(useViewStore().extensionApprovalOpen).toBe(false);
  });

  it("［承認しない］は deny に同じ digest を送る", async () => {
    const store = useExtensionsStore();
    const deny = vi.fn(async () => "done" as const);
    mountIt({ deny });
    store.setList(list([proj("a", {}, { digest: D("d") })]));
    const key = store.list!.extensions[0]!.key;
    store.openApproval(key);
    await settle();
    (q("[data-ext-approval-deny]") as HTMLButtonElement).click();
    await settle();
    expect(deny).toHaveBeenCalledWith(key, D("d"));
  });

  it("開いた直後の Enter 2 回（フォーカスは［承認しない］）で承認にならない", async () => {
    const store = useExtensionsStore();
    const approve = vi.fn(async () => "done" as const);
    const deny = vi.fn(async () => "done" as const);
    mountIt({ approve, deny });
    store.setList(list([proj("a")]));
    store.openApproval(store.list!.extensions[0]!.key);
    await settle();
    // Enter はフォーカスのあるボタンを押す＝［承認しない］。
    (document.activeElement as HTMLButtonElement).click();
    await settle();
    expect(approve).not.toHaveBeenCalled();
    expect(deny).toHaveBeenCalledTimes(1);
  });

  it("extension_stale が返ったら「登録が変わりました」と出し、閉じず、1 秒の待ちをやり直す", async () => {
    const store = useExtensionsStore();
    const approve = vi.fn(async () => "stale" as const);
    mountIt({ approve });
    store.setList(list([proj("a")]));
    store.openApproval(store.list!.extensions[0]!.key);
    await settle();
    vi.advanceTimersByTime(1100);
    await settle();
    (q("[data-ext-approval-approve]") as HTMLButtonElement).click();
    await settle();
    expect(q("[data-ext-approval-stale]")?.textContent).toContain("登録が変わりました");
    expect(store.dialogKey).not.toBeNull();
  });

  it("開いている間に digest が変わったら、「登録が変わりました」・中身が替わり・待ちをやり直し・フォーカスは［承認しない］", async () => {
    const store = useExtensionsStore();
    mountIt();
    store.setList(list([proj("a", {}, { digest: D("a"), command: "node a.mjs" })]));
    const key = store.list!.extensions[0]!.key;
    store.openApproval(key);
    await settle();
    vi.advanceTimersByTime(1100);
    await settle();
    expect((q("[data-ext-approval-approve]") as HTMLButtonElement).disabled).toBe(false);
    (q("[data-ext-approval-approve]") as HTMLButtonElement).focus();
    store.setList(list([proj("a", {}, { digest: D("b"), command: "node EVIL.mjs" })]));
    await settle();
    expect(q("[data-ext-approval-stale]")).not.toBeNull();
    expect(q("[data-ext-approval-command]")?.textContent).toBe("node EVIL.mjs");
    expect((q("[data-ext-approval-approve]") as HTMLButtonElement).disabled).toBe(true);
    expect(document.activeElement).toBe(q("[data-ext-approval-deny]"));
  });

  it("Esc（cancel）は［後で］: 閉じて、pending のまま。同じ登録（key:digest）の知らせは出し直さない", async () => {
    const store = useExtensionsStore();
    const deny = vi.fn();
    const approve = vi.fn();
    mountIt({ deny, approve });
    store.setList(list([proj("a")]));
    const key = store.list!.extensions[0]!.key;
    store.openApproval(key);
    await settle();
    const ev = new Event("cancel", { cancelable: true });
    q("dialog")!.dispatchEvent(ev);
    await settle();
    expect(ev.defaultPrevented).toBe(true);
    expect(store.dialogKey).toBeNull();
    expect(deny).not.toHaveBeenCalled();
    expect(approve).not.toHaveBeenCalled();
    expect(store.dismissedPending.has(`${key}:${D("a")}`)).toBe(true);
    expect(useViewStore().toasts.filter((t) => t.kind === "sticky")).toEqual([]);
    // 登録が変われば（digest が違えば）、また知らせる。
    store.setList(list([proj("a", {}, { digest: D("b") })]));
    await settle();
    expect(useViewStore().toasts.filter((t) => t.kind === "sticky")).toHaveLength(1);
  });

  it("同じ根の承認待ちを「N 件中 M 件目」で続けて見る。1 件を決めたら次へ替わり、フォーカスは［承認しない］・待ちをやり直す。別の根へは替わらず閉じる。すべて承認のボタンは無い", async () => {
    const store = useExtensionsStore();
    const deny = vi.fn(async () => "done" as const);
    mountIt({ deny });
    store.setList(list([proj("a"), proj("b"), proj("other", {}, {}, "/home/me/other")]));
    const [a, b] = store.list!.extensions;
    store.openApproval(a!.key);
    await settle();
    expect(q("[data-ext-approval-position]")?.textContent).toContain("2 件中 1 件目");
    expect([...document.querySelectorAll("button")].some((x) => /すべて/.test(x.textContent ?? ""))).toBe(false);
    (q("[data-ext-approval-deny]") as HTMLButtonElement).click();
    await settle();
    expect(store.dialogKey).toBe(b!.key);
    expect(q("[data-ext-approval-position]")?.textContent).toContain("2 件中 2 件目");
    expect(document.activeElement).toBe(q("[data-ext-approval-deny]"));
    expect((q("[data-ext-approval-approve]") as HTMLButtonElement).disabled).toBe(true);
    (q("[data-ext-approval-deny]") as HTMLButtonElement).click();
    await settle();
    expect(store.dialogKey).toBeNull(); // 別の根の other へは替わらない
  });

  it("開いている拡張が承認待ちでなくなった（別の画面で決めた）→ 次の 1 件へ替わるか、無ければ閉じる", async () => {
    const store = useExtensionsStore();
    mountIt();
    store.setList(list([proj("a"), proj("b")]));
    const [a, b] = store.list!.extensions;
    store.openApproval(a!.key);
    await settle();
    store.setList(list([proj("a", { state: "running" }, { status: "approved" }), proj("b")]));
    await settle();
    expect(store.dialogKey).toBe(b!.key);
    store.setList(list([proj("a", { state: "running" }), proj("b", { state: "running" })]));
    await settle();
    expect(store.dialogKey).toBeNull();
  });

  it("ほかのモーダル（質問のフォーム）が開いた・閉じたら、待ちをやり直し、閉じたときはフォーカスを［承認しない］へ置き直す", async () => {
    const store = useExtensionsStore();
    const view = useViewStore();
    mountIt();
    store.setList(list([proj("a")]));
    store.openApproval(store.list!.extensions[0]!.key);
    await settle();
    vi.advanceTimersByTime(1100);
    await settle();
    const approveBtn = q("[data-ext-approval-approve]") as HTMLButtonElement;
    expect(approveBtn.disabled).toBe(false);
    approveBtn.focus();
    view.setAskOpen(true);
    await settle();
    expect(approveBtn.disabled).toBe(true);
    vi.advanceTimersByTime(1100);
    await settle();
    expect(approveBtn.disabled).toBe(false);
    approveBtn.focus();
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
      cb();
      return 0;
    });
    view.setAskOpen(false);
    await settle();
    expect(approveBtn.disabled).toBe(true);
    expect(document.activeElement).toBe(q("[data-ext-approval-deny]"));
    vi.unstubAllGlobals();
  });
});

describe("承認待ちの知らせ（消えないトースト）", () => {
  const stickies = () => useViewStore().toasts.filter((t) => t.kind === "sticky");

  it("承認待ちが出ると消えないトースト 1 つ（件数・［確認する］）。ダイアログは開かず、フォーカスも動かさない。0 件で消える", async () => {
    const store = useExtensionsStore();
    const before = document.activeElement;
    mountIt();
    store.setList(list([proj("a")]));
    await settle();
    expect(stickies()).toHaveLength(1);
    expect(stickies()[0]!.message).toContain("承認を待っています（1 件）");
    expect(stickies()[0]!.actions?.map((a) => a.label)).toEqual(["確認する"]);
    expect(q("dialog")?.hasAttribute("open")).toBe(false);
    expect(document.activeElement).toBe(before);
    store.setList(list([proj("a"), proj("b")]));
    await settle();
    expect(stickies()).toHaveLength(1); // 1 つのまま。件数が替わる
    expect(stickies()[0]!.message).toContain("（2 件）");
    store.setList(list([proj("a", { state: "running" }), proj("b", { state: "disabled" })]));
    await settle();
    expect(stickies()).toEqual([]);
  });

  it("disabled の拡張は数えない。利用者が閉じたトーストは、同じ登録では出し直さない", async () => {
    const store = useExtensionsStore();
    const view = useViewStore();
    mountIt();
    store.setList(list([proj("a", { state: "disabled" })]));
    await settle();
    expect(stickies()).toEqual([]);
    store.setList(list([proj("a")]));
    await settle();
    expect(stickies()).toHaveLength(1);
    view.dismissToast(stickies()[0]!.id); // 利用者が閉じた
    await settle();
    expect(stickies()).toEqual([]);
    store.setList(list([proj("a")])); // 同じ登録の取り直し
    await settle();
    expect(stickies()).toEqual([]);
  });

  it("［確認する］で、その拡張のダイアログを開く。開いている間はトーストを出さず、閉じたら、残りがあれば出す", async () => {
    const store = useExtensionsStore();
    mountIt({ deny: vi.fn(async () => "done" as const) });
    store.setList(list([proj("a"), proj("other", {}, {}, "/home/me/other")]));
    await settle();
    stickies()[0]!.actions![0]!.run();
    await settle();
    expect(store.dialogKey).toBe(store.list!.extensions[0]!.key);
    expect(stickies()).toEqual([]);
    (q("[data-ext-approval-deny]") as HTMLButtonElement).click(); // a を決める（別の根の other へは替わらず閉じる）
    store.setList(list([proj("a", { state: "denied" }), proj("other", {}, {}, "/home/me/other")]));
    await settle();
    expect(store.dialogKey).toBeNull();
    expect(stickies()).toHaveLength(1); // 残り（other）の知らせ
    expect(stickies()[0]!.message).toContain("（1 件）");
  });
});
