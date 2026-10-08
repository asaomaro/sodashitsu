import type { PrefsResult, SharedPrefs } from "@sodashitsu/protocol";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PREFS_KEY,
  PREFS_MIGRATED_KEY,
  isPrefsMigrated,
  markPrefsMigrated,
  onPrefsWritten,
  readPrefs,
  replaceSharedPrefs,
  sharedPrefsOf,
  useViewStore,
} from "../store/view.js";
import { useSettingsStore } from "../store/settings.js";
import { useNotificationsStore } from "../store/notifications.js";
import { applyPrefsToStores } from "../store/prefsApply.js";
import { ACTIONS, loadSidebarRows } from "@sodashitsu/client-core";
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
    /** 返すと、その code で prefs.set を失敗させる（送った patch を見て決められる）。 */
    failSet?: (patch: Record<string, unknown>) => string | undefined;
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
      const fail = opts.failSet?.(patch);
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
    migrated: isPrefsMigrated,
    markMigrated: markPrefsMigrated,
  });
  unsubscribe = onPrefsWritten((p) => sync.onWritten(p));
  const release = async (): Promise<void> => {
    for (const r of held.splice(0)) r();
    await flush();
  };
  return { sync, sets, toasts, getPrefs, release };
}

/** localStorage へ直に書く（ストアを通さない＝送らない）。 */
const writeLocal = (patch: Record<string, unknown>): void =>
  localStorage.setItem(PREFS_KEY, JSON.stringify({ ...stored(), ...patch }));

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

  it("移し終えたブラウザで、サーバが rev>0 なら送らず、手元の共有の項目をサーバの値で置き換えて各ストアへ当てる（端末ごとの項目は残す）", async () => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ theme: "nord", statusSymbols: false, sidebarWidth: 300 }),
    );
    localStorage.setItem(PREFS_MIGRATED_KEY, "1");
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

  // 統合の review の差し戻し（must）：先に端末版がサーバへ書いて rev>0 になっても、まだ移していないブラウザの設定を黙って捨てない。
  it("端末版が先に onboarding:false を書いた（rev 1）サーバへ、まだ移していないブラウザが繋ぐと、サーバに無いキー・テーマを移し、手元とサーバの両方に残る", async () => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ theme: "nord", keys: { prefix: "ctrl+a" }, sidebarWidth: 300 }),
    );
    const server = { prefs: { onboarding: false } as SharedPrefs, rev: 1 };
    const { sync, sets } = setup(server);
    sync.onOpened();
    await flush();
    expect(sets).toEqual([{ patch: { theme: "nord", keys: { prefix: "ctrl+a" } }, baseRev: 1 }]);
    expect(server.prefs).toEqual({ onboarding: false, theme: "nord", keys: { prefix: "ctrl+a" } });
    expect(stored()).toEqual({
      onboarding: false,
      theme: "nord",
      keys: { prefix: "ctrl+a" },
      sidebarWidth: 300,
    });
    expect(useSettingsStore(pinia).theme).toBe("nord");
    expect(useSettingsStore(pinia).keymap.prefix).toBe("ctrl+a");
    expect(isPrefsMigrated()).toBe(true);
    // 移し終えた後は移さない（次の接続でサーバの値が勝つ）
    sync.onClosed();
    server.prefs = { ...server.prefs, theme: "dracula" };
    server.rev++;
    writeLocal({ statusSymbols: false });
    sync.onOpened();
    await flush();
    expect(sets).toHaveLength(1);
    expect(useSettingsStore(pinia).theme).toBe("dracula");
  });

  it("まだ移していないブラウザでも、サーバにある項目はサーバの値が勝つ（送らない）", async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: "nord", statusSymbols: false }));
    const server = { prefs: { theme: "dracula" } as SharedPrefs, rev: 3 };
    const { sync, sets } = setup(server);
    sync.onOpened();
    await flush();
    expect(sets).toEqual([{ patch: { statusSymbols: false }, baseRev: 3 }]);
    expect(useSettingsStore(pinia).theme).toBe("dracula");
    expect(useSettingsStore(pinia).statusSymbols).toBe(false);
  });

  it("移す送信が失敗したら移し終えた印を付けず、次の接続でサーバに無い項目を送り直す", async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: "nord" }));
    const state: { fail?: string } = { fail: "internal" };
    const server = { prefs: { onboarding: false } as SharedPrefs, rev: 1 };
    const { sync, sets } = setup(server, { failSet: () => state.fail });
    sync.onOpened();
    await flush();
    expect(isPrefsMigrated()).toBe(false);
    delete state.fail;
    sync.onClosed();
    sync.onOpened();
    await flush();
    expect(sets.map((x) => x.patch)).toEqual([{ theme: "nord" }]);
    expect(isPrefsMigrated()).toBe(true);
  });

  it("移し終えた印があっても、サーバが rev 0（設定が消えた等）なら今までどおり全部移す", async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: "nord" }));
    localStorage.setItem(PREFS_MIGRATED_KEY, "1");
    const { sync, sets } = setup({ prefs: {}, rev: 0 });
    sync.onOpened();
    await flush();
    expect(sets).toEqual([{ patch: { theme: "nord" }, baseRev: 0 }]);
  });

  // 統合の review r2：大きすぎて断られた種も移し終えた扱い（読み込むたびに入れ直して断られ、知らせ続けない）。
  it("まだ移していないブラウザの種が大きすぎて断られても移し終えた印を付け、次の読み込みでは送らず知らせない", async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: "nord", keys: { prefix: "ctrl+a" } }));
    const server = { prefs: { onboarding: false } as SharedPrefs, rev: 1 };
    const tooLarge = (patch: Record<string, unknown>) =>
      "keys" in patch ? "invalid_params" : undefined;
    const allSets: unknown[] = [];
    const allToasts: string[] = [];
    for (let load = 1; load <= 3; load++) {
      unsubscribe?.();
      pinia = createPinia();
      const { sync, sets, toasts } = setup(server, { failSet: tooLarge });
      sync.onOpened();
      await flush();
      await flush();
      allSets.push(...sets.map((x) => x.patch));
      allToasts.push(...toasts);
      expect(isPrefsMigrated(), `load ${load}`).toBe(true);
    }
    expect(allSets).toEqual([{ theme: "nord" }]);
    expect(allToasts).toHaveLength(1);
    expect(server.prefs).toEqual({ onboarding: false, theme: "nord" });
  });

  // 統合の review r2：オブジェクトの項目（キーの割り当て等）は、サーバにもあっても中身を併合する（サーバの中身が勝つ）。
  it("ブラウザに 20 個の割り当て、端末版が先に 1 個を書いたサーバへ繋ぐと、サーバと手元の両方に 21 個（同じ操作はサーバが勝つ）", async () => {
    const actions = ACTIONS.map((a) => a.id).filter((id) => !id.includes("["));
    const mine: Record<string, string[]> = {};
    for (const [i, id] of actions.slice(0, 20).entries())
      mine[id] = [`ctrl+alt+${String.fromCharCode(97 + i)}`];
    const theirs = actions[20]!;
    const clash = actions[0]!;
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        keys: { bindings: mine, commands: { deploy: ["ctrl+alt+z"] } },
        notify: { toast: false, sound: true },
      }),
    );
    const server = {
      prefs: {
        keys: { bindings: { [theirs]: ["ctrl+alt+x"], [clash]: ["ctrl+alt+y"] } },
        notify: { toast: true },
      } as SharedPrefs,
      rev: 1,
    };
    const { sync } = setup(server);
    sync.onOpened();
    await flush();
    const expected = {
      bindings: { ...mine, [theirs]: ["ctrl+alt+x"], [clash]: ["ctrl+alt+y"] },
      commands: { deploy: ["ctrl+alt+z"] },
    };
    expect(Object.keys(expected.bindings)).toHaveLength(21);
    expect(server.prefs["keys"]).toEqual(expected);
    expect(server.prefs["notify"]).toEqual({ toast: true, sound: true });
    expect(stored()["keys"]).toEqual(expected);
    expect(stored()["notify"]).toEqual({ toast: true, sound: true });
    expect(isPrefsMigrated()).toBe(true);
  });

  it("オブジェクトの項目でも、サーバに無い中身が無ければ送らない（配列・値は葉でサーバが勝つ）", async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ keys: { bindings: { a: ["x"] } } }));
    const server = { prefs: { keys: { bindings: { a: ["y"] } } } as SharedPrefs, rev: 2 };
    const { sync, sets } = setup(server);
    sync.onOpened();
    await flush();
    expect(sets).toEqual([]);
    expect(stored()["keys"]).toEqual({ bindings: { a: ["y"] } });
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

  it("区画の比・折りたたみ（端末ごとの項目）の保存・消去は送らない（undefined で項目を消す書き込みも含む。20261004-ui-interaction-polish）", async () => {
    const { sync, sets } = setup({ prefs: { theme: "nord" }, rev: 2 });
    sync.onOpened();
    await flush();
    const view = useViewStore(pinia);
    view.setSectionRatio(0.3);
    view.commitSectionRatio();
    view.toggleSectionCollapsed("agents");
    view.resetSectionRatio();
    view.toggleSectionCollapsed("agents");
    await flush();
    expect(sets).toEqual([]);
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

// ラウンド 2 の点検の筋書き（scratchpad/check-02T6r2 の S1〜S4）と、競合の守りごとの回帰テスト。
describe("PrefsSync（移行・失敗・大きすぎるの競合）", () => {
  it("S1: 移行の送信の返事を待つ間の変更も、続けて送る", async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: "nord" }));
    const server = { prefs: {} as SharedPrefs, rev: 0 };
    const { sync, sets, release } = setup(server, { hold: true });
    sync.onOpened();
    await flush();
    useSettingsStore(pinia).setStatusSymbols(false);
    await release();
    await release();
    expect(sets.map((x) => x.patch)).toEqual([{ theme: "nord" }, { statusSymbols: false }]);
    expect(server.prefs).toMatchObject({ theme: "nord", statusSymbols: false });
  });

  it("S2: 移行の送信が失敗しても、溜めた変更を捨てない。その間にほかのクライアントが移したら、利用者の変更だけ残して種は捨てる", async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: "nord" }));
    const state: { fail?: string } = {};
    const server = { prefs: {} as SharedPrefs, rev: 0 };
    const { sync, sets } = setup(server, { failSet: () => state.fail });
    useSettingsStore(pinia).setStatusSymbols(false); // 繋がる前の変更
    state.fail = "internal";
    sync.onOpened();
    await flush(); // 移行の送信が失敗
    delete state.fail;
    sync.onClosed();
    server.prefs = { theme: "dracula", statusSymbols: true };
    server.rev = 1; // ほかのクライアントが先に移した
    sync.onOpened();
    await flush();
    expect(sets.map((x) => x.patch)).toEqual([{ statusSymbols: false }]);
    expect(useSettingsStore(pinia).statusSymbols).toBe(false);
    expect(useSettingsStore(pinia).theme).toBe("dracula");
  });

  it("S3: 大きすぎると断られた値は、この画面では効いたまま（ほかのクライアントの changed で戻さない）。知らせは 1 回", async () => {
    const state: { fail?: string } = {};
    const { sync, toasts } = setup({ prefs: {}, rev: 1 }, { failSet: () => state.fail });
    sync.onOpened();
    await flush();
    state.fail = "invalid_params";
    useSettingsStore(pinia).setStatusSymbols(false);
    await flush();
    sync.onChanged({ prefs: { theme: "nord" }, rev: 2, byClientId: "other" });
    expect(useSettingsStore(pinia).statusSymbols).toBe(false);
    expect(useSettingsStore(pinia).theme).toBe("nord");
    expect(toasts).toHaveLength(1);
  });

  it("S4: 移行が大きすぎると断られても、1 項目ずつ送り直して同期を続け、ほかのクライアントの changed も当てる", async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: "nord", statusSymbols: false }));
    const server = { prefs: {} as SharedPrefs, rev: 0 };
    let calls = 0;
    const { sync, sets } = setup(server, {
      failSet: () => (++calls === 1 ? "invalid_params" : undefined),
    });
    sync.onOpened();
    await flush();
    await flush();
    expect(sets.map((x) => x.patch)).toEqual([{ theme: "nord" }, { statusSymbols: false }]);
    sync.onChanged({
      prefs: { theme: "dracula", statusSymbols: false },
      rev: 9,
      byClientId: "other",
    });
    expect(useSettingsStore(pinia).theme).toBe("dracula");
  });

  it("1 項目だけ大きすぎるなら、その項目だけ手元に残して、ほかの項目は送る。書き直せばもう一度送る", async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: "nord", statusSymbols: false }));
    const server = { prefs: {} as SharedPrefs, rev: 0 };
    const state = { rejectTheme: true };
    // 偽のサーバ：theme を含む送信を大きすぎるとして断る
    const { sync, sets, toasts } = setup(server, {
      failSet: (p) => (state.rejectTheme && "theme" in p ? "invalid_params" : undefined),
    });
    sync.onOpened();
    await flush();
    await flush();
    expect(sets.map((x) => x.patch)).toEqual([{ statusSymbols: false }]);
    expect(toasts).toHaveLength(1);
    expect(useSettingsStore(pinia).theme).toBe("nord");
    state.rejectTheme = false;
    useSettingsStore(pinia).setTheme("tokyo-night");
    await flush();
    expect(sets.at(-1)?.patch).toMatchObject({ theme: "tokyo-night" });
    // 書き直して保存できた後は、この画面だけの値（前の大きすぎた値）を重ねない——後のほかのクライアントの変更が当たる。
    sync.onChanged({
      prefs: { theme: "dracula", statusSymbols: false },
      rev: 99,
      byClientId: "other",
    });
    expect(useSettingsStore(pinia).theme).toBe("dracula");
  });

  it("送信は同時に 1 回だけ。送っている間の変更は、返事の後にまとめて送る", async () => {
    const server = { prefs: {} as SharedPrefs, rev: 1 };
    const { sync, sets, release } = setup(server, { hold: true });
    sync.onOpened();
    await flush();
    const settings = useSettingsStore(pinia);
    settings.setStatusSymbols(false);
    await flush();
    settings.setPaneGaps(false);
    settings.setPaneOuterBorders(true);
    await flush();
    expect(sets).toEqual([]); // まだ 1 回目の返事を待っている
    await release();
    expect(sets.map((x) => x.patch)).toEqual([{ statusSymbols: false }]);
    await release();
    expect(sets.map((x) => x.patch)).toEqual([
      { statusSymbols: false },
      { paneGaps: false, paneOuterBorders: true },
    ]);
  });

  it("受け取る前に届いた changed は、受け取った後で rev が新しければ当てる", async () => {
    const server = { prefs: { theme: "nord" } as SharedPrefs, rev: 2 };
    const { sync, getPrefs } = setup(server);
    let resolveGet: (r: PrefsResult) => void = () => undefined;
    getPrefs.mockImplementationOnce(() => new Promise<PrefsResult>((r) => (resolveGet = r)));
    sync.onOpened();
    sync.onChanged({ prefs: { theme: "dracula" }, rev: 3, byClientId: "other" });
    resolveGet({ prefs: { theme: "nord" }, rev: 2 });
    await flush();
    expect(useSettingsStore(pinia).theme).toBe("dracula");
  });

  it("接続が替わった後に届いた古い接続の prefs.get の応答は捨てる", async () => {
    const server = { prefs: { theme: "nord" } as SharedPrefs, rev: 2 };
    const { sync, getPrefs } = setup(server);
    let resolveOld: (r: PrefsResult) => void = () => undefined;
    getPrefs.mockImplementationOnce(() => new Promise<PrefsResult>((r) => (resolveOld = r)));
    sync.onOpened();
    sync.onClosed();
    sync.onOpened();
    await flush();
    resolveOld({ prefs: { theme: "dracula" }, rev: 9 });
    await flush();
    expect(useSettingsStore(pinia).theme).toBe("nord");
  });

  it("受け取る前に届いた changed が prefs.get の rev より古ければ当てない", async () => {
    const server = { prefs: { theme: "nord" } as SharedPrefs, rev: 5 };
    const { sync, getPrefs } = setup(server);
    let resolveGet: (r: PrefsResult) => void = () => undefined;
    getPrefs.mockImplementationOnce(() => new Promise<PrefsResult>((r) => (resolveGet = r)));
    sync.onOpened();
    sync.onChanged({ prefs: { theme: "dracula" }, rev: 3, byClientId: "other" });
    resolveGet({ prefs: { theme: "nord" }, rev: 5 });
    await flush();
    expect(useSettingsStore(pinia).theme).toBe("nord");
  });

  it("送れずに溜まっている変更は、ほかのクライアントの changed の上にも重ねる（戻さない）", async () => {
    const state: { fail?: string } = {};
    const { sync } = setup({ prefs: {}, rev: 1 }, { failSet: () => state.fail });
    sync.onOpened();
    await flush();
    state.fail = "internal";
    useSettingsStore(pinia).setStatusSymbols(false); // 失敗して溜まる
    await flush();
    sync.onChanged({ prefs: { statusSymbols: true, theme: "nord" }, rev: 2, byClientId: "other" });
    expect(useSettingsStore(pinia).statusSymbols).toBe(false);
    expect(useSettingsStore(pinia).theme).toBe("nord");
  });

  it("送信の失敗を溜めに戻すとき、送っている間に書いた新しい値を古い値で上書きしない", async () => {
    const state: { fail?: string } = {};
    const { sync, sets, release } = setup(
      { prefs: {}, rev: 1 },
      { hold: true, failSet: () => state.fail },
    );
    sync.onOpened();
    await flush();
    const settings = useSettingsStore(pinia);
    settings.setStatusSymbols(false); // 送信中（待たせる）
    await flush();
    settings.setStatusSymbols(true); // 送信中に書き直した（溜まる）
    state.fail = "internal";
    await release(); // 1 回目が失敗
    delete state.fail;
    sync.onClosed();
    sync.onOpened();
    await flush();
    await release();
    expect(sets.map((x) => x.patch)).toEqual([{ statusSymbols: true }]);
  });

  it("送信中に接続が替わり、古い接続の送信が失敗したら、新しい接続ですぐ送り直す", async () => {
    const state: { fail?: string } = {};
    const { sync, sets, release } = setup(
      { prefs: {}, rev: 1 },
      { hold: true, failSet: () => state.fail },
    );
    sync.onOpened();
    await flush();
    useSettingsStore(pinia).setStatusSymbols(false); // 送信中（待たせる）
    await flush();
    sync.onClosed();
    sync.onOpened(); // 新しい接続は受け取り済み（送信中なので、まだ送らない）
    await flush();
    state.fail = "internal";
    await release(); // 古い接続の送信が失敗
    delete state.fail;
    await release(); // 新しい接続での送り直し
    expect(sets.map((x) => x.patch)).toEqual([{ statusSymbols: false }]);
  });

  it("大きすぎるの知らせは、1 回の操作につき 1 回（分けて送り直した項目がいくつ断られても）。次の操作でまた出す", async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: "nord", statusSymbols: false }));
    const { sync, toasts } = setup({ prefs: {}, rev: 0 }, { failSet: () => "invalid_params" });
    sync.onOpened();
    await flush();
    await flush();
    expect(toasts).toHaveLength(1);
    useSettingsStore(pinia).setPaneGaps(false);
    await flush();
    expect(toasts).toHaveLength(2);
  });
});

