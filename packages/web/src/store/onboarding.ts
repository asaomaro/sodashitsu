import { defineStore } from "pinia";
import { ref } from "vue";
import { SEEN_STORAGE_KEY } from "./seen.js";
import { PREFIX_HELP_HINT_KEY, PREFS_KEY, writePrefs } from "./view.js";

/**
 * 初回の案内（20260926-settings-onboarding。herdr の `onboarding`）を出すかの判定と、案内済みの記録。
 * 案内済みは herdr と同じ名前・値（`onboarding = false`）で `soda.prefs.v1` に持つ（decisions D4）。
 */

/** 読むだけの面（テストで偽物を渡す）。 */
export type ReadableStorage = Pick<Storage, "getItem">;

/**
 * このブラウザに本製品を使った痕跡が無いか（true のときだけ案内を出す）。
 * **`readPrefs` を使わない**——読めない環境で `{}` を返し、「空」と区別できない（research F10）。
 * 読めないときは false（毎回出して邪魔しない側。`Toast.vue` の `hasShownHint` と同じ倒し方）。
 */
export function isFreshBrowser(storage: ReadableStorage | null): boolean {
  if (storage === null) return false;
  try {
    if (storage.getItem(PREFIX_HELP_HINT_KEY) !== null) return false;
    if (storage.getItem(SEEN_STORAGE_KEY) !== null) return false;
    // 中身は見ない——`{}` でも痕跡（キーを既定に戻すと `keys` が落ちて `{}` が残る。タスク点検 T1 の指摘）。
    return storage.getItem(PREFS_KEY) === null;
  } catch {
    return false;
  }
}

/**
 * 自動操作されているブラウザか（WebDriver の `navigator.webdriver`。Playwright・Selenium で true、人が使うブラウザでは false）。
 * 起動確認・E2E は新しいプロファイルで開くので、初回の案内が操作を遮る（decisions D11）。
 */
export function isAutomatedBrowser(): boolean {
  return typeof navigator !== "undefined" && navigator.webdriver === true;
}

/** `window.localStorage` の取得そのものが throw する環境がある（`main.ts` の `ThemeController` と同じ事情）。 */
function localStorageOrNull(): ReadableStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const useOnboardingStore = defineStore("onboarding", () => {
  /**
   * 起動時の判定。**ストアを作った時点で 1 回だけ**読む（同じ読み込みの中で書かれる痕跡に惑わされない。research F9）。
   * 自動操作されているブラウザでは出さない（設定画面からの開き直しは使える。D11）。
   */
  const pendingAtStartup = ref(!isAutomatedBrowser() && isFreshBrowser(localStorageOrNull()));
  /** この読み込みで起動時の案内を開いたか（2 回開かない）。 */
  const startupOpened = ref(false);

  function markStartupOpened(): void {
    startupOpened.value = true;
  }

  /** 案内済みにする。確定・スキップのどちらでも呼ぶ。 */
  function markDone(): void {
    pendingAtStartup.value = false;
    writePrefs({ onboarding: false });
  }

  return { pendingAtStartup, startupOpened, markStartupOpened, markDone };
});
