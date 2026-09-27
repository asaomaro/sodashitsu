import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isFreshBrowser, useOnboardingStore, type ReadableStorage } from "./onboarding.js";
import { readPrefs } from "./view.js";

function snapshotStorage(): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    out[k] = localStorage.getItem(k);
  }
  return out;
}

function storageOf(entries: Record<string, string>): ReadableStorage {
  return { getItem: (k: string) => (k in entries ? entries[k]! : null) };
}

describe("isFreshBrowser（20260926-settings-onboarding の AC1・AC2・AC8）", () => {
  it("3 つの痕跡がどれも無いときだけ true", () => {
    expect(isFreshBrowser(storageOf({}))).toBe(true);
  });

  it("soda.prefs.v1 は中身が空のオブジェクトでも痕跡（キーを既定に戻した利用者は {} が残る）", () => {
    expect(isFreshBrowser(storageOf({ "soda.prefs.v1": "{}" }))).toBe(false);
  });

  it.each([
    ["保存された設定", { "soda.prefs.v1": JSON.stringify({ theme: "nord" }) }],
    ["案内済み", { "soda.prefs.v1": JSON.stringify({ onboarding: false }) }],
    ["キー一覧の案内の表示済みの印", { "soda.hint.prefixHelp.v1": "1" }],
    ["エージェントの既読の記録", { "soda.seen.v1": "{}" }],
  ])("%s があれば false（既存の利用者）", (_label, entries) => {
    expect(isFreshBrowser(storageOf(entries))).toBe(false);
  });

  it.each([
    ["JSON でない", "{"],
    ["配列", "[]"],
    ["null", "null"],
    ["文字列", '"x"'],
  ])("壊れた soda.prefs.v1（%s）は痕跡があるとみなして false", (_label, raw) => {
    expect(isFreshBrowser(storageOf({ "soda.prefs.v1": raw }))).toBe(false);
  });

  it("localStorage を取れない（null）・読むと throw する環境では false", () => {
    expect(isFreshBrowser(null)).toBe(false);
    const throwing: ReadableStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(isFreshBrowser(throwing)).toBe(false);
  });
});

describe("useOnboardingStore", () => {
  beforeEach(() => {
    localStorage.clear();
    // happy-dom の navigator.webdriver は true（自動操作の扱い）。人が使うブラウザを再現する（D11）。
    vi.spyOn(navigator, "webdriver", "get").mockReturnValue(false);
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("作った時点の localStorage で判定する（あとで痕跡が書かれても変わらない）", () => {
    setActivePinia(createPinia());
    const store = useOnboardingStore();
    expect(store.pendingAtStartup).toBe(true);
    localStorage.setItem("soda.hint.prefixHelp.v1", "1");
    expect(useOnboardingStore().pendingAtStartup).toBe(true);
  });

  it("既存の利用者のブラウザでは false で、判定は何も書かない（AC2）", () => {
    localStorage.setItem("soda.prefs.v1", JSON.stringify({ theme: "nord" }));
    localStorage.setItem("soda.hint.prefixHelp.v1", "1");
    const before = snapshotStorage();
    expect(Object.keys(before)).toHaveLength(2);
    setActivePinia(createPinia());
    expect(useOnboardingStore().pendingAtStartup).toBe(false);
    expect(snapshotStorage()).toEqual(before);
  });

  it("markDone は onboarding: false を書き、次の起動では出さない（AC5）", () => {
    setActivePinia(createPinia());
    const store = useOnboardingStore();
    expect(store.pendingAtStartup).toBe(true);
    store.markDone();
    expect(store.pendingAtStartup).toBe(false);
    expect(readPrefs()).toEqual({ onboarding: false });

    setActivePinia(createPinia());
    expect(useOnboardingStore().pendingAtStartup).toBe(false);
  });

  it("自動操作されているブラウザ（navigator.webdriver）では、痕跡が無くても出さない（D11）", () => {
    const webdriver = vi.spyOn(navigator, "webdriver", "get").mockReturnValue(true);
    setActivePinia(createPinia());
    expect(useOnboardingStore().pendingAtStartup).toBe(false);
    webdriver.mockReturnValue(false);
    setActivePinia(createPinia());
    expect(useOnboardingStore().pendingAtStartup, "人が使うブラウザ（false）では出す").toBe(true);
  });

  it("markStartupOpened は起動時に開いた印を立てる", () => {
    setActivePinia(createPinia());
    const store = useOnboardingStore();
    expect(store.startupOpened).toBe(false);
    store.markStartupOpened();
    expect(store.startupOpened).toBe(true);
  });
});
