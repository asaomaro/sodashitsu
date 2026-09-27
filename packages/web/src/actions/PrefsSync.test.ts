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
  opts: {
    local?: () => boolean;
    failSet?: () => string | undefined;
    /** true なら prefs.set の返事を `release()` まで待たせる（送信中の状態を作る）。 */
    hold?: boolean;
  } = {},
) {
  const sets: { patch: Record<string, unknown>; baseRev: number }[] = [];
  const held: (() => void)[] = [];
  const toasts: string[] = [];
  const getPrefs = vi.fn(async (): Promise<PrefsResult> => ({
    prefs: { ...server.prefs },
    rev: server.rev,
  }));
  const sync = new PrefsSync({
    getPrefs,
    setPrefs: async (patch, baseRev) => {
      if (opts.hold === true) await new Promise<void>((r) => held.push(r));
      const fail = opts.failSet?.();
      if (fail !== undefined) throw Object.assign(new Error(`${fail}: x`), { code: fail });
      sets.push({ patch, baseRev });
      server.prefs = { ...server.prefs, ...patch };
      server.rev++;
      return { prefs: { ...server.prefs }, rev: server.rev };
    },
    isLocal: opts.local ?? (() => true),
    readLocal: () => readPrefs(),
    sharedOf: sharedPrefsOf,
    replaceShared: replaceSharedPrefs,
    applyToStores: (raw) => applyPrefsToStores(pinia, raw),
    toast: (m) => toasts.push(m),
  });
  unsubscribe = onPrefsWritten((p) => sync.onWritten(p));
  const release = async (): Promise<void> => {
    for (const r of held.splice(0)) r();
    await flush();
  };
  return { sync, sets, toasts, getPrefs, release };
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

  // 点検の should（02 の修正）：移行の返事（ほかのクライアントが先に保存した項目を含む全体）を当てる。
  it("移行の返事の全体（取得と移行の間にほかのクライアントが保存した項目を含む）を当てる", async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: "nord" }));
    const server = { prefs: { agentSort: "priority" } as SharedPrefs, rev: 1 };
    const { sync, getPrefs } = setup(server);
    getPrefs.mockResolvedValueOnce({ prefs: {}, rev: 0 }); // 取得の時点ではまだ誰も保存していなかった
    sync.onOpened();
    await flush();
    expect(useViewStore(pinia).agentSort).toBe("priority");
    expect(stored()).toEqual({ theme: "nord", agentSort: "priority" });
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

  it("prefs.changed は、最後に当てた rev より新しければ（送った本人のものも）置き換えて当てる。古い rev は当てない", async () => {
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
    sync.onChanged({ prefs: { theme: "tokyo-night" }, rev: 4, byClientId: "me" }); // 本人の変更の知らせもサーバの全体として当てる
    expect(settings.theme).toBe("tokyo-night");
  });

  // 点検の must（02 の修正）：自分の set の往復中にほかのクライアントの changed が届いても、自分の新しい値を古い値で戻さず、自分の知らせで確定する。
  it("送信中の自分の変更は、先に届いたほかのクライアントの changed の上に重ね、自分の知らせで確定する", async () => {
    const server = { prefs: { theme: "nord" } as SharedPrefs, rev: 2 };
    const { sync, release } = setup(server, { hold: true });
    sync.onOpened();
    await flush();
    const settings = useSettingsStore(pinia);
    settings.setTheme("tokyo-night"); // 送信中（返事を待たせる）
    await flush();
    // ほかのクライアントが別の項目を保存した知らせ（サーバの全体の theme はまだ nord）
    sync.onChanged({ prefs: { theme: "nord", statusSymbols: false }, rev: 3, byClientId: "other" });
    expect(settings.theme).toBe("tokyo-night");
    expect(settings.statusSymbols).toBe(false);
    // 自分の保存の知らせ（返事より先に届く）
    sync.onChanged({
      prefs: { theme: "tokyo-night", statusSymbols: false, themeAuto: false },
      rev: 4,
      byClientId: "me",
    });
    await release();
    expect(settings.theme).toBe("tokyo-night");
    expect(stored()).toMatchObject({ theme: "tokyo-night", statusSymbols: false });
    // 確定した後のほかの変更は当たる
    sync.onChanged({
      prefs: { theme: "dracula", statusSymbols: false },
      rev: 5,
      byClientId: "other",
    });
    expect(settings.theme).toBe("dracula");
  });

  // 点検の should（02 の修正）：接続中に失敗した書き込みは、後の書き込みが成功していれば再接続で送り直さない。
  it("失敗した書き込みは、同じ項目の後の書き込みが成功していれば、再接続で古い値を送り直さない", async () => {
    const state: { fail?: string } = {};
    const { sync, sets } = setup({ prefs: {}, rev: 1 }, { failSet: () => state.fail });
    sync.onOpened();
    await flush();
    const settings = useSettingsStore(pinia);
    state.fail = "internal";
    settings.setStatusSymbols(false); // 失敗（切れかけ等）
    await flush();
    delete state.fail;
    settings.setStatusSymbols(true); // 成功
    await flush();
    expect(sets).toEqual([{ patch: { statusSymbols: true }, baseRev: 1 }]);
    sync.onClosed();
    sync.onOpened();
    await flush();
    expect(sets).toHaveLength(1); // 古い false を送り直さない
    expect(settings.statusSymbols).toBe(true);
  });

  it("失敗した書き込みが最後の書き込みなら、再接続で送る", async () => {
    const state: { fail?: string } = {};
    const { sync, sets } = setup({ prefs: {}, rev: 1 }, { failSet: () => state.fail });
    sync.onOpened();
    await flush();
    state.fail = "internal";
    useSettingsStore(pinia).setStatusSymbols(false);
    await flush();
    delete state.fail;
    sync.onClosed();
    sync.onOpened();
    await flush();
    expect(sets).toEqual([{ patch: { statusSymbols: false }, baseRev: 1 }]);
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
