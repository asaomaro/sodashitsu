import { DEVICE_LOCAL_PREF_KEYS, type PopupDimension, type ServerSessionEntry, type SessionFocus, type WorkspaceGroup, type WorktreeEntry, type WorktreeListResult } from "@sodashitsu/protocol";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { loadAgentSort as loadAgentSortValue, loadCollapsedAutoGroups, loadWorkspaceSort, type AgentSort, type Mode, type WorkspaceSort } from "@sodashitsu/client-core";

// 共有の設定の読み込みは client-core（web と端末版が同じ規則で読む。統合の review）。今までの import 先を保つため再び出す。
export { loadCollapsedAutoGroups, loadWorkspaceSort };
import type { ConnectionState } from "@sodashitsu/client-core";
import type { MenuTarget } from "../term/MouseBridge.js";
import type { Zone } from "../term/paneDragZone.js";

const STORAGE_KEY = "soda.view.v1";

/**
 * 表示の記憶のキー（20260927-multi-host-machines）。workspace・tab の id はマシンごとの連番で、マシンをまたぐと衝突する（`w1` が両方にある）ので、
 * ローカル以外のマシンは別のキーに持つ（ローカルは今までのキーのまま）。
 */
let storageKey = STORAGE_KEY;
export function storedViewKeyFor(machineId: string): string {
  return machineId === "local" ? STORAGE_KEY : `${STORAGE_KEY}:${machineId}`;
}

export interface StoredView {
  workspaceId: string;
  tabId: string;
}

function loadStoredView(): StoredView | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "workspaceId" in parsed && "tabId" in parsed) return parsed as StoredView;
    return null;
  } catch {
    return null;
  }
}

function saveStoredView(v: StoredView): void {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(v));
  } catch {
    // 保存できなくても致命的ではない（次回は再度 focus から決める）。
  }
}

/** 並び順の型（`AgentSort`・`WorkspaceSort`）は client-core へ移した（20260927-cli-mode）。今までの参照先を壊さないよう再 export する。 */
export type { AgentSort, WorkspaceSort };

/**
 * 表示位置（`STORAGE_KEY`）と違い、**タブの寿命を越えて残す好み**なので `localStorage` に置く。
 * 同じ流儀の先例：`store/seen.ts`（`soda.seen.v1`）・`components/Toast.vue`（`soda.hint.prefixHelp.v1`）。
 */
export const PREFS_KEY = "soda.prefs.v1";
/** キー一覧の案内（`components/Toast.vue`）を出した印。初回の案内（`store/onboarding.ts`）が既存の利用者の痕跡としても読む。 */
export const PREFIX_HELP_HINT_KEY = "soda.hint.prefixHelp.v1";

/**
 * `soda.prefs.v1` の読み書きは**この 2 つに集約する**（20260920-agent-notifications の AC6）。
 * 以前は `JSON.stringify({ agentSort: v })` で**オブジェクトごと置き換えて**いたので、
 * 項目を足しても**並び順を切り替えた瞬間に消えた**。複数のストアが同じキーを別々に
 * read-modify-write しないよう、所有者をここ 1 つにする。
 */
export function readPrefs(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {}; // プライベートウィンドウ等で読めなくても動く（保存が効かないだけ）
  }
}

/**
 * このブラウザの localStorage の共有の項目をサーバへ移し終えた印（`actions/PrefsSync.ts`。ブラウザごと＝この localStorage ごと）。
 * サーバが先に rev>0 になっていても、印が無ければサーバにまだ無い項目を移す（統合の review の差し戻し）。
 */
export const PREFS_MIGRATED_KEY = "soda.prefsMigrated.v1";

/** 移し終えたか。読めない環境では移し終えた扱い（毎回移そうとしない。`Toast.vue` の `hasShownHint` と同じ倒し方）。 */
export function isPrefsMigrated(): boolean {
  try {
    return localStorage.getItem(PREFS_MIGRATED_KEY) !== null;
  } catch {
    return true;
  }
}

export function markPrefsMigrated(): void {
  try {
    localStorage.setItem(PREFS_MIGRATED_KEY, "1");
  } catch {
    // 書けなければ、次の読み込みでもう一度サーバに無い項目だけを移す（害は無い）。
  }
}

/** 既存の値に**併合して**書く。**読みも書きも同じ try/catch の内側**に置く（読めない環境で throw させない）。 */
export function writePrefs(patch: Record<string, unknown>): void {
  try {
    const current = readPrefs();
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // 保存できなくても致命的ではない（この画面の間だけ効く）。
  }
  // サーバの共有の設定へも送る（20260927-cli-mode の design「設定」。`actions/PrefsSync.ts`）。localStorage に書けない環境でも送る（サーバが正）。
  for (const fn of [...prefsWriteListeners]) fn(patch);
}

/**
 * 設定の書き込みを知らせる先（20260927-cli-mode）。`main.ts` が `PrefsSync` を登録する。**`writePrefs` を通った書き込みだけ**が来る
 * （サーバから受けた値の反映 `replaceSharedPrefs` は来ない——受けた値を送り返さない）。
 */
const prefsWriteListeners = new Set<(patch: Record<string, unknown>) => void>();
export function onPrefsWritten(fn: (patch: Record<string, unknown>) => void): () => void {
  prefsWriteListeners.add(fn);
  return () => prefsWriteListeners.delete(fn);
}

