import type { NewCwd, ThemeName } from "@wtm/protocol";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { commandKeyDefs, type KeyTargetId } from "../keys/commandKeys.js";
import { useCommandsStore } from "./commands.js";
import {
  emptyKeyPrefs,
  loadKeyPrefs,
  serializeKeyPrefs,
  withBindings,
  withNavigateBinding,
  withoutBindings,
  withoutNavigateBinding,
  withPrefix,
  type KeyPrefs,
} from "../keys/keyPrefs.js";
import { resolveKeymap, type ResolvedKeymap } from "../keys/keymap.js";
import type { NavigateKeyId } from "../keys/navigateKeys.js";
import { resolveNavigateKeymap, type ResolvedNavigateKeymap } from "../keys/navigateKeymap.js";
import { loadThemePrefs, resolveTheme } from "../theme/themes.js";
import {
  emptyThemeOverrides,
  loadThemeOverrides,
  serializeThemeOverrides,
  withOverride,
  withoutOverride,
  type ThemeOverrideBucket,
  type ThemeOverrides,
} from "../theme/themeOverrides.js";
import type { CssVar } from "../theme/uiTokens.js";
import { PANE_BORDERS, type PaneBorders } from "../layout/paneChrome.js";
import { loadScrollbackPref, type ScrollbackPref } from "../term/scrollback.js";
import {
  loadTabBarPosition,
  loadTabBarRightEntries,
  loadTabBarRightSeparator,
  MAX_TAB_BAR_RIGHT_ENTRIES,
  type TabBarPosition,
  type TabBarRightEntry,
} from "../tabbar/tabBarRight.js";
import {
  effectiveLayout,
  loadSidebarRows,
  serializeSidebarRows,
  type RowLayout,
  type SidebarArea,
  type SidebarRowsPrefs,
} from "../sidebar/rowLayout.js";
import { readPrefs, writePrefs } from "./view.js";

/**
 * 設定ダイアログの「表示」と「端末」の節の値（20260921-herdr-settings-gaps）。
 * 通知の節の値は `store/notifications.ts`、サイドバーの幅と折りたたみは `store/view.ts`（設定の項目ではなく
 * 操作した結果を覚えるだけ。D1）。**どれも `wtm.prefs.v1` の読み書きは `readPrefs`/`writePrefs` に任せる**
 * （所有者を 1 つにする。`view.ts` の注記）。
 */

/**
 * 保存された記号表示を読む。**boolean でなければ既定の「入」**（AC3・AC7）。
 *
 * **既定が herdr と逆**（herdr の `ui.status_indicators` の既定は `dots`＝色だけ）。WCAG 1.4.1 は色を唯一の手段に
 * することを禁じており、既定で違反した状態を出さない（decisions D1）。
 */
export function loadStatusSymbols(raw: unknown): boolean {
  return typeof raw === "boolean" ? raw : true;
}

/**
 * 全画面のときブラウザ予約キーも Keyboard Lock で受け取るか（20260922-keybinding-usability。
 * design「US4」）。**既定は無効**——実験的 API・Chromium 系限定のため（AC11）。
 */
export function loadKeyboardLockInFullscreen(raw: unknown): boolean {
  return typeof raw === "boolean" ? raw : false;
}

/**
 * pane の枠・隙間の太さ（20260922-appearance-settings-rest）。既定は今までと同じ見た目
 * （`"default"`＝4px 相当）。値そのもの（px 数）は `PaneFrame.vue`/`Splitter.vue` が読む
 * CSS 変数 `--wtm-pane-gap` へ配る側（`App.vue`）が持つ。
 */
export type PaneFrameThickness = "thin" | "default" | "thick";
export const PANE_FRAME_THICKNESS_PX: Record<PaneFrameThickness, number> = {
  thin: 2,
  default: 4,
  thick: 6,
};
// `PANE_FRAME_THICKNESS_PX` から導く（許容値の一覧をここで別に持たない。増減しても1箇所で揃う）。
const PANE_FRAME_THICKNESSES = Object.keys(PANE_FRAME_THICKNESS_PX) as PaneFrameThickness[];

