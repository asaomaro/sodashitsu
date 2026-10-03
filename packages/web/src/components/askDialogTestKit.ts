import { enableAutoUnmount, mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { afterEach, beforeEach, vi, type Mock } from "vitest";
import { nextTick } from "vue";
import {
  normalizeAskSpec,
  type AskPending,
  type Pane,
  type Tab,
  type Workspace,
} from "@sodashitsu/protocol";
import type { AskFormElement } from "../ask/askFormElement.js";
import { AskControllerKey, TerminalRegistryKey } from "../injection.js";
import { useAskStore } from "../store/ask.js";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import AskDialog from "./AskDialog.vue";

/**
 * `AskDialog*.test.ts`（`AskDialog.test.ts`・`AskDialog.form.test.ts`・`AskDialog.keys.test.ts`）の共通の土台。`.test.ts` ではないので、vitest はこのファイル自身を試験として走らせない。
 * 質問・選択肢・ボタンは部品 `<ask-form>`（Shadow DOM）が描くので、`wrapper.get` では見つからない——部品の中は `inForm`・`allInForm`（`shadowRoot` の中を探す）で見る。
 * 部品の中へ送るキーは `composed: true`（でないと部品の要素へ届かない）。
 * 単体テストの環境（happy-dom）は大きさが全部 0 なので、高さでのページ分けはここでは確かめられない（E2E の担当）。
 */

let pinia: Pinia;
export const INNER_HEIGHT = window.innerHeight;

/** 各 `AskDialog*.test.ts` の先頭で 1 回呼ぶ（`beforeEach`・`afterEach` はファイルごとに登録する）。 */
export function installAskDialogHooks(): void {
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    // `happy-dom` の `<dialog>` は showModal/close を持たない場合があるので、必要な面だけ生やす。
    HTMLDialogElement.prototype.showModal ??= function () {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function () {
      this.open = false;
    };
  });
  afterEach(() => {
    vi.restoreAllMocks();
    setInnerHeight(INNER_HEIGHT);
    document.body.innerHTML = "";
  });
  // mount したままの件が、開いたときに付けた `window` の `resize` のリスナーを次の件へ残さないようにする（後から登録した側が先に走る＝上の片付けより前に unmount する）。
  enableAutoUnmount(afterEach);
}

/** いまの pinia（`resetPinia` で替わる）。 */
export const getPinia = (): Pinia => pinia;

/** 件の途中で pinia を置き直す（`mountDialog` が使う pinia も替わる）。 */
export function resetPinia(): void {
  setActivePinia((pinia = createPinia()));
}

export function spec(raw: unknown) {
  const r = normalizeAskSpec(raw);
  if (!r.ok) throw new Error(r.message);
  return r.spec;
}
export const ask = (raw: unknown, askId = "a1", paneId = "p1"): AskPending => ({
  askId,
  paneId,
  spec: spec(raw),
});
export const SPEC = {
  title: "配布先",
  questions: [
    {
      id: "ch",
      label: "チャンネル",
      default: "beta",
      options: [
        { value: "beta", label: "ベータ", recommended: true },
        { value: "stable", label: "安定版" },
      ],
      allowOther: true,
    },
    { id: "roll", label: "段階", showIf: { ch: "stable" }, default: "10", options: ["10", "100"] },
    { id: "m", label: "告知", type: "multi", options: ["a", "b"], default: ["a"] },
  ],
};
/** `page` を書いた定義（3 ページ。高さに依らずに分かれる）。 */
export const PAGED = {
  note: false,
  questions: [
    { id: "a", label: "A", page: "基本", default: "x", options: ["x", "y"] },
    { id: "b", label: "B", page: "詳細", default: "x", options: ["x", "y"] },
    { id: "c", label: "C", page: "確認", default: "x", options: ["x", "y"] },
  ],
};
export const ORIGIN = "pane「ビルド」（プロジェクト／main）のプログラムからの質問";
export const UNSUPPORTED_TOAST = "このフォームは、この画面では出せません（質問は取り消しました）";

export function setupSession() {
  const session = useSessionStore();
  session.workspaces.set("w1", {
    id: "w1",
    label: "プロジェクト",
    cwd: "/",
    tabIds: ["t1"],
    activeTabId: "t1",
    groupId: null,
    git: null,
    autoLabel: false,
  } as Workspace);
  session.tabs.set("t1", {
    id: "t1",
    workspaceId: "w1",
    label: "main",
    layout: { type: "pane", paneId: "p1" },
    focusedPaneId: "p1",
    zoomedPaneId: null,
    sizeOwnerClientId: null,
  } as unknown as Tab);
  session.panes.set("p1", {
    id: "p1",
    tabId: "t1",
    label: "ビルド",
    cwd: "/",
    title: "",
    agent: null,
  } as unknown as Pane);
}

export function mountDialog(): {
  wrapper: ReturnType<typeof mount<typeof AskDialog>>;
  answer: Mock<(askId: string, body: unknown) => Promise<boolean>>;
  cancel: Mock<(askId: string) => Promise<undefined>>;
  registry: { focus: Mock };
  store: ReturnType<typeof useAskStore>;
  view: ReturnType<typeof useViewStore>;
} {
  setupSession();
  const answer = vi.fn(async (_askId: string, _body: unknown) => true);
  const cancel = vi.fn(async (_askId: string) => undefined);
  const registry = { focus: vi.fn() };
  const store = useAskStore();
  const view = useViewStore();
  const wrapper = mount(AskDialog, {
    attachTo: document.body,
    global: {
      plugins: [pinia],
      provide: {
        [AskControllerKey as symbol]: { answer, cancel },
        [TerminalRegistryKey as symbol]: registry,
      },
    },
  });
  return { wrapper, answer, cancel, registry, store, view };
}
export type Mounted = ReturnType<typeof mountDialog>;