/** 端末ごとに持ち、サーバと共有しない項目か（サイドバーの幅・折りたたみ・区画の比と折りたたみ。design「設定」）。 */
export function isDeviceLocalPref(key: string): boolean {
  return (DEVICE_LOCAL_PREF_KEYS as readonly string[]).includes(key);
}

/** 共有する項目だけを取り出す（端末ごとの項目を除く）。 */
export function sharedPrefsOf(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) if (!isDeviceLocalPref(k)) out[k] = v;
  return out;
}

/**
 * サーバから受けた共有の設定で、localStorage の共有の項目を**丸ごと置き換える**（端末ごとの項目は残す。20260927-cli-mode）。localStorage は次の起動の表示用のキャッシュ。
 * 置き換えた後の全体（端末ごとの項目＋受けた値）を返す——localStorage に書けない環境でも、呼び出し側はこれを各ストアへ当てられる。書き込みの知らせ（`onPrefsWritten`）は出さない。
 */
export function replaceSharedPrefs(shared: Record<string, unknown>): Record<string, unknown> {
  const current = readPrefs();
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(current)) if (isDeviceLocalPref(k)) next[k] = v;
  for (const [k, v] of Object.entries(shared)) if (!isDeviceLocalPref(k)) next[k] = v;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    // 書けなくても、この画面には返した値を当てる。
  }
  return next;
}

// `export` する（20260922-appearance-settings-rest T7。decisions D7）——`loadSidebarWidth`/
// `loadSidebarCollapsed`/`loadWorkspaceSort` と違って本来は自己完結型（`readPrefs()` を自分で
// 呼ぶ）だが、reload_config が `ActionDispatcher` から呼び直せるように公開する。
// `raw` は省略可（省略時はこれまでどおり自分で `readPrefs()` を呼ぶ。store 初期化時の呼び出しは
// 変えない）。T7 の taskcheck 指摘で追加——`reload_config` は他の設定のために既に `readPrefs()` を
// 1回呼んでいるので、ここでも省略無しで自分で呼び直すと `localStorage` への読み出しが実質2回になる。
export function loadAgentSort(raw?: Record<string, unknown>): AgentSort {
  return loadAgentSortValue((raw ?? readPrefs())["agentSort"]); // 壊れた値は既定へ落とす（client-core）
}

function saveAgentSort(v: AgentSort): void {
  writePrefs({ agentSort: v });
}

/**
 * サイドバーの幅（px）。**設定の項目ではなく、ドラッグした結果を覚えるだけ**（20260921-herdr-settings-gaps の D1。
 * herdr も端末ごとの preferences に保存し、設定画面の項目にはしていない）。
 */
export const SIDEBAR_WIDTH = { default: 240, min: 160, max: 360 } as const;

/**
 * 保存された幅を読む。**範囲の外は丸めずに既定へ落とす**——ドラッグは範囲に収めるので、範囲の外の値は
 * 保存しえない＝壊れた値（20260921-herdr-settings-gaps の AC3）。
 */
export function loadSidebarWidth(raw: unknown): number {
  const ok = typeof raw === "number" && Number.isFinite(raw) && raw >= SIDEBAR_WIDTH.min && raw <= SIDEBAR_WIDTH.max;
  return ok ? raw : SIDEBAR_WIDTH.default;
}

/**
 * 保存された、spaces の取り分（0〜1。agents との高さの比。20261004-ui-interaction-polish）を読む。**0 より大きく 1 より小さい有限の数だけ**を採り、
 * それ以外は「無い」（null＝自動の配分）。
 */
export function loadSidebarSectionRatio(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 && raw < 1 ? raw : null;
}

/** サイドバーの 2 区画のうち、畳んでいるもの（保存は畳んでいる区画だけを持つ）。 */
export type SectionsCollapsed = { spaces: boolean; agents: boolean };

/** 保存された区画の折りたたみを読む。**値が `true` のキーだけ**を採る（壊れた値は開いた状態＝既定）。 */
export function loadSidebarSectionsCollapsed(raw: unknown): SectionsCollapsed {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return { spaces: o["spaces"] === true, agents: o["agents"] === true };
}

/** 保存された折りたたみを読む。`true` のときだけ畳む（壊れた値は展開＝既定。20260921-herdr-settings-gaps の AC3）。 */
export function loadSidebarCollapsed(raw: unknown): boolean {
  return raw === true;
}


function saveWorkspaceSort(v: WorkspaceSort): void {
  writePrefs({ workspaceSort: v });
}


function saveCollapsedAutoGroups(v: ReadonlySet<string>): void {
  writePrefs({ collapsedAutoGroups: [...v] });
}

/** 「グループなし」を畳んでいるか（共有の設定 `ungroupedCollapsed`。追補 01 B）。`true` のときだけ畳む（壊れた値は展開）。 */
export function loadUngroupedCollapsed(raw: unknown): boolean {
  return raw === true;
}

function saveUngroupedCollapsed(v: boolean): void {
  writePrefs({ ungroupedCollapsed: v });
}

let nextToastId = 1;