// 「消す」（上書き・割り当て・行の並びを既定へ戻す）が、サーバの共有の設定にも伝わる（20261008-main-e2e-failures A2）。
// ストアは消すとき `writePrefs({ key: undefined })` を呼ぶ。そのまま `prefs.set` へ載せると JSON 化でキーが落ち、サーバに古い値が残って再読み込みで戻る。
describe("PrefsSync（既定へ戻す = 消す）", () => {
  /** 通信で運ばれた形（JSON の往復。`undefined` のキーはここで落ちる）。 */
  const onWire = (patch: Record<string, unknown>): Record<string, unknown> => JSON.parse(JSON.stringify(patch)) as Record<string, unknown>;

  async function openSynced(prefs: SharedPrefs) {
    localStorage.setItem(PREFS_MIGRATED_KEY, "1");
    const server = { prefs, rev: 3 };
    const ctx = setup(server);
    ctx.sync.onOpened();
    await flush();
    ctx.sets.length = 0;
    return { ...ctx, server };
  }

  it("テーマの色の上書きを「すべて既定に戻す」と、prefs.set の patch にキーが残り（null）、サーバの値が消える", async () => {
    const { sets } = await openSynced({ themeOverrides: { dark: { "--soda-accent": "#222222" } } });
    const settings = useSettingsStore(pinia);
    expect(settings.themeOverrides.dark["--soda-accent"]).toBe("#222222");
    settings.resetAllThemeOverrides();
    await flush();
    expect(sets).toHaveLength(1);
    const wire = onWire(sets[0]!.patch);
    expect(Object.hasOwn(wire, "themeOverrides"), "キーが通信で落ちていない").toBe(true);
    expect(wire["themeOverrides"]).toBeNull();
  });

  it("キーの割り当てを「すべて既定に戻す」・サイドバーの行の並びを既定へ戻すときも、キーが落ちない", async () => {
    const { sets } = await openSynced({ keys: { prefix: "ctrl+a" }, sidebarRows: { spaces: { hidden: ["branch"] } } });
    const settings = useSettingsStore(pinia);
    expect(settings.keymap.prefix).toBe("ctrl+a");
    settings.resetAllKeys();
    await flush();
    expect(Object.hasOwn(onWire(sets.at(-1)!.patch), "keys")).toBe(true);
    expect(onWire(sets.at(-1)!.patch)["keys"]).toBeNull();
    settings.replaceSidebarRows(loadSidebarRows(undefined));
    await flush();
    const wire = onWire(sets.at(-1)!.patch);
    expect(Object.hasOwn(wire, "sidebarRows")).toBe(true);
    expect(wire["sidebarRows"]).toBeNull();
  });

  it("値を持つ項目はそのまま送る（null に変えない）。まだ送っていない間に消されても、最後の値（null）を送る", async () => {
    const { sets } = await openSynced({});
    const settings = useSettingsStore(pinia);
    settings.setThemeOverride("dark", "--soda-accent", "#333333");
    await flush();
    expect(onWire(sets.at(-1)!.patch)["themeOverrides"]).toEqual({ dark: { "--soda-accent": "#333333" } });
    settings.resetAllThemeOverrides();
    await flush();
    expect(onWire(sets.at(-1)!.patch)["themeOverrides"]).toBeNull();
  });
});