/** 描画（`watch` → `nextTick` の中で開く・定義を入れる）と、部品がマイクロタスクで遅れて出す `ask-unsupported` を待つ。 */
export async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
  await nextTick();
}
export async function open(w: Mounted, a: AskPending): Promise<void> {
  w.store.add(a);
  await settle();
}

// --- 部品（Shadow DOM）の中を探す・操作する補助 -----------------------------------------

export const form = (w: Mounted): AskFormElement =>
  w.wrapper.get("ask-form").element as unknown as AskFormElement;
export function shadow(w: Mounted): ShadowRoot {
  const root = form(w).shadowRoot;
  if (!root) throw new Error("shadowRoot が無い");
  return root;
}
export function allInForm<T extends HTMLElement = HTMLElement>(w: Mounted, selector: string): T[] {
  return [...shadow(w).querySelectorAll<T>(selector)];
}
export function inForm<T extends HTMLElement = HTMLElement>(w: Mounted, selector: string): T {
  const found = shadow(w).querySelector<T>(selector);
  if (!found) throw new Error(`部品の中に無い: ${selector}`);
  return found;
}
export const input = (w: Mounted, selector: string) => inForm<HTMLInputElement>(w, selector);
export const origin = (w: Mounted) => w.wrapper.get("[data-ask-origin]").element as HTMLElement;
/** 出ている質問（隠れた質問は `hidden`、ほかのページの質問は class `off` で DOM に残る）。 */
export const shownQuestions = (w: Mounted) =>
  allInForm(w, "[data-ask-question]:not([hidden]):not(.off)").map((f) =>
    f.getAttribute("data-ask-question"),
  );
/** いまのページ（番号。1 から）。 */
export const currentPage = (w: Mounted) =>
  inForm(w, '[data-ask-page][aria-current="page"]').getAttribute("data-ask-page");

/** キーを送る（部品の中の要素へ送っても部品の要素・枠へ届くよう `composed`）。送ったイベントを返す（`defaultPrevented` を見る）。 */
export function key(
  target: EventTarget,
  init: KeyboardEventInit,
  over: { isComposing?: boolean; keyCode?: number } = {},
): KeyboardEvent {
  const ev = new KeyboardEvent("keydown", {
    bubbles: true,
    composed: true,
    cancelable: true,
    ...init,
  });
  for (const [name, value] of Object.entries(over)) Object.defineProperty(ev, name, { value });
  target.dispatchEvent(ev);
  return ev;
}
/** ポインタで選ぶ（`pointerdown` → クリック。ブラウザと同じ順）。 */
export function pointerPick(el: HTMLElement): void {
  el.dispatchEvent(new Event("pointerdown", { bubbles: true, composed: true }));
  el.click();
}
/** `Space` で選ぶ（`keydown` → クリック。ブラウザは `Space` でラジオを押し、`click` を出す）。 */
export function spacePick(el: HTMLElement): void {
  key(el, { key: " " });
  el.click();
}
/**
 * 矢印キーで `from` から `to` へ移る（`keydown` → 移った先の `click` と `change`。ブラウザは矢印で次のラジオを選び、どちらも出す）。
 * `click()` が `change` を出したかは環境に依るので、出たことを確かめてから返す。
 */
export function arrowMove(from: HTMLInputElement, to: HTMLInputElement): void {
  let changed = 0;
  const count = () => changed++;
  to.addEventListener("change", count);
  key(from, { key: "ArrowDown" });
  to.click();
  to.removeEventListener("change", count);
  if (changed !== 1) throw new Error(`矢印で移ったときの change が ${changed} 回（1 回のはず）`);
}
/** 部品の中でフォーカスがある要素（Shadow DOM の中は `document.activeElement` では見えない）。 */
export const focusedInForm = (w: Mounted) => shadow(w).activeElement;
/** 入力欄に書く。 */
export function type(el: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  el.value = text;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
export function setInnerHeight(value: number): void {
  Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value });
}
/** `<ask-form>` のクラス（プロパティを見張るのに使う）。 */
export function formProto(): AskFormElement {
  const ctor = customElements.get("ask-form");
  if (!ctor) throw new Error("<ask-form> が登録されていない");
  return ctor.prototype as AskFormElement;
}
/** 部品へ `spec` が入った回数と、そのとき部品に与えられていた高さを記録する（入れる動きは変えない）。 */
export function recordSpecSets(): { height: string; value: unknown }[] {
  const proto = formProto();
  const original = Object.getOwnPropertyDescriptor(proto, "spec")?.set;
  if (!original) throw new Error("spec の setter が無い");
  const sets: { height: string; value: unknown }[] = [];
  vi.spyOn(proto, "spec", "set").mockImplementation(function (
    this: AskFormElement,
    value: unknown,
  ) {
    sets.push({ height: this.style.height, value });
    original.call(this, value);
  });
  return sets;
}