/** 保存された太さを読む。3つのどれかでなければ既定の `"default"`。 */
export function loadPaneFrameThickness(raw: unknown): PaneFrameThickness {
  return PANE_FRAME_THICKNESSES.includes(raw as PaneFrameThickness)
    ? (raw as PaneFrameThickness)
    : "default";
}

/** pane にエージェント名を可視で出すか（20260922-appearance-settings-rest）。既定は無効
 *  （常時表示すると既存の見た目が変わるため。opt-in）。 */
export function loadPaneAgentNameVisible(raw: unknown): boolean {
  return typeof raw === "boolean" ? raw : false;
}

/**
 * pane 領域の外周の枠（20260922-tabbar-pane-appearance。herdr の `ui.pane_outer_borders` 相当。PR #12 から
 * 取り込み）。既定は今までと同じ見た目＝「無し」——外周の枠は本製品にこれまで無かった装飾なので、
 * `paneFrameThickness`（既存の各 pane 内側の枠）と違い「入れると変わる」opt-in にする。
 */
export function loadPaneOuterBorders(raw: unknown): boolean {
  return typeof raw === "boolean" ? raw : false;
}

/**
 * pane の枠の描画モード（20260926-pane-frame-auto-mode。herdr の `ui.pane_borders`）。3 値のどれかでなければ
 * 既定の「常に」——herdr の既定（`auto`）と逆で、今までの見た目（単一 pane にも枠）を既定にする（decisions D2）。
 */
export function loadPaneBorders(raw: unknown): PaneBorders {
  return PANE_BORDERS.includes(raw as PaneBorders) ? (raw as PaneBorders) : "always";
}

/** pane の間の隙間（herdr の `ui.pane_gaps`）。boolean でなければ既定の「入」（今までの見た目）。 */
export function loadPaneGaps(raw: unknown): boolean {
  return typeof raw === "boolean" ? raw : true;
}

/**
 * 新しく開く場所の方針（20260921-new-terminal-cwd。herdr の `terminal.new_cwd`）。**ブラウザごと**に持ち、作成の要求に載せる
 * （サーバは方針を持たない。design D1）。
 */
export type NewCwdPolicy = NewCwd["policy"];
const NEW_CWD_POLICIES: readonly NewCwdPolicy[] = ["follow", "home", "current", "path"];

/** 保存された方針を読む。**4 つのどれかでなければ既定の「引き継ぐ」**（herdr の既定と同じ。AC4）。 */
export function loadNewCwdPolicy(raw: unknown): NewCwdPolicy {
  return NEW_CWD_POLICIES.includes(raw as NewCwdPolicy) ? (raw as NewCwdPolicy) : "follow";
}

/** 保存された「指定した場所」を読む。文字列でなければ空（検証はサーバ。空なら使えない場所として知らされる）。 */
export function loadNewCwdPath(raw: unknown): string {
  return typeof raw === "string" ? raw : "";
}

/**
 * 作成の要求に載せる形を作る。**`sourcePaneId` は「引き継ぐ」のときだけ**、null なら載せない（元の pane が無い →
 * サーバが以前と同じ場所で開く。design D7）。「指定した場所」は入れたままの文字列を送る（`~` の展開と検証はサーバ）。
 */
export function buildNewCwd(
  policy: NewCwdPolicy,
  path: string,
  sourcePaneId: string | null,
): NewCwd {
  switch (policy) {
    case "follow":
      return sourcePaneId === null ? { policy } : { policy, sourcePaneId };
    case "home":
    case "current":
      return { policy };
    case "path":
      return { policy, path };
  }
}

