import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SIDEBAR_WIDTH,
  isDeviceLocalPref,
  loadSidebarSectionRatio,
  sharedPrefsOf,
  loadSidebarCollapsed,
  loadSidebarWidth,
  loadUngroupedCollapsed,
  readPrefs,
  useViewStore,
  writePrefs,
} from "./view.js";

let pinia: Pinia;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  pinia = createPinia();
});
afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

// 20260920-sidebar-tabbar-controls の AC10：並び順は「この端末での好み」なので、
// 表示位置（sessionStorage）ではなく localStorage に置く——タブを閉じて開き直しても残す必要がある。
describe("useViewStore — agents の並び順", () => {
  it("既定は grouped で、押すたびに priority と行き来する", () => {
    const store = useViewStore(pinia);
    expect(store.agentSort).toBe("grouped");
    store.toggleAgentSort();
    expect(store.agentSort).toBe("priority");
    store.toggleAgentSort();
    expect(store.agentSort).toBe("grouped");
  });

  it("切り替えると localStorage に残り、新しいストアが読み戻す（タブを閉じて開き直しても残る）", () => {
    const store = useViewStore(pinia);
    store.toggleAgentSort();
    expect(sessionStorage.getItem("soda.prefs.v1")).toBeNull(); // 表示位置とは別の入れ物
    const store2 = useViewStore(createPinia());
    expect(store2.agentSort).toBe("priority");
  });

  it("壊れた値が入っていたら grouped に落とす", () => {
    localStorage.setItem("soda.prefs.v1", JSON.stringify({ agentSort: "なにか" }));
    expect(useViewStore(createPinia()).agentSort).toBe("grouped");
  });

  it("localStorage が読めない環境でも動く（保存が効かないだけ）", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("denied");
    };
    try {
      expect(useViewStore(createPinia()).agentSort).toBe("grouped");
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});

// 20260922-appearance-settings-rest T1（design「インターフェース / データ構造」の `view.ts` 節）。
// agents の並び順（上）と同じ形（soda.prefs.v1・localStorage）。
describe("useViewStore — workspace（spaces）の並び順", () => {
  it("既定は opened で、押すたびに name と行き来する", () => {
    const store = useViewStore(pinia);
    expect(store.workspaceSort).toBe("opened");
    store.toggleWorkspaceSort();
    expect(store.workspaceSort).toBe("name");
    store.toggleWorkspaceSort();
    expect(store.workspaceSort).toBe("opened");
  });

  it("切り替えると localStorage に残り、新しいストアが読み戻す", () => {
    const store = useViewStore(pinia);
    store.toggleWorkspaceSort();
    expect(sessionStorage.getItem("soda.prefs.v1")).toBeNull(); // 表示位置とは別の入れ物
    const store2 = useViewStore(createPinia());
    expect(store2.workspaceSort).toBe("name");
  });

  it("壊れた値が入っていたら opened に落とす", () => {
    localStorage.setItem("soda.prefs.v1", JSON.stringify({ workspaceSort: "なにか" }));
    expect(useViewStore(createPinia()).workspaceSort).toBe("opened");
  });

  it("localStorage が読めない環境でも動く（保存が効かないだけ）", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("denied");
    };
    try {
      expect(useViewStore(createPinia()).workspaceSort).toBe("opened");
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});

// 20260920-agent-notifications の AC6：`soda.prefs.v1` は複数の設定が同居するので、
// **書き込みは併合でなければならない**。以前は全置換で、項目を足しても並び順を切り替えた瞬間に消えた。
describe("soda.prefs.v1 の読み書き（併合式）", () => {
  it("writePrefs は既存の値を残したまま足す", () => {
    writePrefs({ a: 1 });
    writePrefs({ b: 2 });
    expect(readPrefs()).toEqual({ a: 1, b: 2 });
  });

  it("同じキーは上書きする", () => {
    writePrefs({ a: 1 });
    writePrefs({ a: 2 });
    expect(readPrefs()).toEqual({ a: 2 });
  });

  // **これが AC6 の核心**：並び順を切り替えても、他の設定が巻き添えで消えない。
  it("並び順を切り替えても、同居する他の設定が消えない", () => {
    writePrefs({ notify: { toast: false, desktop: true, sound: true } });
    const store = useViewStore(pinia);
    store.toggleAgentSort();
    expect(readPrefs()).toEqual({ notify: { toast: false, desktop: true, sound: true }, agentSort: "priority" });
  });

  // 逆向きも確かめる：後から並び順を読み戻しても、他の設定が残っている。
  it("他の設定を書いても、並び順が消えない", () => {
    const store = useViewStore(pinia);
    store.toggleAgentSort();
    writePrefs({ notifyHintDone: true });
    expect(useViewStore(createPinia()).agentSort).toBe("priority");
    expect(readPrefs()["notifyHintDone"]).toBe(true);
  });

  it("壊れた中身（配列・非オブジェクト）は空として扱う", () => {
    localStorage.setItem("soda.prefs.v1", JSON.stringify([1, 2]));
    expect(readPrefs()).toEqual({});
    localStorage.setItem("soda.prefs.v1", "{ not json");
    expect(readPrefs()).toEqual({});
  });

  it("書けない環境でも throw しない", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("denied");
    };
    try {
      expect(() => writePrefs({ a: 1 })).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});

describe("useViewStore — 「グループなし」の折りたたみ（共有の設定 ungroupedCollapsed）", () => {
  it("既定は広げている。切り替えるたびに soda.prefs.v1 へ書く", () => {
    localStorage.clear();
    const view = useViewStore(createPinia());
    expect(view.ungroupedCollapsed).toBe(false);
    view.toggleUngroupedCollapsed();
    expect(view.ungroupedCollapsed).toBe(true);
    expect(readPrefs()["ungroupedCollapsed"]).toBe(true);
    view.toggleUngroupedCollapsed();
    expect(readPrefs()["ungroupedCollapsed"]).toBe(false);
  });

  it("保存された true だけ畳む（壊れた値は広げる）", () => {
    expect(loadUngroupedCollapsed(true)).toBe(true);
    expect(loadUngroupedCollapsed("true")).toBe(false);
    expect(loadUngroupedCollapsed(undefined)).toBe(false);
  });
});

describe("useViewStore — restoreView", () => {
  it("sessionStorage に前回の tab があり、まだ存在すればそれを使う（その tab の focusedPaneId へフォーカスする）", () => {
    const store = useViewStore(pinia);
    store.setView("w1", "t1");
    const store2 = useViewStore(createPinia()); // 新しいストア（再起動を模する）が同じ sessionStorage を読む
    store2.restoreView(
      () => "p1", // その tab の（サーバ全体で最後にフォーカスされた）pane
      { workspaceId: "w9", tabId: "t9", paneId: "p9" },
    );
    expect(store2.workspaceId).toBe("w1");
    expect(store2.tabId).toBe("t1");
    expect(store2.focusedPaneId).toBe("p1"); // ページ再読み込み後もキーボード操作を再開できる（AC-I3）
  });

  it("前回の tab がもう無ければサーバの focus を使う", () => {
    const store = useViewStore(pinia);
    store.setView("w1", "t1");
    const store2 = useViewStore(createPinia());
    store2.restoreView(
      () => null, // 前回の tab は無い
      { workspaceId: "w2", tabId: "t2", paneId: "p2" },
    );
    expect(store2.workspaceId).toBe("w2");
    expect(store2.tabId).toBe("t2");
    expect(store2.focusedPaneId).toBe("p2");
  });

  it("sessionStorage に何も無く、サーバの focus も無ければ何も設定しない", () => {
    const store = useViewStore(pinia);
    store.restoreView(() => "p1", null);
    expect(store.workspaceId).toBeNull();
    expect(store.tabId).toBeNull();
  });
});

describe("useViewStore — setView / focusPane", () => {
  it("setView は sessionStorage にも保存する", () => {
    const store = useViewStore(pinia);
    store.setView("w1", "t1");
    expect(sessionStorage.getItem("soda.view.v1")).toBe(JSON.stringify({ workspaceId: "w1", tabId: "t1" }));
  });

  it("focusPane", () => {
    const store = useViewStore(pinia);
    store.focusPane("p1");
    expect(store.focusedPaneId).toBe("p1");
    store.focusPane(null);
    expect(store.focusedPaneId).toBeNull();
  });

  // 20260923-missing-keybinding-actions（last_pane。herdr の「1スロットトグル」。research F2）。
  it("focusPane は直前の focusedPaneId を lastFocusedPaneId に積む（トグル）", () => {
    const store = useViewStore(pinia);
    expect(store.lastFocusedPaneId).toBeNull(); // 初期状態

    store.focusPane("p1"); // 最初の focus（直前が null なので lastFocusedPaneId は動かない）
    expect(store.lastFocusedPaneId).toBeNull();

    store.focusPane("p2");
    expect(store.lastFocusedPaneId).toBe("p1"); // p1 → p2 の移動で「直前」が p1 になる

    store.focusPane("p1"); // トグルで p1 に戻る
    expect(store.lastFocusedPaneId).toBe("p2"); // 「直前」も p2 に入れ替わる
  });

  it("focusPane は同じ pane への再フォーカスでは lastFocusedPaneId を動かさない", () => {
    const store = useViewStore(pinia);
    store.focusPane("p1");
    store.focusPane("p2");
    expect(store.lastFocusedPaneId).toBe("p1");
    store.focusPane("p2"); // 同じ pane への無変化の書き戻し
    expect(store.lastFocusedPaneId).toBe("p1"); // 変わらない
  });

  it("focusPane(null) は lastFocusedPaneId を動かさない（意味の無い「直前」を作らない）", () => {
    const store = useViewStore(pinia);
    store.focusPane("p1");
    store.focusPane("p2");
    expect(store.lastFocusedPaneId).toBe("p1");
    store.focusPane(null);
    expect(store.lastFocusedPaneId).toBe("p1"); // p2 が消えても直前の記録は保持される
  });
});

describe("useViewStore — モード・ダイアログ・接続状態", () => {
  it("onModeChange はモードを反映し、isPrefixWaiting も連動する", () => {
    const store = useViewStore(pinia);
    expect(store.isPrefixWaiting).toBe(false);
    store.onModeChange("prefix");
    expect(store.mode).toBe("prefix");
    expect(store.isPrefixWaiting).toBe(true);
  });

  it("setOpenDialog", () => {
    const store = useViewStore(pinia);
    store.setOpenDialog("help");
    expect(store.openDialog).toBe("help");
    store.setOpenDialog(null);
    expect(store.openDialog).toBeNull();
  });

  it("openDialogWithContext: 開く前の focus を覚え、closeDialog で戻す（AC-I4）", () => {
    const store = useViewStore(pinia);
    store.focusPane("p1");
    store.openDialogWithContext({ kind: "newTab", workspaceId: "w1" });
    expect(store.openDialog).toBe("newTab");
    expect(store.dialogContext).toEqual({ kind: "newTab", workspaceId: "w1" });

    store.focusPane(null); // ダイアログが開いている間はフォーカスが外れている想定
    store.closeDialog();
    expect(store.openDialog).toBeNull();
    expect(store.dialogContext).toBeNull();
    expect(store.focusedPaneId).toBe("p1"); // 開く前の pane に戻る
  });

  // 20260927-agent-graph（design D-6・research F7.2）：グラフはダイアログの 1 枠とは別の状態。
  // 20261008-graph-first（PR1b）：デスクトップは画面（`screen`）、1 列（モバイル）は重ねるダイアログ（`graphDialogOpen`）。
  describe("グラフ: デスクトップの画面（screen）", () => {
    it("openGraph / closeGraph は screen を graph / base にする。ダイアログではないので modalOpen・keysCaptured に入らない（D12）", () => {
      const store = useViewStore(pinia);
      store.focusPane("p1");
      expect(store.screen).toBe("base");
      store.openGraph();
      expect(store.screen).toBe("graph");
      expect(store.graphVisible).toBe(true);
      expect(store.graphDialogOpen).toBe(false);
      expect(store.modalOpen).toBe(false);
      expect(store.keysCaptured).toBe(false);
      expect(store.openDialog).toBeNull(); // ダイアログの枠は使わない
      store.closeGraph();
      expect(store.screen).toBe("base");
      expect(store.graphVisible).toBe(false);
    });

    it("グラフの間に選び直した pane は、基本画面へ戻っても保たれる（AC-S3。開く前の pane へは戻さない）", () => {
      const store = useViewStore(pinia);
      store.focusPane("p1");
      store.openGraph();
      expect(store.preGraphFocusPaneId).toBe("p1"); // ノードの最初の選択に使う
      store.focusPane("p2"); // サイドバーで選んだ
      store.closeGraph();
      expect(store.focusedPaneId).toBe("p2");
      expect(store.preGraphFocusPaneId).toBeNull();
    });

    it("setScreen: 画面の一覧にある id へ切り替える。1 列の画面では基本画面のまま", () => {
      const store = useViewStore(pinia);
      store.setScreen("graph");
      expect(store.screen).toBe("graph");
      store.setScreen("base");
      expect(store.screen).toBe("base");
      store.setMobileViewport(true);
      store.setScreen("graph");
      expect(store.screen).toBe("base");
    });

    it("窓が 1 列の画面になったら基本画面へ戻る。デスクトップに戻っても、グラフの画面は開き直さない（D13）", () => {
      const store = useViewStore(pinia);
      store.openGraph();
      store.setMobileViewport(true);
      expect(store.screen).toBe("base");
      expect(store.graphVisible).toBe(false);
      store.setMobileViewport(false);
      expect(store.screen).toBe("base");
    });

    it("グラフの画面の中からダイアログを開いて閉じても、画面は graph のまま。ダイアログの間は modalOpen・keysCaptured が真", () => {
      const store = useViewStore(pinia);
      store.focusPane("p1");
      store.openGraph();
      store.openDialogWithContext({ kind: "help" });
      expect(store.screen).toBe("graph");
      expect(store.modalOpen).toBe(true);
      expect(store.keysCaptured).toBe(true);
      store.closeDialog();
      expect(store.screen).toBe("graph");
      expect(store.modalOpen).toBe(false);
      expect(store.keysCaptured).toBe(false);
    });

    it("マシンの切り替えでは画面を変えない（手元のもの）", () => {
      const store = useViewStore(pinia);
      store.focusPane("p1");
      store.openGraph();
      store.resetForMachineSwitch();
      expect(store.screen).toBe("graph");
      expect(store.preGraphFocusPaneId).toBeNull();
    });
  });

  // 20261010-agent-usage PR3：3 つ目の画面（ダッシュボード）。デスクトップは画面、1 列は重ねるダイアログ（ダイアログの 1 枠）。
  describe("ダッシュボード", () => {
    it("openDashboard / closeDashboard はデスクトップでは screen を dashboard / base にする。見えている間だけ dashboardVisible", () => {
      const store = useViewStore(pinia);
      expect(store.dashboardVisible).toBe(false);
      store.openDashboard();
      expect(store.screen).toBe("dashboard");
      expect(store.dashboardVisible).toBe(true);
      expect(store.graphVisible).toBe(false);
      expect(store.modalOpen).toBe(false); // 画面なので、キーを奪うダイアログではない
      store.closeDashboard();
      expect(store.screen).toBe("base");
      expect(store.dashboardVisible).toBe(false);
    });

    it("グラフとダッシュボードは、画面の切り替えで入れ替わる（同時には見えない）", () => {
      const store = useViewStore(pinia);
      store.openGraph();
      store.setScreen("dashboard");
      expect(store.dashboardVisible).toBe(true);
      expect(store.graphVisible).toBe(false);
      store.setScreen("graph");
      expect(store.dashboardVisible).toBe(false);
      expect(store.graphVisible).toBe(true);
    });

    it("1 列では、画面でなくダイアログ（dialogContext）として開く。閉じると開く前の pane へ戻る。デスクトップに戻ったら閉じる", () => {
      const store = useViewStore(pinia);
      store.setMobileViewport(true);
      store.focusPane("p1");
      store.openDashboard();
      expect(store.screen).toBe("base");
      expect(store.dialogContext).toEqual({ kind: "dashboard" });
      expect(store.dashboardVisible).toBe(true);
      expect(store.modalOpen).toBe(true);
      store.closeDashboard();
      expect(store.dialogContext).toBeNull();
      expect(store.dashboardVisible).toBe(false);
      expect(store.focusedPaneId).toBe("p1");
      store.openDashboard();
      store.setMobileViewport(false);
      expect(store.dialogContext).toBeNull();
      expect(store.screen).toBe("base"); // 画面として開き直しはしない
    });

    it("窓が 1 列の画面になったら、ダッシュボードの画面から基本画面へ戻る", () => {
      const store = useViewStore(pinia);
      store.openDashboard();
      store.setMobileViewport(true);
      expect(store.screen).toBe("base");
      expect(store.dashboardVisible).toBe(false);
    });
  });

  describe("グラフ: 1 列（モバイル）の重ねるダイアログ", () => {
    it("openGraph / closeGraph: 開く前の focus を覚えて戻す。二度開いても戻り先は最初のまま。screen は変えない", () => {
      const store = useViewStore(pinia);
      store.setMobileViewport(true);
      store.focusPane("p1");
      expect(store.modalOpen).toBe(false);
      store.openGraph();
      expect(store.graphDialogOpen).toBe(true);
      expect(store.graphVisible).toBe(true);
      expect(store.screen).toBe("base");
      expect(store.modalOpen).toBe(true);
      expect(store.keysCaptured).toBe(true);
      expect(store.openDialog).toBeNull(); // ダイアログの枠は使わない
      store.focusPane("p2");
      store.openGraph();
      expect(store.preGraphFocusPaneId).toBe("p1");
      store.closeGraph();
      expect(store.graphDialogOpen).toBe(false);
      expect(store.focusedPaneId).toBe("p1");
      expect(store.modalOpen).toBe(false);
    });

    it("グラフの中からダイアログを開いて閉じても、グラフは開いたまま（modalOpen も真のまま）", () => {
      const store = useViewStore(pinia);
      store.setMobileViewport(true);
      store.focusPane("p1");
      store.openGraph();
      store.openDialogWithContext({ kind: "help" });
      expect(store.graphDialogOpen).toBe(true);
      store.closeDialog();
      expect(store.graphDialogOpen).toBe(true);
      expect(store.modalOpen).toBe(true);
      store.closeGraph();
      expect(store.focusedPaneId).toBe("p1");
    });

    it("マシンの切り替えではグラフを閉じない（手元のもの）。戻り先の pane の id だけ捨てる", () => {
      const store = useViewStore(pinia);
      store.setMobileViewport(true);
      store.focusPane("p1");
      store.openGraph();
      store.resetForMachineSwitch();
      expect(store.graphDialogOpen).toBe(true);
      expect(store.preGraphFocusPaneId).toBeNull();
      store.closeGraph();
      expect(store.focusedPaneId).toBeNull(); // 前のマシンの p1 へは戻さない
    });

    it("デスクトップの幅に戻ったとき、開いていた重ねるダイアログは閉じる", () => {
      const store = useViewStore(pinia);
      store.setMobileViewport(true);
      store.openGraph();
      store.setMobileViewport(false);
      expect(store.graphDialogOpen).toBe(false);
      expect(store.screen).toBe("base");
    });
  });

  it("onConnectionState: 'open' になると authRequired を解除する", () => {
    const store = useViewStore(pinia);
    store.onAuthRequired();
    expect(store.authRequired).toBe(true);
    store.onConnectionState("connecting");
    expect(store.authRequired).toBe(true); // まだ解除しない
    store.onConnectionState("open");
    expect(store.connectionState).toBe("open");
    expect(store.authRequired).toBe(false);
  });

  it("onConnectionState: 'rejected'（/api/session が 403＝Cookie は有効）も authRequired を解除する（D107：ログイン画面の「接続中…」のまま止めない）", () => {
    const store = useViewStore(pinia);
    store.onAuthRequired();
    store.onConnectionState("connecting");
    store.onConnectionState("rejected");
    expect(store.connectionState).toBe("rejected");
    expect(store.authRequired).toBe(false);
  });

  it("setOriginRejectSuspected：繋ぎ直しの手がかり（D107）を立てる・下ろす", () => {
    const store = useViewStore(pinia);
    expect(store.originRejectSuspected).toBe(false);
    store.setOriginRejectSuspected(true);
    expect(store.originRejectSuspected).toBe(true);
    store.setOriginRejectSuspected(false);
    expect(store.originRejectSuspected).toBe(false);
  });

  it("onAuthRequired は呼ばれるたびに authRequiredCount を増やす（authRequired が既に true でも。D105：ログイン画面の接続待ちを戻す合図）", () => {
    const store = useViewStore(pinia);
    expect(store.authRequiredCount).toBe(0);
    store.onAuthRequired();
    store.onAuthRequired();
    expect(store.authRequired).toBe(true);
    expect(store.authRequiredCount).toBe(2);
  });

  it("toggleSidebar", () => {
    const store = useViewStore(pinia);
    expect(store.sidebarCollapsed).toBe(false);
    store.toggleSidebar();
    expect(store.sidebarCollapsed).toBe(true);
    store.toggleSidebar();
    expect(store.sidebarCollapsed).toBe(false);
  });
});

// 20260921-herdr-settings-gaps の AC1〜AC3：幅と折りたたみは**操作した結果を覚える**（設定の項目ではない。D1）。
describe("useViewStore — サイドバーの幅と折りたたみを覚える", () => {
  it("畳むと保存され、新しいストアが畳んだまま読み戻す（AC2）", () => {
    useViewStore(pinia).toggleSidebar();
    expect(readPrefs()["sidebarCollapsed"]).toBe(true);
    expect(useViewStore(createPinia()).sidebarCollapsed).toBe(true);
  });

  it("開き直しても保存される（畳む → 開く で false が残る）", () => {
    const store = useViewStore(pinia);
    store.toggleSidebar();
    store.toggleSidebar();
    expect(useViewStore(createPinia()).sidebarCollapsed).toBe(false);
  });

  it("幅は setSidebarWidth では保存せず、commitSidebarWidth で保存する（ドラッグ中は書かない）", () => {
    const store = useViewStore(pinia);
    store.setSidebarWidth(300);
    expect(store.sidebarWidth).toBe(300);
    expect(readPrefs()["sidebarWidth"], "ドラッグの途中では書かない").toBeUndefined();
    store.commitSidebarWidth();
    expect(readPrefs()["sidebarWidth"]).toBe(300);
    expect(useViewStore(createPinia()).sidebarWidth, "新しいストアが読み戻す（AC1）").toBe(300);
  });

  it("setSidebarWidth は範囲に収める", () => {
    const store = useViewStore(pinia);
    store.setSidebarWidth(10);
    expect(store.sidebarWidth).toBe(SIDEBAR_WIDTH.min);
    store.setSidebarWidth(9999);
    expect(store.sidebarWidth).toBe(SIDEBAR_WIDTH.max);
  });

  // 他の好み（並び順・通知）を消さない——`writePrefs` の併合に乗っている。
  it("幅と折りたたみを保存しても、並び順は消えない", () => {
    const store = useViewStore(pinia);
    store.toggleAgentSort();
    store.setSidebarWidth(200);
    store.commitSidebarWidth();
    store.toggleSidebar();
    expect(readPrefs()).toMatchObject({ agentSort: "priority", sidebarWidth: 200, sidebarCollapsed: true });
  });

  it("何も保存されていなければ 240px・展開", () => {
    const store = useViewStore(pinia);
    expect(store.sidebarWidth).toBe(240);
    expect(store.sidebarCollapsed).toBe(false);
  });

  // AC3：壊れた値でも起動できる。
  it("保存された値が壊れていれば既定で起動する", () => {
    writePrefs({ sidebarWidth: "wide", sidebarCollapsed: "yes" });
    const store = useViewStore(createPinia());
    expect(store.sidebarWidth).toBe(240);
    expect(store.sidebarCollapsed).toBe(false);
  });

  describe("区画の比と折りたたみ（20261004-ui-interaction-polish）", () => {
    it("何も保存されていなければ自動の配分・どちらも開いている", () => {
      const store = useViewStore(pinia);
      expect(store.sidebarSectionRatio).toBeNull();
      expect(store.sectionsCollapsed).toEqual({ spaces: false, agents: false });
    });

    it("比は setSectionRatio では保存せず、commitSectionRatio で保存する（ドラッグ中は書かない）", () => {
      const store = useViewStore(pinia);
      store.setSectionRatio(0.3);
      expect(store.sidebarSectionRatio).toBe(0.3);
      expect(readPrefs()["sidebarSectionRatio"], "ドラッグの途中では書かない").toBeUndefined();
      store.commitSectionRatio();
      expect(readPrefs()["sidebarSectionRatio"]).toBe(0.3);
      expect(useViewStore(createPinia()).sidebarSectionRatio, "新しいストアが読み戻す").toBe(0.3);
    });

    it("resetSectionRatio は null にして、保存から項目を消す（ほかの項目は残す）", () => {
      const store = useViewStore(pinia);
      store.toggleAgentSort();
      store.setSectionRatio(0.3);
      store.commitSectionRatio();
      store.resetSectionRatio();
      expect(store.sidebarSectionRatio).toBeNull();
      expect("sidebarSectionRatio" in readPrefs()).toBe(false);
      expect(readPrefs()["agentSort"]).toBe("priority");
      expect(useViewStore(createPinia()).sidebarSectionRatio).toBeNull();
    });

    it("commitSectionRatio は比が無い（自動）なら保存の項目を消す", () => {
      const store = useViewStore(pinia);
      store.setSectionRatio(0.3);
      store.commitSectionRatio();
      store.setSectionRatio(null);
      store.commitSectionRatio();
      expect("sidebarSectionRatio" in readPrefs()).toBe(false);
    });

    it("toggleSectionCollapsed は切り替えるたびに、畳んでいる区画だけを保存する", () => {
      const store = useViewStore(pinia);
      store.toggleSectionCollapsed("agents");
      expect(store.sectionsCollapsed).toEqual({ spaces: false, agents: true });
      expect(readPrefs()["sidebarSectionsCollapsed"]).toEqual({ agents: true });
      store.toggleSectionCollapsed("spaces");
      expect(readPrefs()["sidebarSectionsCollapsed"]).toEqual({ spaces: true, agents: true });
      expect(useViewStore(createPinia()).sectionsCollapsed).toEqual({ spaces: true, agents: true });
      store.toggleSectionCollapsed("agents");
      store.toggleSectionCollapsed("spaces");
      expect("sidebarSectionsCollapsed" in readPrefs(), "どちらも開けば項目を消す").toBe(false);
    });

    it("壊れた値は『無い』（範囲外・数でない比、true でない折りたたみ）", () => {
      expect(loadSidebarSectionRatio(Number.NaN)).toBeNull(); // JSON を通ると null になるので、読み込みの関数で直接見る
      expect(loadSidebarSectionRatio(Number.POSITIVE_INFINITY)).toBeNull();
      for (const bad of [0, 1, -0.5, 1.5, "0.5", null, {}]) {
        writePrefs({ sidebarSectionRatio: bad });
        expect(useViewStore(createPinia()).sidebarSectionRatio, String(bad)).toBeNull();
      }
      writePrefs({ sidebarSectionsCollapsed: { spaces: "yes", agents: 1 } });
      expect(useViewStore(createPinia()).sectionsCollapsed).toEqual({ spaces: false, agents: false });
      writePrefs({ sidebarSectionsCollapsed: "agents" });
      expect(useViewStore(createPinia()).sectionsCollapsed).toEqual({ spaces: false, agents: false });
      writePrefs({ sidebarSectionsCollapsed: { agents: true, spaces: "x" } });
      expect(useViewStore(createPinia()).sectionsCollapsed).toEqual({ spaces: false, agents: true });
    });

    it("端末ごとの項目なので、共有の項目として取り出さない", () => {
      expect(isDeviceLocalPref("sidebarSectionRatio")).toBe(true);
      expect(isDeviceLocalPref("sidebarSectionsCollapsed")).toBe(true);
      expect(sharedPrefsOf({ sidebarSectionRatio: 0.3, sidebarSectionsCollapsed: { agents: true }, theme: "x" })).toEqual({ theme: "x" });
    });
  });

  // 読み戻しは `setSidebarWidth` と違い**丸めない**（範囲の外は保存しえない＝壊れた値）。9999 を 360 にしない。
  it("範囲の外の幅は、丸めずに既定で起動する", () => {
    writePrefs({ sidebarWidth: 9999 });
    expect(useViewStore(createPinia()).sidebarWidth).toBe(240);
  });
});

describe("loadSidebarWidth / loadSidebarCollapsed（AC3）", () => {
  it("範囲の中の数はそのまま（端も含む）", () => {
    expect(loadSidebarWidth(160)).toBe(160);
    expect(loadSidebarWidth(240)).toBe(240);
    expect(loadSidebarWidth(360)).toBe(360);
    expect(loadSidebarWidth(201.5)).toBe(201.5);
  });

  // 範囲の外は保存しえない（ドラッグは範囲に収める）＝壊れた値。丸めずに既定へ。
  it("範囲の外は丸めずに既定", () => {
    expect(loadSidebarWidth(159)).toBe(240);
    expect(loadSidebarWidth(361)).toBe(240);
    expect(loadSidebarWidth(-1)).toBe(240);
  });

  it("数でないもの・NaN・無限は既定", () => {
    for (const raw of [undefined, null, "300", Number.NaN, Number.POSITIVE_INFINITY, {}, true]) {
      expect(loadSidebarWidth(raw), String(raw)).toBe(240);
    }
  });

  it("折りたたみは true のときだけ真", () => {
    expect(loadSidebarCollapsed(true)).toBe(true);
    for (const raw of [false, undefined, null, "true", 1, {}]) {
      expect(loadSidebarCollapsed(raw), String(raw)).toBe(false);
    }
  });
});

describe("useViewStore — toast", () => {
  it("toast は追加され、dismissToast で消える", () => {
    const store = useViewStore(pinia);
    const id = store.toast("コピーしました");
    expect(store.toasts).toEqual([{ id, message: "コピーしました" }]);
    store.dismissToast(id);
    expect(store.toasts).toEqual([]);
  });

  it("複数のトーストを保持できる", () => {
    const store = useViewStore(pinia);
    store.toast("1つ目");
    store.toast("2つ目");
    expect(store.toasts.map((t) => t.message)).toEqual(["1つ目", "2つ目"]);
  });

  // 20261005-notify-bell の AC2。右上の積みが 4 秒で消える短い知らせで埋まらない。
  it("短い知らせは同時に 3 件まで。超えたら短い知らせのうち古いものから外れる", () => {
    const store = useViewStore(pinia);
    for (const m of ["1", "2", "3", "4", "5"]) store.toast(m);
    expect(store.toasts.map((t) => t.message)).toEqual(["3", "4", "5"]);
  });

  it("消えない知らせ（sticky）は上限に数えず、短い知らせの追加で外れない。sticky の追加も短い知らせを外さない", () => {
    const store = useViewStore(pinia);
    store.toast("S1", { kind: "sticky" });
    for (const m of ["a", "b", "c", "d"]) store.toast(m);
    store.toast("S2", { kind: "sticky" });
    expect(store.toasts.map((t) => t.message)).toEqual(["S1", "b", "c", "d", "S2"]);
  });
});
