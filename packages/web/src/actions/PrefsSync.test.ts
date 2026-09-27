import type { PrefsResult, SharedPrefs } from "@sodashitsu/protocol";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PREFS_KEY,
  onPrefsWritten,
  readPrefs,
  replaceSharedPrefs,
  sharedPrefsOf,
  useViewStore,
} from "../store/view.js";
import { useSettingsStore } from "../store/settings.js";
import { useNotificationsStore } from "../store/notifications.js";
import { applyPrefsToStores } from "../store/prefsApply.js";
import { PrefsSync } from "./PrefsSync.js";

/**
 * 20260927-cli-mode の T6：web の設定の置き場所をサーバへ。実物の `readPrefs`/`writePrefs`（localStorage・happy-dom）と実物のストアに、偽のサーバ（`prefs.get`/`prefs.set`）を繋ぐ。
 */
let pinia: Pinia;
let unsubscribe: (() => void) | undefined;

beforeEach(() => {
  localStorage.clear();
  pinia = createPinia();
});
afterEach(() => {
  unsubscribe?.();
  unsubscribe = undefined;
  localStorage.clear();
});

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

function setup(
  server: { prefs: SharedPrefs; rev: number },
  opts: { local?: () => boolean; clientId?: string; failSet?: () => string | undefined } = {},
) {
  const sets: { patch: SharedPrefs; baseRev: number }[] = [];
  const toasts: string[] = [];
  const getPrefs = vi.fn(async (): Promise<PrefsResult> => ({
    prefs: { ...server.prefs },
    rev: server.rev,
  }));
  const sync = new PrefsSync({
    getPrefs,
    setPrefs: async (patch, baseRev) => {
      const fail = opts.failSet?.();
      if (fail !== undefined) throw Object.assign(new Error(`${fail}: x`), { code: fail });
      sets.push({ patch, baseRev });
      server.prefs = { ...server.prefs, ...patch };
      server.rev++;
      return { prefs: { ...server.prefs }, rev: server.rev };
    },
    isLocal: opts.local ?? (() => true),
    clientId: () => opts.clientId ?? "me",
    readLocal: () => readPrefs(),
    sharedOf: sharedPrefsOf,
    replaceShared: replaceSharedPrefs,
    applyToStores: (raw) => applyPrefsToStores(pinia, raw),
    toast: (m) => toasts.push(m),
  });
  unsubscribe = onPrefsWritten((p) => sync.onWritten(p));
  return { sync, sets, toasts, getPrefs };
}

const stored = (): Record<string, unknown> =>
  JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Record<string, unknown>;

describe("PrefsSync（初回の移行）", () => {
  it("サーバが rev 0 で localStorage に設定があれば、共有の項目だけを送る（端末ごとの項目は送らない・手元は変えない）", async () => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        theme: "nord",
        statusSymbols: false,
        sidebarWidth: 300,
        sidebarCollapsed: true,
      }),
    );
    const { sync, sets } = setup({ prefs: {}, rev: 0 });
    sync.onOpened();
    await flush();
    expect(sets).toEqual([{ patch: { theme: "nord", statusSymbols: false }, baseRev: 0 }]);
    expect(stored()).toEqual({
      theme: "nord",
      statusSymbols: false,
      sidebarWidth: 300,
      sidebarCollapsed: true,
    });
  });

  it("サーバが rev>0 なら送らず、手元の共有の項目をサーバの値で置き換えて各ストアへ当てる（端末ごとの項目は残す）", async () => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ theme: "nord", statusSymbols: false, sidebarWidth: 300 }),
    );
    const settings = useSettingsStore(pinia);
    const view = useViewStore(pinia);
    const notifications = useNotificationsStore(pinia);
    expect(settings.statusSymbols).toBe(false);
    const { sync, sets } = setup({
      prefs: {
        theme: "dracula",
        agentSort: "priority",
        notify: { toast: false, desktop: true, sound: true },
        keys: { prefix: "ctrl+a" },
      },
      rev: 5,
    });
    sync.onOpened();
    await flush();
    expect(sets).toEqual([]);
    expect(stored()).toEqual({
      theme: "dracula",
      agentSort: "priority",
      notify: { toast: false, desktop: true, sound: true },
      keys: { prefix: "ctrl+a" },
      sidebarWidth: 300,
    });
    expect(settings.theme).toBe("dracula");
    expect(settings.statusSymbols).toBe(true); // サーバに無い項目は既定へ
    expect(view.agentSort).toBe("priority");
    expect(view.sidebarWidth).toBe(300);
    expect(notifications.prefs).toEqual({ toast: false, desktop: true, sound: true });
    expect(settings.keymap.prefix).toBe("ctrl+a");
  });

  it("rev 0 で localStorage が空なら何も送らない", async () => {
    const { sync, sets } = setup({ prefs: {}, rev: 0 });
    sync.onOpened();
    await flush();
    expect(sets).toEqual([]);
  });

  it("端末ごとの項目しか無ければ移行しない", async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ sidebarWidth: 300 }));
    const { sync, sets } = setup({ prefs: {}, rev: 0 });
    sync.onOpened();
    await flush();
    expect(sets).toEqual([]);
    expect(stored()).toEqual({ sidebarWidth: 300 });
  });
});

