import { mount, type VueWrapper } from "@vue/test-utils";
import type { ExtensionInfo, ExtensionListResult } from "@sodashitsu/protocol";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import type { ExtensionController } from "../extensions/ExtensionController.js";
import { ExtensionControllerKey } from "../injection.js";
import { useExtensionsStore } from "../store/extensions.js";
import ExtensionSettings from "./ExtensionSettings.vue";

const info = (key: string, state: ExtensionInfo["state"], extra: Partial<ExtensionInfo> = {}): ExtensionInfo => ({
  key, id: key, scope: "user", configPath: "/x/extensions.json", allow: [], onUnresponsive: "pass", state, enabledInConfig: true, disabledByUser: false, failures: 0, displays: 0, ...extra,
});
const list = (extensions: ExtensionInfo[], problems: ExtensionListResult["problems"] = []): ExtensionListResult => ({ extensions, problems, userConfigPath: "/x/extensions.json" });

let pinia: Pinia;
let wrapper: VueWrapper | null = null;
const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await nextTick();
};

function mountIt(ctl: Partial<ExtensionController> | null = {}) {
  const w = mount(ExtensionSettings, { global: { plugins: [pinia], provide: ctl ? { [ExtensionControllerKey as symbol]: ctl } : {} }, attachTo: document.body });
  wrapper = w;
  return w;
}
const q = (sel: string): HTMLElement | null => document.querySelector<HTMLElement>(sel);
const all = (sel: string): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(sel)];

beforeEach(() => {
  localStorage.clear();
  pinia = createPinia();
  setActivePinia(pinia);
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = "";
});