/** トーストの行動ボタン（`sticky` のときだけ置く。20260920-agent-notifications）。 */
export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  message: string;
  /**
   * 既定（`undefined`）は今までどおり 4 秒で自動的に消える。
   * **`"sticky"` は消えない**——席を外している間に出た知らせが消えていては意味が無い
   * （20260920-agent-notifications の requirements）。消すのは利用者の操作か、
   * `prefix+o` で対象へ移ったとき。
   */
  kind?: "sticky";
  /** `sticky` に添えるボタン。トースト本体のクリックは今までどおり「消す」なので、ボタン側で `@click.stop` する。 */
  actions?: ToastAction[];
  /** `true` なら 1 行に畳まない（案内だけの例外。狭い画面で本文が読めなくなるため）。 */
  wrap?: boolean;
}

export interface ToastOptions {
  kind?: "sticky";
  actions?: ToastAction[];
  wrap?: boolean;
}

/**
 * 開いているダイアログの種類ごとの文脈（T17・T18・T23〜T25 が使う）。`openDialog` は
 * `KeyRouter`/`KeyInputController` へ渡すモード名（"dialog"）との対応用の軽い印。
 */
export type DialogContext =
  | { kind: "newTab"; workspaceId: string }
  | { kind: "renamePane"; paneId: string; currentLabel: string }
  | { kind: "renameTab"; tabId: string; currentLabel: string }
  // `currentAutoLabel` は開いた時点で名前が自動だったか（20260921-workspace-auto-label。変えずに確定したら送らない判定に使う）。
  | { kind: "renameWorkspace"; workspaceId: string; currentLabel: string; currentAutoLabel: boolean }
  | { kind: "confirmClose"; targets: { type: "pane" | "tab" | "workspace"; id: string }[] }
  /**
   * D&D での分割解除（`pane.replace`）の対象（`targetPaneId`）が busy なとき（20260924-pane-dnd-split-move。
   * `confirmClose` と同じ D23 の安全策——review 指摘 must）。`paneId` はドラッグした側（生き残る）。
   */
  | { kind: "confirmReplacePane"; paneId: string; targetPaneId: string }
  | { kind: "help" }
  | { kind: "goto" }
  // worktree（20260920-git-worktree-actions）。**サーバへ聞いてから開く**ので、開く時点で中身が揃っている。
  | { kind: "worktreeCreate"; workspaceId: string; info: WorktreeListResult }
  | { kind: "worktreeOpen"; workspaceId: string; entries: WorktreeEntry[] }
  /**
   * worktree の削除の確認（20260924-worktree-remove）。`confirmClose`/`confirmReplacePane` と
   * 同じ D23 の安全策——`ConfirmDialog.vue` が扱う。`sourceWorkspaceId` は一覧を開いた元の
   * workspace（repo root 解決用。`worktree.remove` の `workspaceId` と同じ意味）。
   * `openWorkspaceId` は削除対象の path が現在開いている workspace と一致する場合、その id
   * （確認文言の出し分け用。閉じる処理自体はサーバ側が自動で行う）。
   */
  | {
      kind: "confirmWorktreeRemove";
      sourceWorkspaceId: string;
      path: string;
      openWorkspaceId: string | null;
      /** 取り消したら一覧へ戻らずに閉じる（一覧を経ずにキーの `remove_worktree` から開いたとき。20260927-cli-mode）。 */
      closeOnCancel?: true;
    }
  /**
   * dirty／ロック済みで通常の削除が失敗したあとの `--force` 確認（同上。design「振る舞いの詳細」）。
   * `reason` で確認文言を出し分ける（20260925-worktree-remove-locked）。
   */
  | {
      kind: "confirmWorktreeRemoveForce";
      sourceWorkspaceId: string;
      path: string;
      openWorkspaceId: string | null;
      reason: "dirty" | "locked";
      /** `confirmWorktreeRemove` から引き継ぐ（キーの `remove_worktree` から始めた削除は、取り消し・失敗でも一覧へ戻らない）。 */
      closeOnCancel?: true;
    }
  // 手動グループ（20260923-workspace-grouping。herdr に前例が無い独自拡張）。
  // 新しいグループを作り、右クリック元の workspace をそのまま追加する（`NameDialog` を再利用）。
  | { kind: "createGroup"; workspaceId: string }
  | { kind: "renameGroup"; groupId: string; currentLabel: string }
  // `worktreeOpen` と同じ「一覧から選ぶ」形。`groups` は開く時点のグループ一覧（GroupPickerDialog）。
  // `moving` は「別のグループへ移す…」（今のグループがあるとき。`groups` は今のグループを除く）。
  | { kind: "addToGroup"; workspaceId: string; groups: WorkspaceGroup[]; moving?: true }
  // サーバを止める確認（`stop_server`。20260927-cli-mode）。押し間違えると全ての pane が止まる。
  /**
   * `target` は止まるサーバの名前（ローカルならホスト名、保存したマシンを選んでいればそのマシンの名前）、`remote` は保存したマシンか（02 の review。
   * 画面の接続が `/ws?machine=` を向いていれば、止まるのはそのマシンの `soda serve`——確認でどれが止まるかを言う）。
   */
  | { kind: "confirmStopServer"; target: string; remote: boolean }
  // 設定（通知・表示・端末。20260921-herdr-settings-gaps）。値はそれぞれのストアが持つので文脈は空。
  | { kind: "settings" }
  // はじめの案内（20260926-settings-onboarding）。選択は下書きでダイアログが持つので文脈は空。
  | { kind: "onboarding" }
  // session の一覧（20260926-named-session-ui）。**サーバへ聞いてから開く**（`worktreeOpen` と同じ）。
  | { kind: "sessionSwitch"; sessions: ServerSessionEntry[] }
  // 独自コマンドの popup（20260927-custom-command-keys）。開く時点の名前と大きさの指定。`paneId` は走らせる基準の pane（フォーカス中）。
  | { kind: "commandPopup"; commandId: string; paneId: string; title: string; width?: PopupDimension; height?: PopupDimension }
  // エージェントが動かしているサブエージェントの一覧（20261004-subagent-display）。対象は `{machineId, paneId}`（pane の ID はマシンをまたいで衝突する。手元は `local`）。
  // 中身は開いている間も画面のストアから引く（`store/subagents.ts`）ので、文脈に持たない。
  // `opener: "button"` は、サイドバーの件数のボタンから開いたとき。閉じたときのフォーカスを、そのボタン（無ければ行）へ戻す。無ければ（`show_subagents`）端末へ。
  | { kind: "subagents"; machineId: string; paneId: string; opener?: "button" };