describe("PrefsSync（変更の送信・prefs.changed の反映）", () => {
  it("受け取った後の変更は共有の項目だけ prefs.set で送る（サイドバーの幅・折りたたみは送らない）", async () => {
    const { sync, sets } = setup({ prefs: { theme: "nord" }, rev: 2 });
    sync.onOpened();
    await flush();
    useSettingsStore(pinia).setStatusSymbols(false);
    const view = useViewStore(pinia);
    view.toggleSidebar();
    view.setSidebarWidth(200);
    view.commitSidebarWidth();
    await flush();
    expect(sets).toEqual([{ patch: { statusSymbols: false }, baseRev: 2 }]);
  });

  it("ほかのクライアントの prefs.changed は置き換えて当てる。自分の変更・古い rev は当てない", async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ sidebarCollapsed: true }));
    const { sync } = setup({ prefs: { theme: "nord" }, rev: 2 });
    sync.onOpened();
    await flush();
    const settings = useSettingsStore(pinia);
    sync.onChanged({ prefs: { theme: "dracula" }, rev: 3, byClientId: "other" });
    expect(settings.theme).toBe("dracula");
    expect(stored()).toEqual({ theme: "dracula", sidebarCollapsed: true });
    sync.onChanged({ prefs: { theme: "nord" }, rev: 3, byClientId: "other" }); // 同じ rev（古い）
    expect(settings.theme).toBe("dracula");
    sync.onChanged({ prefs: { theme: "nord" }, rev: 4, byClientId: "me" }); // 自分の変更
    expect(settings.theme).toBe("dracula");
    sync.onChanged({ prefs: { theme: "tokyo-night" }, rev: 5, byClientId: "other" });
    expect(settings.theme).toBe("tokyo-night");
  });

  it("受け取る前（接続前・切れている間）の prefs.changed は当てない", () => {
    const { sync } = setup({ prefs: {}, rev: 0 });
    sync.onChanged({ prefs: { theme: "nord" }, rev: 3, byClientId: "other" });
    expect(useSettingsStore(pinia).theme).not.toBe("nord");
  });

  it("切れている間の変更は溜めて、次に繋がったときにサーバの値より優先して送る", async () => {
    const server = { prefs: { theme: "nord" } as SharedPrefs, rev: 2 };
    const { sync, sets } = setup(server);
    sync.onOpened();
    await flush();
    sync.onClosed();
    useSettingsStore(pinia).setStatusSymbols(false);
    await flush();
    expect(sets).toEqual([]);
    server.prefs = { theme: "dracula", statusSymbols: true };
    server.rev = 7;
    sync.onOpened();
    await flush();
    expect(sets).toEqual([{ patch: { statusSymbols: false }, baseRev: 7 }]);
    expect(useSettingsStore(pinia).statusSymbols).toBe(false);
    expect(useSettingsStore(pinia).theme).toBe("dracula");
  });

  it("ほかのマシンを向いている間は prefs.get を呼ばず、変更は溜める", async () => {
    let local = false;
    const { sync, sets, getPrefs } = setup({ prefs: {}, rev: 1 }, { local: () => local });
    sync.onOpened();
    await flush();
    expect(getPrefs).not.toHaveBeenCalled();
    useSettingsStore(pinia).setStatusSymbols(false);
    await flush();
    expect(sets).toEqual([]);
    local = true;
    sync.onOpened();
    await flush();
    expect(sets).toEqual([{ patch: { statusSymbols: false }, baseRev: 1 }]);
  });

  it("大きすぎて断られたら知らせる", async () => {
    const state: { fail?: string } = {};
    const { sync, toasts } = setup({ prefs: {}, rev: 1 }, { failSet: () => state.fail });
    sync.onOpened();
    await flush();
    state.fail = "invalid_params";
    useSettingsStore(pinia).setStatusSymbols(false);
    await flush();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toContain("大きすぎる");
  });
});