export const useSettingsStore = defineStore("settings", () => {
  const initial = readPrefs();
  /** 状態を色に加えて記号でも示すか（`StateIcon.vue` が読む）。 */
  const statusSymbols = ref(loadStatusSymbols(initial["statusSymbols"]));
  /** 全画面のときブラウザ予約キーも Keyboard Lock で受け取るか（`KeyboardLockController` が読む）。 */
  const keyboardLockInFullscreen = ref(loadKeyboardLockInFullscreen(initial["keyboardLockInFullscreen"]));
  /** pane の枠・隙間の太さ（`App.vue` が CSS 変数へ配る）。 */
  const paneFrameThickness = ref(loadPaneFrameThickness(initial["paneFrameThickness"]));
  /** pane にエージェント名を可視で出すか（`PaneFrame.vue` が読む）。 */
  const paneAgentNameVisible = ref(loadPaneAgentNameVisible(initial["paneAgentNameVisible"]));
  /**
   * tab バーの位置・右端のエントリ・pane 領域の外周の枠（20260922-tabbar-pane-appearance。herdr の
   * `ui.tab_bar_position`/`ui.tab_bar_right`/`ui.pane_outer_borders` 相当。PR #12 から取り込み。
   * `paneFrameThickness`/`paneAgentNameVisible`〔20260922-appearance-settings-rest〕とは別の設定で、
   * 両立する——前者は各 pane の内側の枠・後者は pane 領域全体の外周）。
   */
  const tabBarPosition = ref<TabBarPosition>(loadTabBarPosition(initial["tabBarPosition"]));
  const tabBarRight = ref<TabBarRightEntry[]>(loadTabBarRightEntries(initial["tabBarRight"]));
  const tabBarRightSeparator = ref(loadTabBarRightSeparator(initial["tabBarRightSeparator"]));
  const paneOuterBorders = ref(loadPaneOuterBorders(initial["paneOuterBorders"]));
  /** pane の枠の描画モード・隙間（`PaneFrame.vue` が読む。20260926-pane-frame-auto-mode）。 */
  const paneBorders = ref<PaneBorders>(loadPaneBorders(initial["paneBorders"]));
  const paneGaps = ref(loadPaneGaps(initial["paneGaps"]));
  /** このブラウザの scrollback の設定。使う行数は `term/scrollback.ts` の `effectiveScrollback` が決める。 */
  const scrollback = ref<ScrollbackPref>(loadScrollbackPref(initial["scrollback"]));
  /** 新しい workspace・tab・分割を開く場所の方針と、「指定した場所」のパス（方針が `path` のときだけ使う）。 */
  const newCwdPolicy = ref<NewCwdPolicy>(loadNewCwdPolicy(initial["newCwdPolicy"]));
  const newCwdPath = ref(loadNewCwdPath(initial["newCwdPath"]));
  /**
   * テーマ（20260921-theme-settings）。1 つのテーマ・自動の切替・明るいとき・暗いとき（null＝まだ選んでいない＝1 つのテーマの対）。
   * 読み込みは値ごとに落とす（`loadThemePrefs`。AC4）。
   */
  const themePrefs = loadThemePrefs(initial);
  const theme = ref<ThemeName>(themePrefs.theme);
  const themeAuto = ref(themePrefs.auto);
  const themeLight = ref<ThemeName | null>(themePrefs.light);
  const themeDark = ref<ThemeName | null>(themePrefs.dark);
  /**
   * サイドバーの行の並び（20260927-sidebar-row-tokens。herdr の `[ui.sidebar.*].rows`）。区画ごとに null＝既定。読み込みは値ごとに落とす
   * （`sidebar/rowLayout.ts` の `loadSidebarRows`）。ブラウザごと（ほかの外観の設定と同じ）。
   */
  const sidebarRows = ref<SidebarRowsPrefs>(loadSidebarRows(initial["sidebarRows"]));
  /** 実際に使う並び（`Sidebar.vue` が読む）。 */
  const spacesLayout = computed<RowLayout>(() => effectiveLayout(sidebarRows.value, "spaces"));
  const agentsLayout = computed<RowLayout>(() => effectiveLayout(sidebarRows.value, "agents"));
  /** OS（ブラウザ）の明暗が暗いか。`ThemeController.start()` が `matchMedia` の値で上書きし、変化を追う（初期は暗い＝herdr の「分からなければ暗い」）。 */
  const systemDark = ref(true);
  /** いま使うテーマ（名前の解決は `theme/themes.ts` の `resolveTheme` の 1 か所）。 */
  const effectiveTheme = computed<ThemeName>(() =>
    resolveTheme(
      { theme: theme.value, auto: themeAuto.value, light: themeLight.value, dark: themeDark.value },
      systemDark.value,
    ),
  );

  /** 反映と保存を同時に行う（確定ボタンを置かない。AC-I2）。 */
  function setStatusSymbols(v: boolean): void {
    statusSymbols.value = v;
    writePrefs({ statusSymbols: v });
  }

  /** 反映と保存を同時に行う（20260922-keybinding-usability。AC11）。 */
  function setKeyboardLockInFullscreen(v: boolean): void {
    keyboardLockInFullscreen.value = v;
    writePrefs({ keyboardLockInFullscreen: v });
  }

  /** 反映と保存を同時に行う（確定ダイアログを挟まない。AC-I2）。 */
  function setPaneFrameThickness(v: PaneFrameThickness): void {
    paneFrameThickness.value = v;
    writePrefs({ paneFrameThickness: v });
  }

  /** 反映と保存を同時に行う（確定ダイアログを挟まない。AC-I2）。 */
  function setPaneAgentNameVisible(v: boolean): void {
    paneAgentNameVisible.value = v;
    writePrefs({ paneAgentNameVisible: v });
  }

  /** 反映と保存を同時に行う（PR #12 から取り込み）。 */
  function setTabBarPosition(v: TabBarPosition): void {
    tabBarPosition.value = v;
    writePrefs({ tabBarPosition: v });
  }

  /**
   * `tabBarRight` を丸ごと差し替える。`loadTabBarRightEntries` を通して正規化・上限の切り詰めをしてから、
   * 状態にも保存にも同じ内容が既にあれば何もしない（`replaceKeyPrefs` と同じ二重の比較。PR #12 から取り込み）。
   * `add`/`remove`/`move`/`update` の各操作からもこれを経由する。
   */
  function setTabBarRight(entries: readonly TabBarRightEntry[]): void {
    const normalized = loadTabBarRightEntries(entries);
    const serialized = JSON.stringify(normalized);
    const sameState = serialized === JSON.stringify(tabBarRight.value);
    const sameStored = serialized === JSON.stringify(readPrefs()["tabBarRight"] ?? []);
    if (sameState && sameStored) return;
    if (!sameState) tabBarRight.value = normalized;
    writePrefs({ tabBarRight: normalized });
  }

  /** 末尾に既定値のエントリを追加する（上限に達していたら何もしない）。 */
  function addTabBarRightEntry(kind: TabBarRightEntry["kind"]): void {
    if (tabBarRight.value.length >= MAX_TAB_BAR_RIGHT_ENTRIES) return;
    const entry: TabBarRightEntry =
      kind === "datetime" ? { kind, format: "time" } : kind === "text" ? { kind, text: "" } : { kind };
    setTabBarRight([...tabBarRight.value, entry]);
  }

  /** 指定した位置のエントリを消す。 */
  function removeTabBarRightEntry(index: number): void {
    setTabBarRight(tabBarRight.value.filter((_, i) => i !== index));
  }

  /** 指定した位置のエントリを 1 つ隣と入れ替える。端では何もしない。 */
  function moveTabBarRightEntry(index: number, direction: -1 | 1): void {
    const next = index + direction;
    if (index < 0 || index >= tabBarRight.value.length || next < 0 || next >= tabBarRight.value.length) return;
    const reordered = [...tabBarRight.value];
    const moved = reordered[index]!;
    reordered[index] = reordered[next]!;
    reordered[next] = moved;
    setTabBarRight(reordered);
  }

  /** 指定した位置のエントリを差し替える（datetime の書式・text の文字列の変更）。 */
  function updateTabBarRightEntry(index: number, entry: TabBarRightEntry): void {
    if (index < 0 || index >= tabBarRight.value.length) return;
    const next = [...tabBarRight.value];
    next[index] = entry;
    setTabBarRight(next);
  }

  /** 反映と保存を同時に行う。 */
  function setTabBarRightSeparator(v: string): void {
    const normalized = loadTabBarRightSeparator(v);
    tabBarRightSeparator.value = normalized;
    writePrefs({ tabBarRightSeparator: normalized });
  }

  /** 反映と保存を同時に行う。 */
  function setPaneOuterBorders(v: boolean): void {
    paneOuterBorders.value = v;
    writePrefs({ paneOuterBorders: v });
  }

  /** 反映と保存を同時に行う。 */
  function setPaneBorders(v: PaneBorders): void {
    paneBorders.value = v;
    writePrefs({ paneBorders: v });
  }

  /** 反映と保存を同時に行う。 */
  function setPaneGaps(v: boolean): void {
    paneGaps.value = v;
    writePrefs({ paneGaps: v });
  }

  /** 反映と保存を同時に行う。**効くのはその後に作る端末から**（既に開いている pane は変えない。AC9）。 */
  function setScrollback(v: ScrollbackPref): void {
    scrollback.value = v;
    writePrefs({ scrollback: v });
  }

  /** 反映と保存を同時に行う。**効くのは次に開く workspace・tab・分割から**（既に開いている pane は変えない。AC10）。 */
  function setNewCwdPolicy(v: NewCwdPolicy): void {
    newCwdPolicy.value = v;
    writePrefs({ newCwdPolicy: v });
  }

  /** 反映と保存を同時に行う。呼ぶのは入れ終えたとき（入力欄の `change`）だけ——打ちかけの値で開かない（AC-I2）。 */
  function setNewCwdPath(v: string): void {
    newCwdPath.value = v;
    writePrefs({ newCwdPath: v });
  }

  /**
   * 1 つのテーマを選ぶ。反映と保存を同時に行う。**自動の切替が入っていたら切る**（herdr の「設定画面で手で選ぶと auto_switch が切れる」。AC7）。
   */
  function setTheme(v: ThemeName): void {
    theme.value = v;
    themeAuto.value = false;
    writePrefs({ theme: v, themeAuto: false });
  }

  /** 自動の切替の入切。切ると 1 つのテーマに戻る（`resolveTheme`。AC7）。 */
  function setThemeAuto(v: boolean): void {
    themeAuto.value = v;
    writePrefs({ themeAuto: v });
  }

  /** 明るいときのテーマ。null で既定（1 つのテーマの対）に戻り、また追従する（design D7）。 */
  function setThemeLight(v: ThemeName | null): void {
    themeLight.value = v;
    writePrefs({ themeLight: v });
  }

  /** 暗いときのテーマ。null で既定に戻る。 */
  function setThemeDark(v: ThemeName | null): void {
    themeDark.value = v;
    writePrefs({ themeDark: v });
  }

  /**
   * サイドバーの行の並びを丸ごと差し替えて保存する（`replaceKeyPrefs` と同じ形）。保存する形を読み直して正規化し（読めない値は反映せず捨てる）、
   * 状態も保存も同じなら何もしない。両方の区画が既定なら `sidebarRows` の項目ごと消す。
   */
  function replaceSidebarRows(next: SidebarRowsPrefs): void {
    const serialized = serializeSidebarRows(loadSidebarRows(serializeSidebarRows(next)));
    const normalized = loadSidebarRows(serialized);
    const json = JSON.stringify(serialized ?? null);
    const sameState = json === JSON.stringify(serializeSidebarRows(sidebarRows.value) ?? null);
    const sameStored = json === JSON.stringify(readPrefs()["sidebarRows"] ?? null);
    if (sameState && sameStored) return;
    if (!sameState) sidebarRows.value = normalized;
    writePrefs({ sidebarRows: serialized });
  }

  /** 1 つの区画の並びを差し替える（null で既定へ戻す。AC15）。設定画面はこれを使う。 */
  function setSidebarLayout(area: SidebarArea, layout: RowLayout | null): void {
    replaceSidebarRows({ ...sidebarRows.value, [area]: layout });
  }

  /**
   * キーの割り当て（20260921-keybinding-customization。design「store」・D2）。**既定との差だけ**を持つ（`keys/keyPrefs.ts`）。読み込みは値ごとに落とす（AC8）。
   * ブラウザごと（herdr のキー設定はクライアントの機器の設定）。
   */
  const keyPrefs = ref<KeyPrefs>(loadKeyPrefs(initial["keys"]));
  /**
   * 解決した割り当ての表。`KeyRouter`（`main.ts` が変わるたびに差し替える）・キー一覧・トースト・通知の案内文が**同じ表**を見る。
   * 割り当てが変わったときだけ作り直す（押すたびには作らない）。
   */
  // 独自コマンド（20260927-custom-command-keys）の一覧も渡す——サーバの一覧が変われば表も作り直す（一覧に無いコマンドの割り当ては載らない）。
  const commands = useCommandsStore();
  const keymap = computed<ResolvedKeymap>(() => resolveKeymap(keyPrefs.value, commandKeyDefs(commands.catalog)).keymap);
  /**
   * navigate モードの6操作（20260923-navigate-mode-keys。design「store」）の解決した表。
   * `keyPrefs.navigateKeys` は `bindings`/`prefix` とは別の**内容**の表なので、専用の computed で分ける
   * （`resolveNavigateKeymap` は `navigateKeys` だけを読み、`bindings`/`prefix` の影響を受けない）。
   * ただし `keyPrefs` は1つの `ref` なので、`replaceKeyPrefs` が差し替えるたびに（`bindings`・`prefix`・
   * `navigateKeys` のどれを変えたときでも）`keymap`/`navigateKeymap` は両方とも作り直される——
   * これは既存の `keymap`（prefix と bindings をまとめて1つの ref で持つ）と同じトレードオフで、
   * **中身**（実際に変えていない側の割り当て）は変わらない。`NavigateMode`（`main.ts` が変わるたびに
   * 差し替える）・`HelpDialog`（「移動」群）が同じ表を見る。
   */
  const navigateKeymap = computed<ResolvedNavigateKeymap>(
    () => resolveNavigateKeymap(keyPrefs.value.navigateKeys).keymap,
  );

  /**
   * 差し替えて保存する。**保存する形（`serializeKeyPrefs`）を読み直した結果を採る**——呼び出し側が検証（`validateAssignment`）を済ませているが、**読めない値**（構文が通らない文字列・
   * 送れない prefix）を渡されても反映せず捨てる（読み込みと同じ落とし方。二重の守り）。衝突・予約は読み込みの段では見ず、解決（`resolveKeymap`）が同じ規則で落とす（保存は残る）。
   * 状態も保存も同じなら何もしない（keymap を作り直さない・書かない）。**保存が状態と違うとき（壊れた `keys` が残っている等）は、状態はそのまま保存だけを直す**。差が無くなれば `keys` ごと消す。
   */
  function replaceKeyPrefs(next: KeyPrefs): void {
    const normalized = loadKeyPrefs(serializeKeyPrefs(next));
    const serialized = serializeKeyPrefs(normalized);
    const sameState =
      JSON.stringify(serialized ?? null) ===
      JSON.stringify(serializeKeyPrefs(keyPrefs.value) ?? null);
    const sameStored =
      JSON.stringify(serialized ?? null) === JSON.stringify(readPrefs()["keys"] ?? null);
    if (sameState && sameStored) return;
    if (!sameState) keyPrefs.value = normalized;
    writePrefs({ keys: serialized });
  }

  /**
   * 色の個別の上書き（20260922-theme-custom-overrides。design「store」・herdr の `[theme.custom]` 相当）。**既定との差だけ**を持つ
   * （`theme/themeOverrides.ts`）。読み込みは値ごとに落とす（AC8）。ブラウザごと（テーマの設定と同じ）。
   */
  const themeOverrides = ref<ThemeOverrides>(loadThemeOverrides(initial["themeOverrides"]));

  /**
   * 同じブラウザの別のウィンドウ・タブで割り当てが変わったら追従する。`writePrefs` は書くたびに保存された全体を読んで項目だけ差し替えるので、ほかの設定は先の変更を消さないが、
   * `keys`／`themeOverrides` は 1 つのまとまりをメモリの状態から丸ごと書く——追従しないと、古い状態から別の変更をしたとき、先に保存された変更を上書きしてしまう。
   * `storage` は**ほかの**ウィンドウの書き込みでだけ発火する（自分の書き込みでは来ない）。
   */
  window.addEventListener("storage", () => {
    const fresh = loadKeyPrefs(readPrefs()["keys"]);
    if (
      JSON.stringify(serializeKeyPrefs(fresh) ?? null) !==
      JSON.stringify(serializeKeyPrefs(keyPrefs.value) ?? null)
    )
      keyPrefs.value = fresh;
    // 20260922-theme-custom-overrides：色の上書きも同じ理由で追従する（同じ listener の中でまとめて見る。listener を増やさない）。
    const freshOverrides = loadThemeOverrides(readPrefs()["themeOverrides"]);
    if (
      JSON.stringify(serializeThemeOverrides(freshOverrides) ?? null) !==
      JSON.stringify(serializeThemeOverrides(themeOverrides.value) ?? null)
    )
      themeOverrides.value = freshOverrides;
    // 20260927-sidebar-row-tokens：行の並び（`sidebarRows`）も 2 つの区画を 1 つのまとまりとして丸ごと書くので、同じ理由で追従する。
    const freshRows = loadSidebarRows(readPrefs()["sidebarRows"]);
    if (JSON.stringify(freshRows) !== JSON.stringify(sidebarRows.value)) sidebarRows.value = freshRows;
  });

  /**
   * 同じブラウザの別のウィンドウ・タブでの変更に追従する（PR #12 から取り込み。枠の描画モード・隙間は
   * 20260926-pane-frame-auto-mode）。この 6 項目はどれも
   * 単純な値の「常に書く」形なので、保存値を読み直して違えば置き換えるだけでよい。
   */
  window.addEventListener("storage", () => {
    const prefs = readPrefs();
    const nextPosition = loadTabBarPosition(prefs["tabBarPosition"]);
    if (nextPosition !== tabBarPosition.value) tabBarPosition.value = nextPosition;
    const nextRight = loadTabBarRightEntries(prefs["tabBarRight"]);
    if (JSON.stringify(nextRight) !== JSON.stringify(tabBarRight.value)) tabBarRight.value = nextRight;
    const nextSeparator = loadTabBarRightSeparator(prefs["tabBarRightSeparator"]);
    if (nextSeparator !== tabBarRightSeparator.value) tabBarRightSeparator.value = nextSeparator;
    const nextOuter = loadPaneOuterBorders(prefs["paneOuterBorders"]);
    if (nextOuter !== paneOuterBorders.value) paneOuterBorders.value = nextOuter;
    const nextBorders = loadPaneBorders(prefs["paneBorders"]);
    if (nextBorders !== paneBorders.value) paneBorders.value = nextBorders;
    const nextGaps = loadPaneGaps(prefs["paneGaps"]);
    if (nextGaps !== paneGaps.value) paneGaps.value = nextGaps;
  });

  /**
   * 差し替えて保存する。`replaceKeyPrefs`（上の「キーの割り当て」節）と同じ形：読み直して正規化し、二重の守り（読めない値は
   * 反映せず捨てる）、状態も保存も同じなら何もしない、保存が状態と違うときは保存だけを直す、差が無くなれば `themeOverrides`
   * ごと消す。
   */
  function replaceThemeOverrides(next: ThemeOverrides): void {
    const normalized = loadThemeOverrides(serializeThemeOverrides(next));
    const serialized = serializeThemeOverrides(normalized);
    const sameState =
      JSON.stringify(serialized ?? null) ===
      JSON.stringify(serializeThemeOverrides(themeOverrides.value) ?? null);
    const sameStored =
      JSON.stringify(serialized ?? null) === JSON.stringify(readPrefs()["themeOverrides"] ?? null);
    if (sameState && sameStored) return;
    if (!sameState) themeOverrides.value = normalized;
    writePrefs({ themeOverrides: serialized });
  }

  /** ある CSS 変数の、明るいとき／暗いときどちらかの上書きを差し替える。 */
  function setThemeOverride(bucket: ThemeOverrideBucket, key: CssVar, value: string): void {
    replaceThemeOverrides(withOverride(themeOverrides.value, bucket, key, value));
  }

  /** ある CSS 変数の、明るいとき／暗いときどちらかの上書きを外す（既定へ戻す。AC6）。 */
  function resetThemeOverride(bucket: ThemeOverrideBucket, key: CssVar): void {
    replaceThemeOverrides(withoutOverride(themeOverrides.value, bucket, key));
  }

  /** すべての上書きを既定へ戻す（AC7。`themeOverrides` を消す）。 */
  function resetAllThemeOverrides(): void {
    replaceThemeOverrides(emptyThemeOverrides());
  }

  /** prefix を変える（chord。null は既定へ）。反映と保存を同時に行う（確定ボタンを置かない。AC8）。 */
  function setKeyPrefix(chord: string | null): void {
    replaceKeyPrefs(withPrefix(keyPrefs.value, chord));
  }

  /** ある操作の割り当てを差し替える（空配列は「割り当てなし」）。既定と同じ内容になれば上書きを消す。 */
  function setKeyBindings(id: KeyTargetId, bindings: readonly string[]): void {
    replaceKeyPrefs(withBindings(keyPrefs.value, id, bindings));
  }

  /** ある操作の上書きを消す（既定へ戻す。AC9）。 */
  function resetKeyAction(id: KeyTargetId): void {
    replaceKeyPrefs(withoutBindings(keyPrefs.value, id));
  }

  /**
   * navigate モードの1操作（`navigate_pane_left` 等）の割り当てを差し替える（20260923-navigate-mode-keys。
   * AC1・AC6）。`setKeyBindings` と同じ流儀——空配列は「割り当てなし」、既定と同じ内容になれば上書きを消す。
   */
  function setNavigateKeyBindings(id: NavigateKeyId, bindings: readonly string[]): void {
    replaceKeyPrefs(withNavigateBinding(keyPrefs.value, id, bindings));
  }

  /** navigate モードの1操作の上書きを消す（既定へ戻す。AC5）。 */
  function resetNavigateKey(id: NavigateKeyId): void {
    replaceKeyPrefs(withoutNavigateBinding(keyPrefs.value, id));
  }

  /** prefix を既定へ戻す（AC9）。 */
  function resetKeyPrefix(): void {
    replaceKeyPrefs(withPrefix(keyPrefs.value, null));
  }

  /** すべてを既定へ戻す（AC9。`keys` を消す）。 */
  function resetAllKeys(): void {
    replaceKeyPrefs(emptyKeyPrefs());
  }

  return {
    statusSymbols,
    keyboardLockInFullscreen,
    paneFrameThickness,
    paneAgentNameVisible,
    tabBarPosition,
    tabBarRight,
    tabBarRightSeparator,
    paneOuterBorders,
    paneBorders,
    paneGaps,
    scrollback,
    newCwdPolicy,
    newCwdPath,
    theme,
    themeAuto,
    themeLight,
    themeDark,
    systemDark,
    effectiveTheme,
    keyPrefs,
    keymap,
    navigateKeymap,
    themeOverrides,
    sidebarRows,
    spacesLayout,
    agentsLayout,
    replaceSidebarRows,
    setSidebarLayout,
    setStatusSymbols,
    setKeyboardLockInFullscreen,
    setPaneFrameThickness,
    setPaneAgentNameVisible,
    setTabBarPosition,
    setTabBarRight,
    addTabBarRightEntry,
    removeTabBarRightEntry,
    moveTabBarRightEntry,
    updateTabBarRightEntry,
    setTabBarRightSeparator,
    setPaneOuterBorders,
    setPaneBorders,
    setPaneGaps,
    setScrollback,
    setNewCwdPolicy,
    setNewCwdPath,
    setTheme,
    setThemeAuto,
    setThemeLight,
    setThemeDark,
    replaceKeyPrefs,
    setKeyPrefix,
    setKeyBindings,
    resetKeyAction,
    resetKeyPrefix,
    resetAllKeys,
    setNavigateKeyBindings,
    resetNavigateKey,
    replaceThemeOverrides,
    setThemeOverride,
    resetThemeOverride,
    resetAllThemeOverrides,
  };
});