describe("ExtensionSettings", () => {
  it("確認中・失敗（loadFailed）・古いサーバ・空の文", async () => {
    const store = useExtensionsStore();
    mountIt();
    await settle();
    expect(document.body.textContent).toContain("確認中…");
    store.setLoadFailed();
    await settle();
    expect(q("[data-ext-load-failed]")?.textContent).toContain("取れませんでした");
    expect(document.body.textContent).not.toContain("確認中…");
    store.setUnsupported();
    await settle();
    expect(q("[data-ext-unsupported]")).not.toBeNull();
    store.setList(list([]));
    await settle();
    expect(q("[data-ext-empty]")).not.toBeNull();
  });

  it("並びはサーバの順のまま（状態で並べ替えない）。状態ごとの文・印・調子の class", async () => {
    const store = useExtensionsStore();
    store.setList(list([info("d", "disabled", { disabledByUser: true }), info("f", "failed"), info("b", "backoff"), info("w", "waiting"), info("r", "running")]));
    mountIt();
    await settle();
    expect(all("[data-ext-id]").map((e) => e.getAttribute("data-ext-id"))).toEqual(["d", "f", "b", "w", "r"]);
    const state = (id: string): HTMLElement => q(`[data-ext-id="${id}"] [data-ext-state-text]`)!;
    expect(state("r").textContent).toContain("動作中");
    expect(state("r").className).not.toMatch(/ext-state-(error|warn)/);
    expect(state("f").textContent).toContain("続けて落ちたので止めました");
    expect(state("f").className).toContain("ext-state-error");
    expect(state("f").querySelector(".ext-mark")?.textContent).toBe("✕");
    expect(state("b").className).toContain("ext-state-warn");
    expect(state("b").querySelector(".ext-mark")?.textContent).toBe("↻");
    expect(state("w").className).toContain("ext-state-warn");
    expect(state("w").querySelector(".ext-mark")?.textContent).toBe("…");
    expect(state("d").textContent).toContain("無効（画面で無効にしました）");
    expect(q('[data-ext-id="f"]')!.className).toContain("ext-row-error");
    expect(q('[data-ext-id="b"]')!.className).toContain("ext-row-warn");
    // 並びが替わっても（状態が変わっても）行の要素は動かない
    const el = q('[data-ext-id="d"]');
    store.setList(list([info("d", "running"), info("f", "running"), info("b", "running"), info("w", "running"), info("r", "failed")]));
    await settle();
    expect(all("[data-ext-id]").map((e) => e.getAttribute("data-ext-id"))).toEqual(["d", "f", "b", "w", "r"]);
    expect(q('[data-ext-id="d"]')).toBe(el);
  });

  it("busy: 行に処理中の見た目（aria-busy・「処理中…」）。押しても controller は呼ばれるが、ボタンは disabled にしない（フォーカスを失わない）", async () => {
    const store = useExtensionsStore();
    store.setList(list([info("a", "running")]));
    const ctl = { setEnabled: vi.fn(async () => "done" as const), restart: vi.fn(async () => "done" as const) };
    mountIt(ctl as unknown as ExtensionController);
    await settle();
    store.setBusy("a", true);
    await settle();
    const row = q('[data-ext-id="a"]')!;
    expect(row.getAttribute("aria-busy")).toBe("true");
    expect(row.className).toContain("ext-row-busy");
    expect(row.querySelector("[data-ext-state-text]")?.textContent).toContain("処理中…");
    const sw = row.querySelector<HTMLButtonElement>("[data-ext-switch]")!;
    expect(sw.getAttribute("aria-disabled")).toBe("true");
    expect(sw.disabled).toBe(false);
    expect(row.querySelector<HTMLButtonElement>("[data-ext-restart]")!.textContent).toContain("処理中…");
    store.setBusy("a", false);
    await settle();
    expect(q('[data-ext-id="a"]')!.getAttribute("aria-busy")).toBeNull();
  });

  it("操作が済んだら、その行に手応えの文（数秒で消える）。失敗・二重押しでは出さない", async () => {
    vi.useFakeTimers();
    try {
      const store = useExtensionsStore();
      store.setList(list([info("a", "running")]));
      const ctl = { setEnabled: vi.fn(async () => "done" as const), restart: vi.fn(async () => "failed" as const) };
      mountIt(ctl as unknown as ExtensionController);
      await settle();
      const done = (): string => q('[data-ext-id="a"] [data-ext-done]')!.textContent!.trim();
      q("[data-ext-switch]")!.click();
      await settle();
      expect(ctl.setEnabled).toHaveBeenCalledWith("a", false);
      expect(done()).toBe("無効にしました。");
      await vi.advanceTimersByTimeAsync(5000);
      expect(done()).toBe("");
      q("[data-ext-restart]")!.click();
      await settle();
      expect(ctl.restart).toHaveBeenCalledWith("a");
      expect(done()).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("ログの開閉: 開くと取って <pre> に文字のまま（無害化）。［更新］で取り直し、閉じると消える。取り直しで <pre> の要素は保たれる", async () => {
    const store = useExtensionsStore();
    store.setList(list([info("a", "running"), info("b", "running")]));
    const log = vi.fn(async () => ({ lines: ["<b>x</b>", "y‮z​"], dropped: 3 }));
    mountIt({ log } as unknown as ExtensionController);
    await settle();
    expect(q("[data-ext-log]")).toBeNull();
    q('[data-ext-id="a"] [data-ext-log-toggle]')!.click();
    await settle();
    const pre = q('[data-ext-id="a"] [data-ext-log]')!;
    expect(log).toHaveBeenCalledWith("a");
    expect(pre.textContent).toBe("<b>x</b>\ny?z?");
    expect(pre.querySelector("b")).toBeNull();
    expect(q('[data-ext-id="a"]')!.textContent).toContain("あふれて捨てた行: 3");
    expect(q('[data-ext-id="a"] [data-ext-log-toggle]')!.getAttribute("aria-expanded")).toBe("true");
    expect(q('[data-ext-id="b"] [data-ext-log]')).toBeNull();
    // 別の行の状態が変わって一覧が取り直されても、開いたログの要素は同じ
    store.setList(list([info("a", "running"), info("b", "failed")]));
    await settle();
    expect(q('[data-ext-id="a"] [data-ext-log]')).toBe(pre);
    q('[data-ext-id="a"] [data-ext-log-refresh]')!.click();
    await settle();
    expect(log).toHaveBeenCalledTimes(2);
    q('[data-ext-id="a"] [data-ext-log-toggle]')!.click();
    await settle();
    expect(q('[data-ext-id="a"] [data-ext-log]')).toBeNull();
  });

  it("［読み直す］: 成功のときだけ「読み直しました」。失敗・問題つきは見せ方が違う。古いサーバ（skipped）では何も出さない", async () => {
    const store = useExtensionsStore();
    store.setList(list([]));
    let result: "ok" | "failed" | "skipped" = "ok";
    const reload = vi.fn(async () => result);
    mountIt({ reload } as unknown as ExtensionController);
    await settle();
    const msg = (): string => q("[data-ext-message]")!.textContent!.trim();
    q("[data-ext-reload]")!.click();
    await settle();
    expect(msg()).toBe("設定を読み直しました。");
    expect(q("[data-ext-message]")!.className).not.toContain("ext-warn");
    result = "failed";
    q("[data-ext-reload]")!.click();
    await settle();
    expect(msg()).toBe("設定を読み直せませんでした。");
    expect(msg()).not.toContain("読み直しました");
    expect(q("[data-ext-message]")!.className).toContain("ext-warn");
    result = "skipped";
    q("[data-ext-reload]")!.click();
    await settle();
    expect(msg()).toBe("");
    // 成功でも、設定の問題が返っていれば、成功とだけは言わない
    result = "ok";
    reload.mockImplementationOnce(async () => {
      store.setList(list([], [{ scope: "user", path: "/x/extensions.json", problem: "extensions.json: JSON として読めません" }]));
      return "ok";
    });
    q("[data-ext-reload]")!.click();
    await settle();
    expect(msg()).toContain("問題が 1 件あります");
    expect(q("[data-ext-message]")!.className).toContain("ext-warn");
  });

  it("［読み直す］の最中は「読み直し中…」で aria-disabled（二重に押しても 1 回）", async () => {
    const store = useExtensionsStore();
    store.setList(list([]));
    let release: (v: "ok") => void = () => undefined;
    const reload = vi.fn(() => new Promise<"ok">((r) => (release = r)));
    mountIt({ reload } as unknown as ExtensionController);
    await settle();
    const btn = q("[data-ext-reload]")!;
    btn.click();
    btn.click();
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(btn.textContent).toContain("読み直し中…");
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    release("ok");
    await settle();
    expect(btn.textContent).toContain("読み直す");
    expect(btn.getAttribute("aria-disabled")).toBeNull();
  });

  it("設定の問題: 警告の見た目で、ファイル名を重ねず、パス・文を無害化して文字のまま出す", async () => {
    const store = useExtensionsStore();
    store.setList(list([], [{ scope: "user", path: "/home/u/<i>/extensions.json", problem: "extensions.json: JSON として読めません‮ " }]));
    mountIt();
    await settle();
    const li = q("[data-ext-problems] li")!;
    expect(li.className).toContain("ext-warn");
    expect(li.textContent).toContain("設定の問題");
    expect(li.textContent).not.toContain("extensions.json: extensions.json");
    expect(li.textContent).toContain("JSON として読めません??");
    expect(li.querySelector("i")).toBeNull();
    expect(li.querySelector("code")?.textContent).toBe("/home/u/<i>/extensions.json");
  });

  it("script-html の注意は、許可していて設定が無効のときだけ", async () => {
    const store = useExtensionsStore();
    store.setList(list([info("a", "running", { allow: ["script-html"] }), info("b", "running")]));
    mountIt();
    await settle();
    expect(q('[data-ext-id="a"] [data-ext-script-off]')).not.toBeNull();
    expect(q('[data-ext-id="b"] [data-ext-script-off]')).toBeNull();
  });
});