/**
 * このクライアントの表示・モード・接続状態（architecture.md「store/view」）。
 * workspace/tab/pane の**構造**は `store/session` の担当——ここは「このブラウザが今どこを見ているか」だけ。
 */
export const useViewStore = defineStore("view", () => {
  const workspaceId = ref<string | null>(null);
  const tabId = ref<string | null>(null);
  const focusedPaneId = ref<string | null>(null);
  /**
   * `last_pane`（20260923-missing-keybinding-actions）用の1スロットのトグル（herdr の
   * `previous_pane_id` と同じ構造。research F2）。`focusPane` の中でだけ更新する（design「振る舞いの詳細」）。
   */
  const lastFocusedPaneId = ref<string | null>(null);

  const mode = ref<Mode>("terminal");
  const openDialog = ref<string | null>(null);
  const dialogContext = ref<DialogContext | null>(null);
  /** ダイアログを開く前にフォーカスしていた pane（AC-I4「閉じたら開く前の pane に戻す」）。 */
  const preDialogFocusPaneId = ref<string | null>(null);
  /**
   * 連携のグラフ画面（20260927-agent-graph の design D-6・research F7.2）。**ダイアログの 1 枠（`openDialog`）とは別の状態**——グラフ画面の中から
   * 確認のダイアログを開いても、グラフ画面の文脈が消えない。マシンの切り替えでは閉じない（グラフは手元のサーバのもの）。
   */
  const graphOpen = ref(false);
  /** グラフ画面を開く前にフォーカスしていた pane（閉じたら戻す。AC-I4）。 */
  const preGraphFocusPaneId = ref<string | null>(null);
  /**
   * 質問のフォーム（`sodactl ask`。20261002-sodactl-ask）が出ている。**ダイアログの 1 枠（`openDialog`）とは別の状態**——サーバから届く質問は、開いている設定・確認を潰さずに
   * 重ねて出す。書くのは `AskDialog.vue` だけ（開閉に合わせる）。
   */
  const askOpen = ref(false);
  /** 質問のフォームを開く前にフォーカスしていた pane（開いている間に閉じられたら `StoreAdapter.applyViewRepair` が差し替える。`preDialogFocusPaneId` と同じ理由）。 */
  const preAskFocusPaneId = ref<string | null>(null);
  function setAskOpen(open: boolean): void {
    if (open === askOpen.value) return;
    askOpen.value = open;
    if (open) {
      preAskFocusPaneId.value = focusedPaneId.value;
      return;
    }
    // 開いている間に焦点の pane が閉じられて差し替わっていたら、閉じたときに反映する（焦点を直接動かすと端末がフォーカスを奪うので、開いている間は戻し先だけ持つ）。
    if (preAskFocusPaneId.value !== null && preAskFocusPaneId.value !== focusedPaneId.value) focusedPaneId.value = preAskFocusPaneId.value;
    preAskFocusPaneId.value = null;
  }
  /** 質問のフォームを開いている間の焦点の移し直し（`retargetPreDialogFocus` と同じ理由）。 */
  function retargetPreAskFocus(paneId: string | null): void {
    preAskFocusPaneId.value = paneId;
  }
  /**
   * ダイアログ・グラフ画面・質問のフォームのどれかが開いている（キーを端末へ送らない dialog モード・window の keydown の抑止・ドラッグの取り消しの判定。research-web §1.5）。
   */
  const modalOpen = computed(() => openDialog.value !== null || graphOpen.value || askOpen.value);
  /** navigate モード中に選択中の行（workspace の id、グループの見出しなら `group:<id>`。`↑/↓` で動かす。Enter で確定）。 */
  const navigateSelection = ref<string | null>(null);
  /**
   * navigate モード中に「選択中の workspace のメニューを開いてほしい」という一度きりの要求
   * （20260925-sidebar-keyboard-menu。design「設計方針」）。`ActionDispatcher`（DOM 非依存）が
   * 立て、`Sidebar.vue`（行の DOM を実際に持つ場所）が消費して `getBoundingClientRect()` から
   * 実際にメニューを開く。
   */
  const navigateMenuRequested = ref(false);
  const contextMenu = ref<{ target: MenuTarget; at: { x: number; y: number } } | null>(null);
  /**
   * pane 名ラベルをドラッグして入れ替える操作の一時状態（20260923-pane-name-dnd-swap。design「1.」）。
   * 複数の `PaneFrame` インスタンスをまたいで共有する必要があるためここに置く（`contextMenu` と同じ流儀）。
   */
  /**
   * `overZone`（20260924-pane-dnd-split-move。design「クライアント状態」）: ホバー中の pane 内の
   * どこ（縁/中央）に反応しているか。`overPaneId` が null のときは無意味なので併せて null にする。
   *
   * `overTabId`/`overWorkspaceId`（20260924-pane-move-cross-tab。design「クライアント側:
   * ドロップ先の拡張」）: ドロップ先が tab バーの tab・サイドバーの workspace 行のとき。
   * `overPaneId`・`overTabId`・`overWorkspaceId` は**同時に高々1つだけ非 null**
   * （ドロップ候補は常にどれか1種類——`setPaneDragOver`/`setPaneDragOverTab`/
   * `setPaneDragOverWorkspace` がそれぞれ他の2つを null にリセットする）。
   */
  const paneDrag = ref<{
    sourcePaneId: string;
    overPaneId: string | null;
    overZone: Zone | null;
    overTabId: string | null;
    overWorkspaceId: string | null;
  } | null>(null);
  /**
   * workspace 行・グループのヘッダー行の D&D の一時状態（20260923-workspace-grouping。`paneDrag` と
   * 同じ流儀）。`sourceIds` は動かす対象——通常の行なら `[workspace.id]`、グループのヘッダー行なら
   * そのグループの全メンバー id（design「振る舞いの詳細（D&D）」）。`overRowKey` は今ホバー中の行の
   * `SpaceRow.key`（**workspace id ではない**——タスク点検の指摘：手動グループのヘッダー行と、その
   * 先頭メンバー行は同じ `dropAnchorId`〔drop 先として使う workspace id〕を持ちうるので、ホバー中の
   * 行を一意に特定するには行固有の `key` を使う必要がある）。
   */
  const workspaceDrag = ref<{ sourceIds: string[]; overRowKey: string | null; overInvalid: boolean } | null>(null);
  const connectionState = ref<ConnectionState>("connecting");
  const authRequired = ref(false);
  /**
   * `onAuthRequired` が呼ばれた回数（D105）。`authRequired` が既に true のまま呼ばれても（ログインの直後の `/api/session`
   * が 401・`/ws` が 4401 等）変わるので、ログイン画面が「ログインできた、接続中…」の待ちから戻る合図にする。
   * `authRequired` の意味（`open` になるまで下ろさない）は変えない。
   */
  const authRequiredCount = ref(0);
  /**
   * 繋ぎ直しで、`/api/session` は通るのに WebSocket だけが開く前に閉じる試みが続いている（D107。`StorePort.onOriginRejectSuspected`）。
   * `ReconnectOverlay` が「再接続中…」に、サーバがこのページの Origin を拒否しているかもしれないという手がかりを添える。
   */
  const originRejectSuspected = ref(false);
  const initialPrefs = readPrefs();
  /**
   * 畳んだかどうか。**切り替えるたびに保存する**（20260921-herdr-settings-gaps の AC2。`prefix+b` と畳むボタンは
   * 同じ `toggleSidebar` を通る）。
   */
  const sidebarCollapsed = ref(loadSidebarCollapsed(initialPrefs["sidebarCollapsed"]));
  /**
   * サイドバーの幅。**ドラッグ中は `setSidebarWidth` で反映するだけ**で、保存はドラッグを終えたとき
   * （`commitSidebarWidth`）に 1 回——`pointermove` ごとに `localStorage` へ書くと、毎フレーム同期の I/O が走る。
   */
  const sidebarWidth = ref(loadSidebarWidth(initialPrefs["sidebarWidth"]));
  /**
   * spaces と agents の高さの比（spaces の取り分。null＝自動の配分）。**ドラッグ中は `setSectionRatio` で反映するだけ**で、
   * 保存は終えたとき（`commitSectionRatio`）に 1 回（幅と同じ）。この機器だけの保存（20261004-ui-interaction-polish）。
   */
  const sidebarSectionRatio = ref<number | null>(loadSidebarSectionRatio(initialPrefs["sidebarSectionRatio"]));
  /** 畳んでいる区画。**切り替えるたびに保存する**（この機器だけ）。 */
  const sectionsCollapsed = ref<SectionsCollapsed>(loadSidebarSectionsCollapsed(initialPrefs["sidebarSectionsCollapsed"]));
  const agentSort = ref(loadAgentSort());
  const workspaceSort = ref(loadWorkspaceSort(initialPrefs["workspaceSort"]));
  const collapsedAutoGroups = ref(loadCollapsedAutoGroups(initialPrefs["collapsedAutoGroups"]));
  /** 「グループなし」の見出しを畳んでいるか（共有。本物のグループが無いときは見出し自体が出ないので効かない）。 */
  const ungroupedCollapsed = ref(loadUngroupedCollapsed(initialPrefs["ungroupedCollapsed"]));
  const toasts = ref<Toast[]>([]);

  /**
   * `client.hello` 直後の表示（design「フォーカスと表示」）。前回の tab がまだあればそれ、無ければサーバの
   * focus。`findTabFocusedPaneId` は「その tab がまだ存在するか」と「その tab の（サーバ全体で最後に
   * フォーカスされた）pane」を同時に返す——前回の tab を復元したときも、その tab の pane へ
   * フォーカスを合わせる必要があるため（AC-I3。ページの再読み込み（F5）のたびに一度クリックし直さないと
   * キーボード操作を再開できない、という不具合を review で発見。修正）。
   */
  function restoreView(findTabFocusedPaneId: (workspaceId: string, tabId: string) => string | null, serverFocus: SessionFocus | null): void {
    const stored = loadStoredView();
    if (stored) {
      const paneId = findTabFocusedPaneId(stored.workspaceId, stored.tabId);
      if (paneId !== null) {
        setView(stored.workspaceId, stored.tabId);
        focusedPaneId.value = paneId;
        return;
      }
    }
    if (serverFocus) {
      setView(serverFocus.workspaceId, serverFocus.tabId);
      focusedPaneId.value = serverFocus.paneId;
    }
  }

  /** 表示の記憶をどのマシンのものにするか（20260927-multi-host-machines。切り替えの手順 3）。 */
  function setMachineScope(machineId: string): void {
    storageKey = storedViewKeyFor(machineId);
  }

  /** 今のスコープの記憶だけを書く（切り替え先で表示する workspace。画面の表示は変えない）。 */
  function rememberView(newWorkspaceId: string, newTabId: string): void {
    saveStoredView({ workspaceId: newWorkspaceId, tabId: newTabId });
  }

  /** 今のスコープの記憶を消す（見出しからの切り替えは、そのマシンの今の focus を表示する。AC9）。 */
  function forgetStoredView(): void {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // 消せなくても致命的ではない
    }
  }

  /**
   * マシンの切り替えの前に、前のマシンの表示・焦点・開いているダイアログ・メニュー・ドラッグ・navigate の選択を捨てる（id がマシンをまたいで衝突するため）。
   * 表示は次の snapshot の `restoreView` が決める。
   */
  function resetForMachineSwitch(): void {
    dialogContext.value = null;
    openDialog.value = null;
    preDialogFocusPaneId.value = null;
    // グラフ画面は閉じない（手元のもの）。戻す先の pane の id だけは前のマシンのものなので捨てる。
    preGraphFocusPaneId.value = null;
    contextMenu.value = null;
    paneDrag.value = null;
    workspaceDrag.value = null;
    navigateSelection.value = null;
    navigateMenuRequested.value = false;
    workspaceId.value = null;
    tabId.value = null;
    focusedPaneId.value = null;
    lastFocusedPaneId.value = null;
  }

  function setView(newWorkspaceId: string, newTabId: string): void {
    workspaceId.value = newWorkspaceId;
    tabId.value = newTabId;
    saveStoredView({ workspaceId: newWorkspaceId, tabId: newTabId });
  }

  function focusPane(paneId: string | null): void {
    // `paneId === null`（pane が無くなった）のときは更新しない——「直前」の意味が無くなる遷移なので、
    // 次に `focusPane(x)` が呼ばれるまで直前の値を保持する（herdr の「1スロットトグル」に近い。design）。
    if (paneId !== null && focusedPaneId.value !== null && focusedPaneId.value !== paneId) {
      lastFocusedPaneId.value = focusedPaneId.value;
    }
    focusedPaneId.value = paneId;
  }

  function onModeChange(m: Mode): void {
    mode.value = m;
  }

  function setOpenDialog(name: string | null): void {
    openDialog.value = name;
  }

  /** ダイアログを開く（現在の focus を覚えておく。T18/T23〜T25 が使う）。 */
  function openDialogWithContext(ctx: DialogContext): void {
    preDialogFocusPaneId.value = focusedPaneId.value;
    dialogContext.value = ctx;
    openDialog.value = ctx.kind;
  }

  /**
   * ダイアログを開いている間の焦点の移し直し（D97）。開いている間に「開く前の pane」が閉じられたら、閉じたときに
   * 戻す先だけを差し替える——`focusedPaneId` を直接変えると、その pane の `TerminalPane` が `term.focus()` して
   * ダイアログの入力欄からフォーカスを奪ってしまう。
   */
  function retargetPreDialogFocus(paneId: string | null): void {
    preDialogFocusPaneId.value = paneId;
  }

  /** ダイアログを閉じる（確定・取り消しのどちらでも呼ぶ）。開く前の pane へフォーカスを戻す（AC-I4）。 */
  function closeDialog(): void {
    dialogContext.value = null;
    openDialog.value = null;
    if (preDialogFocusPaneId.value) focusedPaneId.value = preDialogFocusPaneId.value;
    preDialogFocusPaneId.value = null;
  }

  /** グラフ画面を開く（開く前の焦点を覚える。既に開いていれば何もしない）。 */
  function openGraph(): void {
    if (graphOpen.value) return;
    preGraphFocusPaneId.value = focusedPaneId.value;
    graphOpen.value = true;
  }

  /** グラフ画面を閉じる。開く前の pane へ焦点を戻す（AC-I4）。 */
  function closeGraph(): void {
    if (!graphOpen.value) return;
    graphOpen.value = false;
    if (preGraphFocusPaneId.value) focusedPaneId.value = preGraphFocusPaneId.value;
    preGraphFocusPaneId.value = null;
  }

  /** グラフ画面を開いている間の焦点の移し直し（`retargetPreDialogFocus` と同じ理由。焦点を直接変えると端末がグラフ画面からフォーカスを奪う）。 */
  function retargetPreGraphFocus(paneId: string | null): void {
    preGraphFocusPaneId.value = paneId;
  }

  function setNavigateSelection(workspaceId2: string | null): void {
    navigateSelection.value = workspaceId2;
  }

  function requestNavigateMenu(): void {
    navigateMenuRequested.value = true;
  }

  function clearNavigateMenuRequest(): void {
    navigateMenuRequested.value = false;
  }

  function openContextMenu(target: MenuTarget, at: { x: number; y: number }): void {
    contextMenu.value = { target, at };
  }

  function closeContextMenu(): void {
    contextMenu.value = null;
  }

  /** ドラッグ開始（20260923-pane-name-dnd-swap。閾値を超えて初めて呼ぶ。design「5.」）。 */
  function startPaneDrag(paneId: string): void {
    paneDrag.value = { sourcePaneId: paneId, overPaneId: null, overZone: null, overTabId: null, overWorkspaceId: null };
  }

  /**
   * ポインタ直下の pane・ゾーンが変わるたびに呼ぶ（20260924-pane-dnd-split-move で `zone` 引数を
   * 追加。呼び出し元は `PaneFrame.vue` の1箇所のみなので破壊的な拡張で問題ない。design D14 相当）。
   * `overTabId`/`overWorkspaceId` も併せて null にする（ドロップ候補は同時に1種類だけ。
   * 20260924-pane-move-cross-tab）。無駄な再描画を避けるため全て同値なら何もしない。
   */
  function setPaneDragOver(paneId: string | null, zone: Zone | null = null): void {
    if (!paneDrag.value) return;
    const d = paneDrag.value;
    if (d.overPaneId === paneId && d.overZone === zone && d.overTabId === null && d.overWorkspaceId === null) return;
    paneDrag.value = { ...d, overPaneId: paneId, overZone: paneId ? zone : null, overTabId: null, overWorkspaceId: null };
  }

  /** ポインタ直下が tab バーの tab になったときに呼ぶ（20260924-pane-move-cross-tab。
   *  `setPaneDragOver` と同じ形——他の2種類を null にリセットする）。 */
  function setPaneDragOverTab(tabId: string | null): void {
    if (!paneDrag.value) return;
    const d = paneDrag.value;
    if (d.overTabId === tabId && d.overPaneId === null && d.overWorkspaceId === null) return;
    paneDrag.value = { ...d, overPaneId: null, overZone: null, overTabId: tabId, overWorkspaceId: null };
  }

  /** ポインタ直下がサイドバーの workspace 行になったときに呼ぶ（20260924-pane-move-cross-tab）。 */
  function setPaneDragOverWorkspace(workspaceId: string | null): void {
    if (!paneDrag.value) return;
    const d = paneDrag.value;
    if (d.overWorkspaceId === workspaceId && d.overPaneId === null && d.overTabId === null) return;
    paneDrag.value = { ...d, overPaneId: null, overZone: null, overTabId: null, overWorkspaceId: workspaceId };
  }

  function endPaneDrag(): void {
    paneDrag.value = null;
  }

  /** workspace の D&D 開始（20260923-workspace-grouping。`startPaneDrag` と同じ形。閾値を超えて初めて呼ぶ）。
   *  `sourceIds` は通常の行なら1件、グループのヘッダー行ならそのグループの全メンバー id（AC9）。 */
  function startWorkspaceDrag(sourceIds: string[]): void {
    workspaceDrag.value = { sourceIds, overRowKey: null, overInvalid: false };
  }

  /** `rowKey` は `SpaceRow.key`（`Sidebar.vue`）——workspace id そのものではない。上の注記参照。
   *  `invalid` は「その行の上には落とせない」印（別の入れ物の上・名前順の一番上。20261004-group-worktree-items）。 */
  function setWorkspaceDragOver(rowKey: string | null, invalid = false): void {
    if (!workspaceDrag.value || (workspaceDrag.value.overRowKey === rowKey && workspaceDrag.value.overInvalid === invalid)) return;
    workspaceDrag.value = { ...workspaceDrag.value, overRowKey: rowKey, overInvalid: invalid };
  }

  function endWorkspaceDrag(): void {
    workspaceDrag.value = null;
  }

  /** worktree 自動グループの折りたたみを切り替える（`repoKey` がキー。`toggleSidebar` と同じ
   *  「切り替えるたびに保存する」流儀。20260923-workspace-grouping）。 */
  function toggleAutoGroupCollapsed(repoKey: string): void {
    const next = new Set(collapsedAutoGroups.value);
    if (next.has(repoKey)) next.delete(repoKey);
    else next.add(repoKey);
    collapsedAutoGroups.value = next;
    saveCollapsedAutoGroups(next);
  }

  /** 「グループなし」の折りたたみを切り替える（`toggleAutoGroupCollapsed` と同じく切り替えるたびに保存する）。 */
  function toggleUngroupedCollapsed(): void {
    ungroupedCollapsed.value = !ungroupedCollapsed.value;
    saveUngroupedCollapsed(ungroupedCollapsed.value);
  }

  function onConnectionState(s: ConnectionState): void {
    connectionState.value = s;
    // `rejected`（`/api/session` が 403 で `/ws` も開く前に閉じた）も下ろす：サーバは Cookie を先に確かめ、無効なら Host を問わず
    // 401 を返すので、403 は Cookie が有効な証拠（サーバの D106）。ログイン画面の「接続中…」のまま止めず、本体の重ね表示で理由を示す（D107）。
    if (s === "open" || s === "rejected") authRequired.value = false;
  }

  function setOriginRejectSuspected(suspected: boolean): void {
    originRejectSuspected.value = suspected;
  }

  function onAuthRequired(): void {
    authRequired.value = true;
    authRequiredCount.value++;
  }

  /** agents の並び順を 2 値で行き来する（herdr と同じく順序名そのものがボタン）。切り替えるたびに保存する。 */
  function toggleAgentSort(): void {
    agentSort.value = agentSort.value === "grouped" ? "priority" : "grouped";
    saveAgentSort(agentSort.value);
  }

  /** workspace（spaces 区画）の並び順を 2 値で行き来する（`toggleAgentSort` と同じ形。AC3）。 */
  function toggleWorkspaceSort(): void {
    workspaceSort.value = workspaceSort.value === "opened" ? "name" : "opened";
    saveWorkspaceSort(workspaceSort.value);
  }

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value;
    writePrefs({ sidebarCollapsed: sidebarCollapsed.value });
  }

  /** 幅を範囲に収めて反映する。**保存はしない**（ドラッグの途中。保存は `commitSidebarWidth`）。 */
  function setSidebarWidth(px: number): void {
    sidebarWidth.value = Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, px));
  }

  /** いまの幅を保存する（ドラッグを終えたとき・既定に戻したとき。20260921-herdr-settings-gaps の AC1）。 */
  function commitSidebarWidth(): void {
    writePrefs({ sidebarWidth: sidebarWidth.value });
  }

  /** 比を反映する。**保存はしない**（ドラッグの途中。保存は `commitSectionRatio`）。範囲に収めるのは呼び元（`sectionSizing`）。 */
  function setSectionRatio(r: number | null): void {
    sidebarSectionRatio.value = r;
  }

  /** いまの比を保存する（ドラッグを終えたとき・キーで動かしたとき）。比が無い（自動）ときは保存の項目を消す。 */
  function commitSectionRatio(): void {
    writePrefs({ sidebarSectionRatio: sidebarSectionRatio.value ?? undefined });
  }

  /** 自動の配分に戻す。保存からも項目を消す。 */
  function resetSectionRatio(): void {
    sidebarSectionRatio.value = null;
    writePrefs({ sidebarSectionRatio: undefined });
  }

  /** 区画を畳む／開く。保存は畳んでいる区画だけ（どちらも開いていれば項目を消す）。 */
  function toggleSectionCollapsed(which: keyof SectionsCollapsed): void {
    sectionsCollapsed.value = { ...sectionsCollapsed.value, [which]: !sectionsCollapsed.value[which] };
    const saved: Record<string, true> = {};
    for (const k of ["spaces", "agents"] as const) if (sectionsCollapsed.value[k]) saved[k] = true;
    writePrefs({ sidebarSectionsCollapsed: Object.keys(saved).length > 0 ? saved : undefined });
  }

  /** `opts` を省けば今までどおり（4 秒で消える 1 行）。`kind: "sticky"` は消えない（20260920-agent-notifications）。 */
  function toast(message: string, opts?: ToastOptions): number {
    const id = nextToastId++;
    toasts.value = [...toasts.value, { id, message, ...opts }];
    return id;
  }

  function dismissToast(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  const isPrefixWaiting = computed(() => mode.value === "prefix");

  return {
    workspaceId,
    tabId,
    focusedPaneId,
    lastFocusedPaneId,
    preDialogFocusPaneId,
    mode,
    openDialog,
    dialogContext,
    graphOpen,
    preGraphFocusPaneId,
    modalOpen,
    askOpen,
    preAskFocusPaneId,
    setAskOpen,
    retargetPreAskFocus,
    navigateSelection,
    navigateMenuRequested,
    contextMenu,
    paneDrag,
    workspaceDrag,
    collapsedAutoGroups,
    ungroupedCollapsed,
    connectionState,
    authRequired,
    authRequiredCount,
    originRejectSuspected,
    sidebarCollapsed,
    sidebarWidth,
    sidebarSectionRatio,
    sectionsCollapsed,
    agentSort,
    toggleAgentSort,
    workspaceSort,
    toggleWorkspaceSort,
    toasts,
    isPrefixWaiting,
    restoreView,
    setMachineScope,
    rememberView,
    forgetStoredView,
    resetForMachineSwitch,
    setView,
    focusPane,
    onModeChange,
    setOpenDialog,
    openDialogWithContext,
    closeDialog,
    retargetPreDialogFocus,
    openGraph,
    closeGraph,
    retargetPreGraphFocus,
    setNavigateSelection,
    requestNavigateMenu,
    clearNavigateMenuRequest,
    openContextMenu,
    closeContextMenu,
    startPaneDrag,
    setPaneDragOver,
    setPaneDragOverTab,
    setPaneDragOverWorkspace,
    endPaneDrag,
    startWorkspaceDrag,
    setWorkspaceDragOver,
    endWorkspaceDrag,
    toggleAutoGroupCollapsed,
    toggleUngroupedCollapsed,
    onConnectionState,
    onAuthRequired,
    setOriginRejectSuspected,
    toggleSidebar,
    setSidebarWidth,
    commitSidebarWidth,
    setSectionRatio,
    commitSectionRatio,
    resetSectionRatio,
    toggleSectionCollapsed,
    toast,
    dismissToast,
  };
});
