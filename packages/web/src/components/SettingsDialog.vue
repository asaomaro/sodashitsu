<script setup lang="ts">
import { DEFAULT_THEME_NAME, isThemeName, THEME_APPEARANCE, THEME_NAMES, type AgentIntegrationKind, type ThemeName } from "@sodashitsu/protocol";
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { ActionDispatcherKey, DeviceKindKey, NotificationControllerKey } from "../injection.js";
import type { PaneBorders } from "../layout/paneChrome.js";
import type { DesktopPermission } from "../notify/ports.js";
import { useAgentIntegrationsStore } from "../store/agentIntegrations.js";
import { useNotificationsStore } from "../store/notifications.js";
import { useSessionStore } from "../store/session.js";
import { useSettingsStore, type NewCwdPolicy, type PaneFrameThickness } from "../store/settings.js";
import { DISPLAY_STATES, stateGlyph, stateLabel } from "@sodashitsu/client-core";
import { useViewStore } from "../store/view.js";
import { effectiveScrollback, scrollbackChoices, type ScrollbackPref } from "../term/scrollback.js";
import type { FileLocality } from "../term/FileTransfer.js";
import { siblingThemes, THEME_LABELS } from "@sodashitsu/client-core";
import {
  MAX_TAB_BAR_RIGHT_ENTRIES,
  type DatetimeFormat,
  type TabBarPosition,
  type TabBarRightEntry,
} from "@sodashitsu/client-core";
import { CSS_VAR_LABELS, isValidCssColor, type ThemeOverrideBucket } from "../theme/themeOverrides.js";
import { CSS_VARS, type CssVar } from "@sodashitsu/client-core";
import { mobileViewportQuery } from "../mobile/detect.js";
import { keepChosen, scrollTopFor, sectionAtScroll, stepSection, type SpyInput } from "../settings/sectionSpy.js";
import KeySettings from "./KeySettings.vue";
import SidebarRowsSettings from "./SidebarRowsSettings.vue";

/**
 * 設定（20260921-herdr-settings-gaps の D7）。**見出しで 6 節（通知・テーマ・表示・端末・エージェント連携・キー）に分けた 1 枚**（テーマは 20260921-theme-settings の
 * decisions D11 で、キーは 20260921-keybinding-customization の design「節「キー」の構成」で、エージェント連携は 20260923-agent-session-resume で足した）。
 * 以前は通知だけのダイアログ（`NotificationSettingsDialog.vue`。20260920-agent-notifications の AC6〜AC8・AC12・AC13）で、
 * 通知の節はその実装をそのまま移した。`view.dialogContext.kind === "settings"` を扱う。形は `ConfirmDialog` と同じ
 * （ネイティブ `<dialog>` ＋ `showModal()` ＋ `@cancel` の抑止）。
 *
 * **節は Tabs にも Accordion にもしない**（全部の節が 1 枚に並んだまま見える。先例は `HelpDialog.vue`）。節が増えて長くなったので、幅 768px 以上では
 * 左に節の一覧（サイドメニュー。20261004-settings-side-menu）を出し、押すとその節へ移る。
 *
 * **切り替えは `role="switch"`**（decisions D2）——APG は switch を「on/off を表し、**操作が即座に効く**もの」
 * と定義しており、AC-I2（押した時点で反映・確定ボタンを置かない）と一致する。
 * 既存の `aria-pressed`（`ExtraKeys` 等）は道具のモードであって設定ではない。
 */
const view = useViewStore();
const store = useNotificationsStore();
const controller = inject(NotificationControllerKey);
// 既存のダイアログと同じ流儀（`ConfirmDialog.vue`）。握りつぶすと、結線を落としたときに
// **「この環境では使えません」という嘘の理由**が利用者に出て、誰も気づかない。
if (!controller) throw new Error("SettingsDialog: NotificationControllerKey が provide されていません");

const session = useSessionStore();
const settings = useSettingsStore();
/** 公式フック連携（20260923-agent-session-resume）。**握りつぶす**——単体テストでの provide を必須にしない
 *  （`PaneFrame.vue` と同じ流儀。落とせば節のボタンが押しても反応しないだけで、他の設定操作は壊れない）。 */
const actions = inject(ActionDispatcherKey, undefined);
const agentIntegrations = useAgentIntegrationsStore();
/**
 * 端末の種類。**既定値つきで受け、provide が無くても throw しない**——通知の制御器（無いと嘘の理由を出すので throw する）
 * と違い、これが効くのは「自動」の行に添える行数の表示だけ。**`isCoarsePointer()` を呼び直さない**（判定が 2 か所に割れると、
 * `main.ts` が実際に使う行数とこの表示が食い違いうる）。結線を落とした場合はモバイルの E2E が文言で捕まえる。
 */
const kind = inject(DeviceKindKey, "desktop");

const dialogEl = ref<HTMLDialogElement | null>(null);
const firstSwitch = ref<HTMLButtonElement | null>(null);
/** 左のサイドメニューの項目（節の見出しから作る。20261004-settings-side-menu）。 */
const menuItems = ref<{ id: string; label: string }[]>([]);
/** 今の節（`menuItems` の番号。節が無ければ -1）。**選んだ節** `chosen`（項目を押した・節の中にフォーカスが入った）があれば、
 *  利用者が自分でスクロールするまでそれを優先する（20261004-settings-side-menu の D2）。 */
const current = ref(0);
const chosen = ref<number | null>(null);
const menuEl = ref<HTMLElement | null>(null);
const bodyEl = ref<HTMLElement | null>(null);
/**
 * 「指定した場所」の入力欄の下書き（`NameDialog` と同じく ref と v-model で持つ）。`:value` を保存値へ一方向に結ぶと、ほかの状態
 * （通知の可否・サーバの上限）で描き直されるたびに、打ちかけの文字が保存値で上書きされる（Vue は描き直しのたびに value を当て直す）。
 */
const pathDraft = ref(settings.newCwdPath);

/**
 * 許可の状態は**明示的に読み直す**（`Notification.permission` は reactive ではないので、
 * computed から呼ぶと**最初に評価したときの値で固まる**——許可を取っても行が「切」のまま、
 * もう一度押しても切に戻せない）。読み直すのは「開いたとき」と「許可を求めた後」。
 */
const permission = ref<DesktopPermission>(controller.desktopPermission());
// `controller` を参照するので arrow function にする（`function` 宣言だと const 絞り込みが効かない。
// `ConfirmDialog.vue` と同じ事情）。
const refreshPermission = (): void => {
  permission.value = controller.desktopPermission();
};

/** OS 通知の行の状態。許可（AC8）と「この環境では使えない」（AC12）を取り違えない。 */
const desktopState = computed<"usable" | "needsPermission" | "denied" | "unusable">(() => {
  if (!store.desktopUsable) return "unusable"; // 実際に出そうとして失敗した（Android Chrome 等）
  if (permission.value === "unsupported") return "unusable";
  if (permission.value === "denied") return "denied";
  return permission.value === "granted" ? "usable" : "needsPermission";
});

const desktopNote = computed(() => {
  switch (desktopState.value) {
    case "unusable":
      return "この環境では使えません（ブラウザが対応していないか、この画面からは出せません）。";
    case "denied":
      return "ブラウザで拒否されています。許可するにはブラウザの設定から変えてください。";
    case "needsPermission":
      return "押すとブラウザに許可を求めます。";
    default:
      return "";
  }
});

const soundNote = computed(() => {
  if (!store.soundUsable) return "この環境では音を鳴らせません（ブラウザが対応していません）。";
  return store.soundBlocked ? "この画面をまだ操作していないため鳴らせませんでした。どこかを押すと鳴るようになります。" : "";
});

watch(
  () => view.dialogContext,
  (ctx) => {
    if (ctx?.kind === "settings") {
      refreshPermission(); // 開くたびに読み直す（前回開いてから外で変わっているかもしれない）
      pathDraft.value = settings.newCwdPath; // 開くたびに保存値から始める
      syncOverrideDrafts();
      agentIntegrationMessage.value = null; // 前回の結果の文を持ち越さない
      // サーバ全体の設定なので client.hello のスナップショットに乗らない（20260923-agent-session-resume）。
      void actions?.refreshAgentIntegrationStatus();
      void nextTick(() => {
        dialogEl.value?.showModal();
        firstSwitch.value?.focus();
        buildMenu();
        startObserving();
        updateCurrent();
      });
    } else {
      stopObserving();
      chosen.value = null; // 次に開いたときは最初の節から
      menuFocus.value = null;
      current.value = 0;
      dialogEl.value?.close();
      confirmingOverrideReset.value = false; // 開き直したとき、確認が出たままにならない
      overrideMessage.value = ""; // 前回の結果の文を持ち越さない
    }
  },
);

function toggleToast(): void {
  store.setPrefs({ toast: !store.prefs.toast });
}

/** OS 通知。**許可がまだなら、押した勢い（利用者の操作）でそのまま求める**（AC7・AC8）。 */
const toggleDesktop = async (): Promise<void> => {
  if (desktopState.value === "denied" || desktopState.value === "unusable") return;
  if (desktopState.value === "needsPermission") {
    const p = await controller.requestDesktopPermission();
    permission.value = p; // 読み直す（ここを忘れると、許可を取っても行が「切」のまま固まる）
    if (p !== "granted") return; // 拒否されたら「入」にしない
    store.setPrefs({ desktop: true });
    return;
  }
  store.setPrefs({ desktop: !store.prefs.desktop });
};

/** 音。**「入」にした瞬間が利用者の操作**なので、ここで自動再生を解除しておく（AC13）。 */
const toggleSound = (): void => {
  if (!store.soundUsable) return;
  const next = !store.prefs.sound;
  if (next) controller.unlockSound();
  store.setPrefs({ sound: next });
};

/**
 * 表示の節の注記。**字形と名前は表（`client-core の agent/stateIndicator.ts`）から組み立てる**——直書きすると、表を 1 か所で変えたとき
 * サイドバー・goto・モバイルのピッカーは新しい字形になるのに、この注記だけが古いまま残る（cross 点検の指摘）。
 */
// 字形と名前は**組にして**並べる——列を分けると対応を順番で数えるしかなく、タッチの端末では `title` の吹き出しも出ないので、
// ここが対応を知る唯一の場所になる（review ラウンド1 の指摘）。
// 区切りは「、」——「・」（U+30FB）だと状態不明の字形「·」（U+00B7）のすぐ前に来て、日本語フォントでは同じ形に見え、組が読めなくなる。
const symbolsNote = `色に加えて形でも見分けられます（${DISPLAY_STATES.map((s) => `${stateGlyph(s)} ${stateLabel(s)}`).join("、")}）。`;

/** 表示の節。**押した時点で効き、3 か所（サイドバー・goto・モバイルのピッカー）の印が同時に切り替わる**。 */
function toggleSymbols(): void {
  settings.setStatusSymbols(!settings.statusSymbols);
}

/**
 * pane の枠・隙間の太さ（20260922-appearance-settings-rest）。選んだ時点で保存し、`App.vue` の
 * CSS 変数（`--soda-pane-gap`）が再計算されるのでページの再読み込みは要らない（AC9）。
 */
const paneFrameChoices: readonly { value: PaneFrameThickness; label: string }[] = [
  { value: "thin", label: "細い" },
  { value: "default", label: "既定" },
  { value: "thick", label: "太い" },
];

function choosePaneFrameThickness(v: PaneFrameThickness): void {
  settings.setPaneFrameThickness(v);
}

/** pane の枠の描画モード・隙間（20260926-pane-frame-auto-mode）。選んだ時点で反映・保存（確定ボタン無し。AC-I2）。 */
const paneBordersChoices: readonly { value: PaneBorders; label: string }[] = [
  { value: "always", label: "常に" },
  { value: "auto", label: "分割しているときだけ" },
  { value: "off", label: "表示しない" },
];

function choosePaneBorders(v: PaneBorders): void {
  settings.setPaneBorders(v);
}

function togglePaneGaps(): void {
  settings.setPaneGaps(!settings.paneGaps);
}

/** pane にエージェント名を可視で出すか（20260922-appearance-settings-rest。既定は無効。AC10）。 */
function toggleAgentNameVisible(): void {
  settings.setPaneAgentNameVisible(!settings.paneAgentNameVisible);
}

/**
 * tab バーの位置・右端のエントリ・pane 領域の外周の枠（20260922-tabbar-pane-appearance。PR #12 から
 * 取り込み）。位置・外周は既存の switch/select と同じ「選んだ時点で反映・保存」（確定ボタン無し）。
 * 右端エントリの追加・削除・並び替え・区切り文字も同様、`:value` を読んで `@change`/Enter で確定する形
 * （打ちかけの値で保存しない。テーマの `chooseThemeFor` と同じ流儀）。
 */
const TAB_BAR_POSITIONS: readonly { value: TabBarPosition; label: string }[] = [
  { value: "top", label: "上" },
  { value: "bottom", label: "下" },
];
const ENTRY_KINDS: readonly { value: TabBarRightEntry["kind"]; label: string }[] = [
  { value: "zoom", label: "拡大の状態" },
  { value: "hostname", label: "接続先のホスト名" },
  { value: "datetime", label: "日時" },
  { value: "text", label: "固定文字列" },
];
const DATETIME_FORMATS: readonly { value: DatetimeFormat; label: string }[] = [
  { value: "time", label: "時刻（時:分）" },
  { value: "time-seconds", label: "時刻（時:分:秒）" },
  { value: "date", label: "日付" },
  { value: "date-time", label: "日付と時刻" },
];

/** 「追加する種類」の選択（既定は先頭の zoom）。 */
const newEntryKind = ref<TabBarRightEntry["kind"]>("zoom");

function entryKindLabel(kind: TabBarRightEntry["kind"]): string {
  return ENTRY_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

function onTabBarPositionChange(ev: Event): void {
  settings.setTabBarPosition((ev.target as HTMLSelectElement).value as TabBarPosition);
}

function togglePaneOuterBorders(): void {
  settings.setPaneOuterBorders(!settings.paneOuterBorders);
}

function addTabBarRightEntry(): void {
  settings.addTabBarRightEntry(newEntryKind.value);
}

/** 削除後のフォーカスの行き先を `KeySettings.vue` の `removeBinding` と同じ考え方で実装する（AC-I4）。 */
function removeTabBarRightEntry(index: number, ev: Event): void {
  // 「追加」ボタンは `<ul class="tabbar-right-list">` の**外**（兄弟の `<div>`）にあるので、フォールバック先も
  // 含めて捜す範囲は fieldset 全体にする（`ul` だけだと「最後の行を消す→追加ボタンへ」が見つからない）。
  const fieldsetEl = (ev.currentTarget as HTMLElement | null)?.closest("fieldset.tabbar-right-fieldset") ?? null;
  settings.removeTabBarRightEntry(index);
  void nextTick(() => {
    // 消えた位置に繰り上がった行の［削除］。最後を消したときは無いので［追加］へ。
    const removeButtons = fieldsetEl?.querySelectorAll<HTMLElement>("[data-remove-entry]") ?? [];
    (removeButtons[index] ?? fieldsetEl?.querySelector<HTMLElement>("[data-add-entry]"))?.focus();
  });
}

function moveTabBarRightEntry(index: number, direction: -1 | 1): void {
  settings.moveTabBarRightEntry(index, direction);
}

function onTabBarRightEntryFormatChange(index: number, ev: Event): void {
  settings.updateTabBarRightEntry(index, { kind: "datetime", format: (ev.target as HTMLSelectElement).value as DatetimeFormat });
}

function onTabBarRightEntryTextChange(index: number, ev: Event): void {
  settings.updateTabBarRightEntry(index, { kind: "text", text: (ev.target as HTMLInputElement).value });
}

/**
 * Enter でも確定する。**`blur()` を呼んで `change` に任せない**——`.value` を script で書き換えた入力欄は、
 * ブラウザが「利用者が触った」と扱わない実装があり、blur で必ず `change` が立つとは限らない（`onPathEnter`
 * と同じ、IME 変換確定の Enter を除く注意も適用する）。ここで直接読んで確定する。
 */
function onTabBarRightEntryTextEnter(index: number, ev: KeyboardEvent): void {
  if (ev.isComposing || ev.keyCode === 229) return;
  settings.updateTabBarRightEntry(index, { kind: "text", text: (ev.target as HTMLInputElement).value });
}

function onTabBarRightSeparatorChange(ev: Event): void {
  settings.setTabBarRightSeparator((ev.target as HTMLInputElement).value);
}

function onTabBarRightSeparatorEnter(ev: KeyboardEvent): void {
  if (ev.isComposing || ev.keyCode === 229) return;
  settings.setTabBarRightSeparator((ev.target as HTMLInputElement).value);
}

/** サーバの上限（snapshot の `limits`）。上限を超える値は、選んでも黙って上限分しか届かないので出さない。 */
const limit = computed(() => session.limits.scrollbackLines);
/** 「自動」の行に添える、この端末でいま効く行数（モバイルの利用者が「自動＝何行か」を知る手段がほかに無い）。 */
const autoLines = computed(() => effectiveScrollback("auto", kind, limit.value));
const choices = computed(() => scrollbackChoices(limit.value, typeof settings.scrollback === "number" ? settings.scrollback : undefined));
/**
 * 選ばれて見える行。**いつもちょうど 1 つ**——上限を超えた保存値は押さえた値（＝上限。必ず選択肢にある）の行、
 * 上限以下で段階に無い保存値は `scrollbackChoices` が選択肢に足している（D5）。保存値そのものは書き換えない。
 */
const selectedScrollback = computed<ScrollbackPref>(() =>
  settings.scrollback === "auto" ? "auto" : Math.min(settings.scrollback, limit.value),
);
const formatLines = (n: number): string => n.toLocaleString("ja-JP");

/** 端末の節。**選んだ時点で保存する**（確定ボタンを置かない）。効くのはその後に開く pane から（AC9）。 */
function chooseScrollback(v: ScrollbackPref): void {
  settings.setScrollback(v);
}

/**
 * 端末のファイルのリンク・ドロップで、このブラウザをサーバと同じマシンとして扱うか（`term/FileTransfer.ts`）。ブラウザごとの設定。
 * 「自動」はサーバが接続の両端のアドレスで判定する——`ssh -L`・コンテナのポートの公開等の転送の後ろでは当たらないので、選び直せる。
 */
const fileLocalityChoices: { value: FileLocality; label: string }[] = [
  { value: "auto", label: "自動（接続元がサーバと同じマシンかで決める）" },
  { value: "local", label: "同じマシンとして扱う（リンクはサーバのマシンのアプリで開き、ドロップは元のパスを渡す）" },
  { value: "remote", label: "別のマシンとして扱う（リンクはダウンロードし、ドロップはサーバへ送る）" },
];

/**
 * 新しく開く場所（20260921-new-terminal-cwd の design D8。herdr の `terminal.new_cwd`）。方針は**選んだ時点で保存**し、
 * 効くのは次に開く workspace・tab・分割から（AC10）。
 */
const newCwdChoices: readonly { value: NewCwdPolicy; label: string }[] = [
  { value: "follow", label: "引き継ぐ（いま見ている pane の場所）" },
  { value: "home", label: "ホーム" },
  { value: "current", label: "サーバを起動した場所" },
  { value: "path", label: "指定した場所" },
];

function chooseNewCwd(v: NewCwdPolicy): void {
  settings.setNewCwdPolicy(v);
}

/**
 * パスは**入れ終えた時点**で保存し、打ちかけの途中（`input`）では保存しない——途中の値で開いてしまわない（AC-I2）。
 * 入れ終えた時点は、入力欄を離れたとき（`change`）・Enter・**ダイアログを閉じたとき**（design D8 の「離れたとき」。decisions D8）。
 * 閉じる操作（Esc・閉じる・背景）は取り消しではない——ほかの設定と同じく、閉じても入れた結果は残る（AC-I1）。閉じると入力欄から
 * フォーカスが外れて Chromium は `change` を立てるが、立つかどうかをブラウザに任せず、閉じる側で確定する（同じ値なら何もしない）。
 */
function commitNewCwdPath(): void {
  if (pathDraft.value !== settings.newCwdPath) settings.setNewCwdPath(pathDraft.value);
}

/**
 * シェルの場所を追う（Windows。20260928-windows-pane-cwd の D-6）。押した時点で保存し、効くのは次に開く pane から（既に開いている pane は変えない）。
 * 読むのはサーバ（pane を開くたびに共有の設定を読む）。
 */
/** 表示の面の初めの状態・帯の既定の場所（20261008-display-layout）。選んだ時点で反映・保存。パネルの既定の置き場所は PR-B から出す。 */
const displayPanelInitialChoices: readonly { value: "open" | "collapsed"; label: string }[] = [
  { value: "open", label: "開く" },
  { value: "collapsed", label: "たたむ（帯の行のボタンから開く）" },
];
const displayBandEdgeChoices: readonly { value: "top" | "bottom"; label: string }[] = [
  { value: "top", label: "上" },
  { value: "bottom", label: "下" },
];
function toggleDisplayScript(): void {
  settings.setDisplayScriptEnabled(!settings.displayScriptEnabled);
}
function toggleShellCwdTracking(): void {
  settings.setShellCwdTracking(!settings.shellCwdTracking);
}

/** Enter で確定する。**IME の変換を確定する Enter では保存しない**（Safari は確定の keydown で isComposing が false なので keyCode も見る。`KeyInputController` と同じ）。 */
function onPathEnter(ev: KeyboardEvent): void {
  if (ev.isComposing || ev.keyCode === 229) return;
  commitNewCwdPath();
}

/**
 * 公式フック連携（20260923-agent-session-resume）。**このブラウザだけの設定ではない**——サーバ全体の設定
 * なので `useAgentIntegrationsStore` はサーバから読み書きする（他の節の localStorage 設定とは別枠）。
 */
const AGENT_INTEGRATION_KINDS: readonly { value: AgentIntegrationKind; label: string }[] = [
  { value: "claude", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  // 20260923-other-agents-session-resume。
  { value: "cursor", label: "Cursor Agent CLI" },
  { value: "copilot", label: "GitHub Copilot CLI" },
  { value: "devin", label: "Devin CLI" },
  { value: "droid", label: "Droid" },
  { value: "grok", label: "Grok CLI" },
  { value: "qwen", label: "Qwen Code" },
  { value: "qodercli", label: "Qoder CLI" },
];
/** 導入/解除の操作中は二重押しを防ぐ（対象の kind を持つ。どちらも同時には押せない設計で足りる）。 */
const agentIntegrationBusy = ref<AgentIntegrationKind | null>(null);
const agentIntegrationMessage = ref<string | null>(null);

async function toggleAgentIntegration(kind: AgentIntegrationKind, installed: boolean): Promise<void> {
  if (!actions || agentIntegrationBusy.value) return;
  agentIntegrationBusy.value = kind;
  try {
    const result = installed ? await actions.uninstallAgentIntegration(kind) : await actions.installAgentIntegration(kind);
    agentIntegrationMessage.value = result.ok ? result.message : (result.message ?? "操作に失敗しました");
  } finally {
    agentIntegrationBusy.value = null;
  }
}

/** 導入済みで足りないフックがある（`needsUpdate`）ときの［更新］。導入の入口が「足りない分だけ足す」ので、`install` を呼ぶ（20261004-subagent-display）。 */
async function updateAgentIntegration(kind: AgentIntegrationKind): Promise<void> {
  if (!actions || agentIntegrationBusy.value) return;
  agentIntegrationBusy.value = kind;
  try {
    const result = await actions.installAgentIntegration(kind);
    agentIntegrationMessage.value = result.ok ? (result.message ?? (kind === "claude" ? "更新しました。すでに動いている Claude Code は、起動し直すと新しいフックが効きます。" : "更新しました。")) : (result.message ?? "更新に失敗しました");
  } finally {
    agentIntegrationBusy.value = null;
  }
}

function toggleAgentIntegrationAutoResume(): void {
  const current = agentIntegrations.status?.autoResumeEnabled ?? true;
  void actions?.setAgentIntegrationAutoResume(!current);
}

/**
 * テーマ（20260921-theme-settings の design D4・decisions D11）。**選んだ時点で反映と保存**（確定ボタンを置かない。ほかの節と同じ）。取り消しは
 * 選び直し。部品はネイティブの `<select>`——Windows・Linux の Chrome では閉じたまま上下キーで値が変わり、そのたびに反映される（試し見のように
 * 働く）。自動の切替は VS Code・GitHub の形（切り替え 1 つ＋明るいとき・暗いとき）。
 */
const darkThemes = THEME_NAMES.filter((n) => THEME_APPEARANCE[n] === "dark");
const lightThemes = THEME_NAMES.filter((n) => THEME_APPEARANCE[n] === "light");
const themeLabel = (n: ThemeName): string => (n === DEFAULT_THEME_NAME ? `${THEME_LABELS[n]}（既定）` : THEME_LABELS[n]);
/** 明るいとき・暗いときの「既定」（まだ選んでいない間の値＝1 つのテーマの対。design D7）。 */
const themeSiblings = computed(() => siblingThemes(settings.theme));
/** いま使っているテーマ（AC7）。自動の切替が入っていれば、どちらの明暗で選んだかを添える。 */
const themeNowNote = computed(() => {
  const name = THEME_LABELS[settings.effectiveTheme];
  if (!settings.themeAuto) return `いま使っているテーマ：${name}`;
  return `いま使っているテーマ：${name}（OS の設定が${settings.systemDark ? "暗い" : "明るい"}ため）`;
});

/** 1 つのテーマを選ぶ。自動の切替が入っていれば切る（herdr と同じ。AC7）。 */
function chooseTheme(ev: Event): void {
  const v = (ev.target as HTMLSelectElement).value;
  if (isThemeName(v)) settings.setTheme(v);
}

function toggleThemeAuto(): void {
  settings.setThemeAuto(!settings.themeAuto);
}

/** 明るいとき・暗いときを選ぶ。先頭の「既定」（値は空）は null——1 つのテーマの対に戻り、また追従する。 */
function chooseThemeFor(which: "light" | "dark", ev: Event): void {
  const v = (ev.target as HTMLSelectElement).value;
  const name = isThemeName(v) ? v : null;
  if (which === "light") settings.setThemeLight(name);
  else settings.setThemeDark(name);
}

/**
 * 色の個別の上書き（20260922-theme-custom-overrides。herdr の `[theme.custom]` 相当。design「`SettingsDialog.vue`（変更）」）。
 * 押した色がそのまま反映・保存される（確定ボタンを置かない。既存の節と同じ）。「明るいとき」「暗いとき」の 2 層だけ持ち、
 * herdr の `.light`/`.dark` と違って自動切替の有無に関わらず、いま画面に当たっている明暗（`colorScheme`）で選ばれる（`ThemeController`
 * 側の decisions 参照）。
 */
const THEME_OVERRIDE_BUCKETS = ["light", "dark"] as const;
const bucketLabel = (b: ThemeOverrideBucket): string => (b === "light" ? "明るいとき" : "暗いとき");
const draftKey = (bucket: ThemeOverrideBucket, key: CssVar): string => `${bucket}:${key}`;

/** 各入力の draft（ローカルの文字列。`pathDraft` と同じ形）。上書き無しは空文字列。 */
const overrideDrafts = ref<Record<string, string>>({});
const overrideMessage = ref("");
const confirmingOverrideReset = ref(false);

/** 開くたびに保存値から始める（`pathDraft` と同じ）。 */
function syncOverrideDrafts(): void {
  const drafts: Record<string, string> = {};
  for (const bucket of THEME_OVERRIDE_BUCKETS)
    for (const key of CSS_VARS) drafts[draftKey(bucket, key)] = settings.themeOverrides[bucket][key] ?? "";
  overrideDrafts.value = drafts;
}

function isOverridden(bucket: ThemeOverrideBucket, key: CssVar): boolean {
  return settings.themeOverrides[bucket][key] !== undefined;
}

/** 確定（`change`／`Enter`）：空欄なら既定へ戻す、無効なら理由を示して元の値へ戻す、妥当なら反映・保存する（AC2・AC5・AC6）。 */
function commitOverride(bucket: ThemeOverrideBucket, key: CssVar): void {
  const dk = draftKey(bucket, key);
  const raw = (overrideDrafts.value[dk] ?? "").trim();
  if (raw === "") {
    if (!isOverridden(bucket, key)) return; // 既に上書き無し。メッセージを出さない
    settings.resetThemeOverride(bucket, key);
    overrideDrafts.value[dk] = "";
    overrideMessage.value = `「${CSS_VAR_LABELS[key]}」（${bucketLabel(bucket)}）の上書きを外しました。`;
    return;
  }
  if (!isValidCssColor(raw)) {
    overrideMessage.value = `「${CSS_VAR_LABELS[key]}」（${bucketLabel(bucket)}）：${raw} は色として読めません。`;
    overrideDrafts.value[dk] = settings.themeOverrides[bucket][key] ?? ""; // 元の値へ戻す（AC5）
    return;
  }
  settings.setThemeOverride(bucket, key, raw);
  overrideDrafts.value[dk] = raw;
  overrideMessage.value = `「${CSS_VAR_LABELS[key]}」（${bucketLabel(bucket)}）を ${raw} にしました。`;
}

/** IME の変換を確定する Enter では確定しない（`onPathEnter` と同じ）。 */
function onOverrideEnter(bucket: ThemeOverrideBucket, key: CssVar, ev: KeyboardEvent): void {
  if (ev.isComposing || ev.keyCode === 229) return;
  commitOverride(bucket, key);
}

/** 1 項目だけ既定へ戻す（AC6・AC-I4：ボタンが消えるので、フォーカスは同じ行の入力欄へ）。 */
function resetOverride(bucket: ThemeOverrideBucket, key: CssVar): void {
  settings.resetThemeOverride(bucket, key);
  const dk = draftKey(bucket, key);
  overrideDrafts.value[dk] = "";
  overrideMessage.value = `「${CSS_VAR_LABELS[key]}」（${bucketLabel(bucket)}）の上書きを外しました。`;
  void nextTick(() =>
    dialogEl.value?.querySelector<HTMLInputElement>(`[data-override-input="${dk}"]`)?.focus(),
  );
}

/** すべての上書きを既定へ戻す（取り消せないので、インラインの確認を挟む。「キー」節と同じ形）。 */
function askResetAllOverrides(): void {
  confirmingOverrideReset.value = true;
  void nextTick(() =>
    dialogEl.value?.querySelector<HTMLElement>("[data-confirm-no-overrides]")?.focus(),
  );
}

function endResetAllOverridesConfirm(): void {
  confirmingOverrideReset.value = false;
  void nextTick(() =>
    dialogEl.value?.querySelector<HTMLElement>("[data-reset-all-overrides]")?.focus(),
  );
}

function confirmResetAllOverrides(): void {
  settings.resetAllThemeOverrides();
  syncOverrideDrafts();
  overrideMessage.value = "すべての色の上書きを既定へ戻しました。";
  endResetAllOverridesConfirm();
}

/** はじめの案内を開き直す（20260926-settings-onboarding の AC6）。閉じる経路と同じく、打ちかけのパスを先に確定する（タスク点検 T5 の指摘）。 */
function openOnboarding(): void {
  commitNewCwdPath();
  view.openDialogWithContext({ kind: "onboarding" });
}

/** 画面の節（`.settings-body` の直下の `section[aria-labelledby]`）とその見出し。見出しの無い節は飛ばす。 */
function sectionHeadings(): { section: HTMLElement; heading: HTMLElement }[] {
  const out: { section: HTMLElement; heading: HTMLElement }[] = [];
  for (const section of Array.from(bodyEl.value?.querySelectorAll<HTMLElement>(":scope > section[aria-labelledby]") ?? [])) {
    const heading = document.getElementById(section.getAttribute("aria-labelledby") ?? "");
    if (heading) out.push({ section, heading });
  }
  return out;
}

/** 開くたびに、画面の節の見出しからメニューを作る（節を足せばメニューにも出る。見出しを 2 か所に書かない）。
 *  見出しにはプログラムからフォーカスできるよう `tabindex="-1"` を付ける（節「キー」の見出しは子のコンポーネントの中なので、外から付ける）。 */
function buildMenu(): void {
  const found = sectionHeadings();
  for (const { heading } of found) heading.setAttribute("tabindex", "-1");
  menuItems.value = found.map(({ heading }) => ({ id: heading.id, label: heading.textContent?.trim() ?? "" }));
}

/** `<dialog>`（スクロールの入れ物）の中での位置。`scrollTop` と同じ座標。 */
function topInDialog(el: Element, dialog: HTMLElement): number {
  return el.getBoundingClientRect().top - dialog.getBoundingClientRect().top - dialog.clientTop + dialog.scrollTop;
}

/** 題名の行の高さ＋その下の余白（`scroll-padding-top` の式と同じ高さ。その下が「見えている範囲」の上端）。 */
function headerHeightOf(dialog: HTMLElement): number {
  const header = dialog.querySelector<HTMLElement>(".settings-header");
  if (!header) return 0;
  return header.offsetHeight + (parseFloat(getComputedStyle(header).marginBottom) || 0);
}

function readSpyInput(found: { heading: HTMLElement }[]): SpyInput | null {
  const dialog = dialogEl.value;
  if (!dialog || found.length === 0) return null;
  return {
    tops: found.map(({ heading }) => topInDialog(heading, dialog)),
    scrollTop: dialog.scrollTop,
    viewHeight: dialog.clientHeight,
    scrollHeight: dialog.scrollHeight,
    headerHeight: headerHeightOf(dialog),
  };
}

/** フォーカスのある要素が入っている節の番号（どの節にも含まれない末尾の段落は最後の節）。`.settings-body` の外なら null。 */
function sectionOfElement(el: Element | null, found: { section: HTMLElement }[]): number | null {
  const body = bodyEl.value;
  if (!el || !body || !body.contains(el) || found.length === 0) return null;
  const at = found.findIndex(({ section }) => section.contains(el));
  return at >= 0 ? at : found.length - 1;
}

/** 今の節を計算し直す。**1 回の描画につき 1 回**（`schedule` でまとめる）。 */
function updateCurrent(): void {
  const dialog = dialogEl.value;
  const found = sectionHeadings();
  const input = readSpyInput(found);
  if (!dialog || !input) {
    current.value = -1;
    return;
  }
  const active = document.activeElement;
  const at = sectionOfElement(active, found);
  const focus = at !== null && active ? { section: at, top: topInDialog(active, dialog) } : null;
  chosen.value = keepChosen(chosen.value, input, focus);
  const next = chosen.value ?? sectionAtScroll(input);
  if (next !== current.value) {
    current.value = next;
    void nextTick(keepCurrentItemVisible);
  }
}

let frame: number | null = null;
let framePending = false;
function schedule(): void {
  if (typeof requestAnimationFrame !== "function") {
    updateCurrent();
    return;
  }
  if (framePending) return;
  framePending = true;
  frame = requestAnimationFrame(() => {
    framePending = false;
    updateCurrent();
  });
}

/** 今の節の項目が、メニュー（高さが足りないときはメニューの中がスクロールする）の中で見える位置にあるようにする。 */
function keepCurrentItemVisible(): void {
  const menu = menuEl.value;
  const item = menu?.children[current.value] as HTMLElement | undefined;
  if (!menu || !item || menu.scrollHeight <= menu.clientHeight) return;
  const margin = 8;
  if (item.offsetTop < menu.scrollTop + margin) menu.scrollTop = Math.max(0, item.offsetTop - margin);
  else if (item.offsetTop + item.offsetHeight > menu.scrollTop + menu.clientHeight - margin) {
    menu.scrollTop = item.offsetTop + item.offsetHeight - menu.clientHeight + margin;
  }
}

/** 本文の中にフォーカスが入った → その節を選んだ節にする（キーで部品を辿っても印が追従する）。 */
function onBodyFocusin(ev: FocusEvent): void {
  const at = sectionOfElement(ev.target as Element | null, sectionHeadings());
  if (at === null) return;
  chosen.value = at;
  schedule();
}

/** 利用者が自分でスクロールし始めたら、選んだ節を外す。**メニューの中で、メニューがスクロールできるときは外さない**（メニューだけが動く）。 */
function onUserScroll(ev: Event): void {
  const menu = menuEl.value;
  if (menu && ev.target instanceof Node && menu.contains(ev.target) && menu.scrollHeight > menu.clientHeight) return;
  if (chosen.value === null) return;
  chosen.value = null;
  schedule();
}

let narrowQuery: MediaQueryList | null = null;

/**
 * 幅が 768px を下回ってメニューが消えるとき、メニューにフォーカスがあったら今の節の見出しへ移す（消えた要素にフォーカスを残さない）。出るときは何もしない。
 * 判定は**そのときの実際のフォーカス**で行う: フォーカスがメニューの中にある、または、ブラウザが先に（メニューが見えなくなる拍に、あるいはウィンドウが
 * 非アクティブになって）行き先の無いままフォーカスを外していて（`activeElement` が `body`／`<dialog>` 自身）、直前までメニューにあった（`menuFocus`）。
 * 自分でメニューの外へ移した後は、`menuFocus` が消えているので奪わない。
 */
function onNarrowChange(ev: MediaQueryListEvent): void {
  if (!ev.matches) return;
  const dialog = dialogEl.value;
  const active = document.activeElement;
  const inMenu = active !== null && menuEl.value?.contains(active) === true;
  const lost = active === null || active === document.body || active === dialog;
  if (!inMenu && !(lost && menuFocus.value !== null)) return;
  menuFocus.value = null;
  const found = sectionHeadings();
  const at = Math.max(current.value, 0);
  const target = found[at];
  if (!dialog || !target) return;
  target.heading.focus({ preventScroll: true });
  // 見出しが見える範囲に無ければ、`go` と同じ位置へスクロールする（フォーカスだけ画面の外へ移さない）。
  const input = readSpyInput(found);
  const top = input?.tops[at];
  if (input && top !== undefined && (top < input.scrollTop + input.headerHeight - 2 || top >= input.scrollTop + input.viewHeight)) {
    dialog.scrollTop = scrollTopFor(at, input);
  }
}

let dialogObserver: ResizeObserver | null = null;
let bodyObserver: ResizeObserver | null = null;

/** `<dialog>` の見えている高さをメニューの `max-height` に渡す（`100vh` は iOS Safari でツールバーの分ずれるので使わない）。 */
function syncViewHeight(): void {
  const dialog = dialogEl.value;
  if (dialog) dialog.style.setProperty("--settings-view-h", `${dialog.clientHeight}px`);
}

function startObserving(): void {
  stopObserving(); // 開き直し・開いたままの切り替えで、前の監視が残って二重にならないように
  syncViewHeight();
  if (typeof window.matchMedia === "function") {
    narrowQuery = mobileViewportQuery();
    narrowQuery.addEventListener("change", onNarrowChange);
  }
  if (typeof ResizeObserver === "undefined") return; // 無い環境（単体テスト）では、開いたときの 1 回だけ
  dialogObserver = new ResizeObserver(() => {
    syncViewHeight();
    schedule();
  });
  if (dialogEl.value) dialogObserver.observe(dialogEl.value);
  bodyObserver = new ResizeObserver(schedule);
  if (bodyEl.value) bodyObserver.observe(bodyEl.value);
}

function stopObserving(): void {
  narrowQuery?.removeEventListener("change", onNarrowChange);
  narrowQuery = null;
  dialogObserver?.disconnect();
  bodyObserver?.disconnect();
  dialogObserver = null;
  bodyObserver = null;
  if (frame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
  frame = null;
  framePending = false;
}

onBeforeUnmount(stopObserving);

/**
 * その節へ移る。`chosen` を入れ（利用者が自分でスクロールするまで今の節にする）、見出しが題名の行のすぐ下に来る位置へ即時にスクロールし、
 * **見出しへフォーカスを移す**（節の最初の部品ではない。最初の部品は switch・ボタンで、続けて押した Space／Enter で設定が即保存されてしまう）。
 */
function go(i: number): void {
  const dialog = dialogEl.value;
  const found = sectionHeadings();
  const input = readSpyInput(found);
  const target = found[i];
  if (!dialog || !input || !target) return;
  chosen.value = i;
  current.value = i;
  dialog.scrollTop = scrollTopFor(i, input);
  target.heading.focus({ preventScroll: true });
  schedule();
  void nextTick(keepCurrentItemVisible);
}

/**
 * `Alt+PageDown`／`Alt+PageUp` で次・前の節へ移る（ask-form の目次と同じキー）。メニューが消えている幅でも効く。端では何もしないが、
 * `preventDefault` はする（`<select>` の値をブラウザが変えないように）。取り込み待ちの間は、取り込みの部品が先に keydown を受けて伝播を止めるので、ここへは届かない。
 */
function onDialogKeydown(ev: KeyboardEvent): void {
  if (!ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.isComposing) return;
  if (ev.key !== "PageDown" && ev.key !== "PageUp") return;
  ev.preventDefault();
  ev.stopPropagation();
  const count = sectionHeadings().length;
  if (count === 0) return;
  updateCurrent(); // 直前のフォーカス・スクロールの計算が、次の描画まで待っている間に押されても、今の節から数える
  const to = stepSection(Math.max(current.value, 0), ev.key === "PageDown" ? 1 : -1, count);
  if (to !== null) go(to);
}

/** メニューの中でフォーカスのある項目（無ければ null）。Tab の停止位置に使う。 */
const menuFocus = ref<number | null>(null);

function onMenuFocusin(ev: FocusEvent): void {
  const at = Array.from(menuEl.value?.children ?? []).indexOf(ev.target as Element);
  menuFocus.value = at >= 0 ? at : null;
}

/**
 * メニューからフォーカスが外れた。**行き先が無い（`relatedTarget` が null。要素が見えなくなった・ウィンドウが非アクティブになった）ときは
 * `menuFocus` を残す**（幅が狭くなる拍の判定に使う。`onNarrowChange`）。別の要素へ移ったときは外す（ダイアログの `focusin` も外す）。
 */
function onMenuFocusout(ev: FocusEvent): void {
  if (ev.relatedTarget instanceof Node && menuEl.value?.contains(ev.relatedTarget)) return; // 項目の間の移動
  if (ev.relatedTarget !== null) menuFocus.value = null;
}

/** メニューの外にフォーカスが入った → もうメニューにはいない。 */
function onDialogFocusin(ev: FocusEvent): void {
  if (ev.target instanceof Node && menuEl.value?.contains(ev.target)) return;
  menuFocus.value = null;
}

/** メニューの中の矢印キー。端で止まる（回り込まない）。 */
function onMenuKeydown(ev: KeyboardEvent): void {
  if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
  const items = Array.from(menuEl.value?.children ?? []) as HTMLElement[];
  const at = items.indexOf(ev.target as HTMLElement);
  if (at < 0) return;
  let to: number;
  if (ev.key === "ArrowDown") to = Math.min(items.length - 1, at + 1);
  else if (ev.key === "ArrowUp") to = Math.max(0, at - 1);
  else if (ev.key === "Home") to = 0;
  else if (ev.key === "End") to = items.length - 1;
  else return;
  ev.preventDefault();
  items[to]?.focus();
}

/** Tab の停止位置: メニューにフォーカスが無い間は今の節の項目だけ。ある間は、フォーカスのある項目だけ（矢印で動いた後の Tab がメニューの外へ出る）。 */
const menuStop = (i: number): number => (menuFocus.value !== null ? menuFocus.value : current.value) === i ? 0 : -1;

function cancel(): void {
  commitNewCwdPath(); // 「指定した場所」以外では入力欄が使えず、下書きは保存値のまま（開くたびに戻す）なので何もしない
  view.closeDialog();
}

/**
 * 節「キー」が取り込み待ちのとき（`KeySettings` の `v-model:capturing`）。**取り込み待ちの間はネイティブの `cancel`（Esc）で設定画面を閉じない**——
 * Esc は取り込みの取り消しで、取り込みの部品が keydown の段階で止める（Chromium は Esc の keydown の `preventDefault()` で `cancel` 自体が起きない）。
 * Firefox・Safari は未確認なので、ここでも念のため無視する（20260921-keybinding-customization の AC-I5）。
 */
const keysCapturing = ref(false);

function onNativeCancel(ev: Event): void {
  ev.preventDefault(); // 既定の close は `view` を更新しないので、こちらで閉じる
  if (keysCapturing.value) return;
  cancel();
}
</script>

<template>
  <dialog ref="dialogEl" class="settings-dialog" aria-labelledby="settings-title"
    @cancel="onNativeCancel"
    @click.self="cancel"
    @keydown="onDialogKeydown"
    @focusin="onDialogFocusin"
    @scroll.passive="schedule"
    @wheel.passive="onUserScroll"
    @touchmove.passive="onUserScroll"
  >
    <!-- ［閉じる］は確定ボタンではない（押した結果はその場で保存済み）。**モバイルには Esc キーが無く**、ダイアログが画面いっぱいだと
         背景のタップの余地も無いので、閉じる手段を画面に出す（review ラウンド1 の指摘。先例は HelpDialog の［閉じる］）。 -->
    <div class="settings-header">
      <h2 id="settings-title" class="settings-title">設定</h2>
      <button type="button" class="settings-close" @click="cancel">閉じる</button>
    </div>
    <!-- 左の列（幅 768px 以上だけ）。**入れ物は grid のセルいっぱいに伸ばす**——`@click.self` は `<dialog>` 自身が押されたときだけ閉じるので、
         メニューを直に grid の子にしてセルより短くすると、その下の空きを押して閉じてしまう。項目は右の節の見出しから作る（20261004-settings-side-menu の design）。 -->
    <div class="settings-menu-col">
      <nav v-if="menuItems.length > 0" ref="menuEl" class="settings-menu" aria-label="設定の節" @focusin="onMenuFocusin" @focusout="onMenuFocusout" @keydown="onMenuKeydown">
        <button
          v-for="(item, i) in menuItems"
          :key="item.id"
          type="button"
          class="settings-menu-item"
          :aria-current="i === current ? 'true' : undefined"
          :tabindex="menuStop(i)"
          @click="go(i)"
        >
          {{ item.label }}
        </button>
      </nav>
    </div>
    <div ref="bodyEl" class="settings-body" @focusin="onBodyFocusin">
    <section class="settings-section" aria-labelledby="settings-notify">
      <h3 id="settings-notify" class="settings-heading">通知</h3>
      <ul class="settings-list">
        <li class="settings-row">
          <button ref="firstSwitch" type="button" role="switch" class="settings-switch" :aria-checked="store.prefs.toast" @click="toggleToast">
            <span class="settings-mark">{{ store.prefs.toast ? "入" : "切" }}</span>
            <span>画面の中で知らせる</span>
          </button>
        </li>
        <li class="settings-row">
          <button
            type="button"
            role="switch"
            class="settings-switch"
            :aria-checked="store.prefs.desktop && desktopState === 'usable'"
            :disabled="desktopState === 'denied' || desktopState === 'unusable'"
            @click="toggleDesktop"
          >
            <span class="settings-mark">{{ store.prefs.desktop && desktopState === "usable" ? "入" : "切" }}</span>
            <span>OS の通知で知らせる</span>
          </button>
          <p v-if="desktopNote" class="settings-note">{{ desktopNote }}</p>
        </li>
        <li class="settings-row">
          <button
            type="button"
            role="switch"
            class="settings-switch"
            :aria-checked="store.prefs.sound && store.soundUsable"
            :disabled="!store.soundUsable"
            @click="toggleSound"
          >
            <span class="settings-mark">{{ store.prefs.sound && store.soundUsable ? "入" : "切" }}</span>
            <span>音で知らせる</span>
          </button>
          <p v-if="soundNote" class="settings-note">{{ soundNote }}</p>
        </li>
      </ul>
    </section>
    <section class="settings-section" aria-labelledby="settings-theme">
      <h3 id="settings-theme" class="settings-heading">テーマ</h3>
      <div class="settings-theme">
        <label class="settings-select-row">
          <span>テーマ</span>
          <select
            class="settings-select"
            :value="settings.theme"
            aria-describedby="settings-theme-auto-note settings-theme-note"
            @change="chooseTheme"
          >
            <optgroup label="暗いテーマ">
              <option v-for="n in darkThemes" :key="n" :value="n">{{ themeLabel(n) }}</option>
            </optgroup>
            <optgroup label="明るいテーマ">
              <option v-for="n in lightThemes" :key="n" :value="n">{{ themeLabel(n) }}</option>
            </optgroup>
          </select>
        </label>
        <button type="button" role="switch" class="settings-switch" :aria-checked="settings.themeAuto" @click="toggleThemeAuto">
          <span class="settings-mark">{{ settings.themeAuto ? "入" : "切" }}</span>
          <span>OS の明暗に合わせる</span>
        </button>
        <!-- 入れて出す欄は切り替えの**下**に置く（上に差し込むと、押した切り替え自身が下へずれて押し直しが外れる）。 -->
        <template v-if="settings.themeAuto">
          <p id="settings-theme-auto-note" class="settings-note">
            入れている間は「テーマ」を使いません。「テーマ」でほかのテーマを選ぶと、合わせるのをやめてそのテーマにします。
          </p>
          <label class="settings-select-row">
            <span>明るいとき</span>
            <select class="settings-select" :value="settings.themeLight ?? ''" @change="chooseThemeFor('light', $event)">
              <option value="">既定（{{ THEME_LABELS[themeSiblings.light] }}）</option>
              <optgroup label="明るいテーマ">
                <option v-for="n in lightThemes" :key="n" :value="n">{{ THEME_LABELS[n] }}</option>
              </optgroup>
              <optgroup label="暗いテーマ">
                <option v-for="n in darkThemes" :key="n" :value="n">{{ THEME_LABELS[n] }}</option>
              </optgroup>
            </select>
          </label>
          <label class="settings-select-row">
            <span>暗いとき</span>
            <select class="settings-select" :value="settings.themeDark ?? ''" @change="chooseThemeFor('dark', $event)">
              <option value="">既定（{{ THEME_LABELS[themeSiblings.dark] }}）</option>
              <optgroup label="暗いテーマ">
                <option v-for="n in darkThemes" :key="n" :value="n">{{ THEME_LABELS[n] }}</option>
              </optgroup>
              <optgroup label="明るいテーマ">
                <option v-for="n in lightThemes" :key="n" :value="n">{{ THEME_LABELS[n] }}</option>
              </optgroup>
            </select>
          </label>
        </template>
        <p id="settings-theme-note" class="settings-note" aria-live="polite">{{ themeNowNote }}</p>

        <details class="settings-theme-overrides">
          <summary>色の個別の上書き（上級者向け）</summary>
          <p class="settings-note">
            押した色がそのまま反映・保存されます。既定のコントラスト調整はかかりません。空欄にして確定すると既定へ戻ります。
          </p>
          <ul class="theme-override-list">
            <li v-for="key in CSS_VARS" :key="key" class="theme-override-row">
              <div class="theme-override-label">
                <code>{{ key }}</code>
                <span>{{ CSS_VAR_LABELS[key] }}</span>
              </div>
              <div v-for="bucket in THEME_OVERRIDE_BUCKETS" :key="bucket" class="theme-override-field">
                <span class="theme-override-bucket-label">{{ bucketLabel(bucket) }}</span>
                <input
                  type="text"
                  class="theme-override-input"
                  :data-override-input="draftKey(bucket, key)"
                  v-model="overrideDrafts[draftKey(bucket, key)]"
                  :aria-label="`「${CSS_VAR_LABELS[key]}」の${bucketLabel(bucket)}の色`"
                  autocomplete="off"
                  spellcheck="false"
                  @change="commitOverride(bucket, key)"
                  @keydown.enter="onOverrideEnter(bucket, key, $event)"
                />
                <button
                  v-if="isOverridden(bucket, key)"
                  type="button"
                  class="settings-btn"
                  :aria-label="`「${CSS_VAR_LABELS[key]}」の${bucketLabel(bucket)}を既定に戻す`"
                  @click="resetOverride(bucket, key)"
                >
                  既定に戻す
                </button>
              </div>
            </li>
          </ul>
          <button
            v-if="!confirmingOverrideReset"
            type="button"
            class="settings-btn"
            data-reset-all-overrides
            @click="askResetAllOverrides"
          >
            すべての上書きを既定に戻す
          </button>
          <div
            v-else
            class="theme-override-confirm"
            role="group"
            aria-label="すべての上書きを既定に戻す確認"
            @keydown.esc.stop.prevent="endResetAllOverridesConfirm"
          >
            <span>すべての色の上書きを既定へ戻します。取り消せません。</span>
            <button type="button" class="settings-btn" data-confirm-yes-overrides @click="confirmResetAllOverrides">
              戻す
            </button>
            <button type="button" class="settings-btn" data-confirm-no-overrides @click="endResetAllOverridesConfirm">
              やめる
            </button>
          </div>
          <p class="settings-note theme-override-message" role="status" aria-live="polite">{{ overrideMessage }}</p>
        </details>
      </div>
    </section>
    <section class="settings-section" aria-labelledby="settings-display">
      <h3 id="settings-display" class="settings-heading">表示</h3>
      <ul class="settings-list">
        <li class="settings-row">
          <button type="button" role="switch" class="settings-switch" :aria-checked="settings.statusSymbols" @click="toggleSymbols">
            <span class="settings-mark">{{ settings.statusSymbols ? "入" : "切" }}</span>
            <span>状態を記号でも示す</span>
          </button>
          <p class="settings-note">{{ symbolsNote }}</p>
        </li>
        <li class="settings-row">
          <fieldset class="settings-fieldset" aria-describedby="settings-pane-borders-note">
            <legend class="settings-legend">pane の枠の表示</legend>
            <label v-for="c in paneBordersChoices" :key="c.value" class="settings-radio">
              <input
                type="radio"
                name="settings-pane-borders"
                :value="c.value"
                :checked="settings.paneBorders === c.value"
                @change="choosePaneBorders(c.value)"
              />
              <span>{{ c.label }}</span>
            </label>
          </fieldset>
          <p id="settings-pane-borders-note" class="settings-note">
            余白の無い辺（枠を表示しないときの外周の辺と、隙間を切ったときの隣と接する辺）では、枠の右クリックでメニューを開けず、選択の強調も出ません。枠を表示しないときは名前の表示（ドラッグの掴み手）も出ません。メニューは選んでいる pane の枠へ Tab で移り、Enter で開けます。
          </p>
        </li>
        <li class="settings-row">
          <button
            type="button"
            role="switch"
            class="settings-switch"
            :aria-checked="settings.paneGaps"
            aria-describedby="settings-pane-borders-note"
            @click="togglePaneGaps"
          >
            <span class="settings-mark">{{ settings.paneGaps ? "入" : "切" }}</span>
            <span>pane の間に隙間を空ける</span>
          </button>
        </li>
        <li class="settings-row">
          <fieldset class="settings-fieldset">
            <legend class="settings-legend">pane の枠・隙間の太さ</legend>
            <label v-for="c in paneFrameChoices" :key="c.value" class="settings-radio">
              <input
                type="radio"
                name="settings-pane-frame-thickness"
                :value="c.value"
                :checked="settings.paneFrameThickness === c.value"
                @change="choosePaneFrameThickness(c.value)"
              />
              <span>{{ c.label }}</span>
            </label>
          </fieldset>
        </li>
        <li class="settings-row">
          <button type="button" role="switch" class="settings-switch" :aria-checked="settings.paneAgentNameVisible" @click="toggleAgentNameVisible">
            <span class="settings-mark">{{ settings.paneAgentNameVisible ? "入" : "切" }}</span>
            <span>pane にエージェント名を表示する</span>
          </button>
        </li>
        <li class="settings-row">
          <button type="button" role="switch" class="settings-switch" :aria-checked="settings.paneOuterBorders" @click="togglePaneOuterBorders">
            <span class="settings-mark">{{ settings.paneOuterBorders ? "入" : "切" }}</span>
            <span>pane 領域の外周の枠</span>
          </button>
        </li>
        <li class="settings-row">
          <label class="settings-select-row">
            <span>tab バーの位置</span>
            <select class="settings-select" :value="settings.tabBarPosition" @change="onTabBarPositionChange">
              <option v-for="p in TAB_BAR_POSITIONS" :key="p.value" :value="p.value">{{ p.label }}</option>
            </select>
          </label>
        </li>
        <li class="settings-row">
          <fieldset class="settings-fieldset tabbar-right-fieldset">
            <legend class="settings-legend">tab バー右端の表示</legend>
            <ul class="tabbar-right-list">
              <li v-for="(entry, index) in settings.tabBarRight" :key="index" class="tabbar-right-entry">
                <span class="tabbar-right-entry-kind">{{ entryKindLabel(entry.kind) }}</span>
                <select
                  v-if="entry.kind === 'datetime'"
                  class="settings-select"
                  :value="entry.format"
                  aria-label="日時の書式"
                  @change="onTabBarRightEntryFormatChange(index, $event)"
                >
                  <option v-for="f in DATETIME_FORMATS" :key="f.value" :value="f.value">{{ f.label }}</option>
                </select>
                <input
                  v-if="entry.kind === 'text'"
                  type="text"
                  class="settings-path"
                  aria-label="固定文字列"
                  :value="entry.text"
                  @change="onTabBarRightEntryTextChange(index, $event)"
                  @keydown.enter="onTabBarRightEntryTextEnter(index, $event)"
                />
                <button type="button" class="settings-btn" :disabled="index === 0" @click="moveTabBarRightEntry(index, -1)">上へ</button>
                <button
                  type="button"
                  class="settings-btn"
                  :disabled="index === settings.tabBarRight.length - 1"
                  @click="moveTabBarRightEntry(index, 1)"
                >
                  下へ
                </button>
                <button type="button" class="settings-btn" data-remove-entry @click="removeTabBarRightEntry(index, $event)">削除</button>
              </li>
            </ul>
            <div class="tabbar-right-add">
              <label class="settings-select-row">
                <span>追加する種類</span>
                <select v-model="newEntryKind" class="settings-select">
                  <option v-for="k in ENTRY_KINDS" :key="k.value" :value="k.value">{{ k.label }}</option>
                </select>
              </label>
              <button
                type="button"
                class="settings-btn"
                data-add-entry
                :disabled="settings.tabBarRight.length >= MAX_TAB_BAR_RIGHT_ENTRIES"
                @click="addTabBarRightEntry"
              >
                追加
              </button>
            </div>
            <label class="settings-select-row">
              <span>右端エントリの区切り文字</span>
              <input
                type="text"
                class="settings-path"
                aria-label="区切り文字"
                :value="settings.tabBarRightSeparator"
                @change="onTabBarRightSeparatorChange"
                @keydown.enter="onTabBarRightSeparatorEnter"
              />
            </label>
          </fieldset>
        </li>
        <!-- サイドバーの行の並び・見た目・条件（20260927-sidebar-row-tokens。herdr の [ui.sidebar.*].rows）。 -->
        <li class="settings-row">
          <SidebarRowsSettings />
        </li>
      </ul>
    </section>
    <section class="settings-section" aria-labelledby="settings-terminal">
      <h3 id="settings-terminal" class="settings-heading">端末</h3>
      <fieldset class="settings-fieldset">
        <legend class="settings-legend">scrollback（新しく開く pane から効きます）</legend>
        <label class="settings-radio">
          <input type="radio" name="settings-scrollback" value="auto" :checked="selectedScrollback === 'auto'" @change="chooseScrollback('auto')" />
          <span>自動（この端末では {{ formatLines(autoLines) }} 行）</span>
        </label>
        <label v-for="n in choices" :key="n" class="settings-radio">
          <input type="radio" name="settings-scrollback" :value="n" :checked="selectedScrollback === n" @change="chooseScrollback(n)" />
          <span>{{ formatLines(n) }} 行</span>
        </label>
      </fieldset>
      <fieldset class="settings-fieldset">
        <legend class="settings-legend">ファイルのリンクとドロップ（このブラウザだけの設定）</legend>
        <label v-for="c in fileLocalityChoices" :key="c.value" class="settings-radio">
          <input
            type="radio"
            name="settings-file-locality"
            :value="c.value"
            :checked="settings.fileLocality === c.value"
            @change="settings.setFileLocality(c.value)"
          />
          <span>{{ c.label }}</span>
        </label>
      </fieldset>
      <fieldset class="settings-fieldset">
        <legend class="settings-legend">新しく開く場所（workspace・tab・分割）</legend>
        <label v-for="c in newCwdChoices" :key="c.value" class="settings-radio">
          <input
            type="radio"
            name="settings-new-cwd"
            :value="c.value"
            :checked="settings.newCwdPolicy === c.value"
            @change="chooseNewCwd(c.value)"
          />
          <span>{{ c.label }}</span>
        </label>
        <input
          v-model="pathDraft"
          type="text"
          class="settings-path"
          aria-label="指定した場所のパス"
          aria-describedby="settings-path-note"
          placeholder="~/work"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          :disabled="settings.newCwdPolicy !== 'path'"
          @change="commitNewCwdPath"
          @keydown.enter="onPathEnter"
        />
        <p id="settings-path-note" class="settings-note">絶対パスか ~/ で始まるパス（~ だけならホーム）。使えない場所なら、代わりの場所で開いて知らせます。</p>
      </fieldset>
      <fieldset class="settings-fieldset" data-settings-display-panel-initial>
        <legend class="settings-legend">表示のパネルの初めの状態</legend>
        <label v-for="c in displayPanelInitialChoices" :key="c.value" class="settings-radio">
          <input
            type="radio"
            name="settings-display-panel-initial"
            :value="c.value"
            :checked="settings.displayPanelInitial === c.value"
            @change="settings.setDisplayPanelInitial(c.value)"
          />
          <span>{{ c.label }}</span>
        </label>
        <p class="settings-note">利用者がまだ開閉していない表示のパネルだけに効きます（プログラムが「たたんで始める」と指定した面はたたまれます）。</p>
      </fieldset>
      <fieldset class="settings-fieldset" data-settings-display-band-edge>
        <legend class="settings-legend">表示の帯の既定の場所</legend>
        <label v-for="c in displayBandEdgeChoices" :key="c.value" class="settings-radio">
          <input
            type="radio"
            name="settings-display-band-edge"
            :value="c.value"
            :checked="settings.displayBandEdge === c.value"
            @change="settings.setDisplayBandEdge(c.value)"
          />
          <span>{{ c.label }}</span>
        </label>
      </fieldset>
      <ul class="settings-list">
        <li class="settings-row">
          <button
            type="button"
            role="switch"
            class="settings-switch"
            :aria-checked="settings.shellCwdTracking"
            aria-describedby="settings-shell-cwd-note"
            @click="toggleShellCwdTracking"
          >
            <span class="settings-mark">{{ settings.shellCwdTracking ? "入" : "切" }}</span>
            <span>シェルの場所を追う（Windows）</span>
          </button>
          <p id="settings-shell-cwd-note" class="settings-note">
            Windows のサーバで、pane の PowerShell・cmd がプロンプトのたびに今の場所を知らせるようにします（cd した場所を再起動後も保ちます）。新しく開く pane から効きます。
          </p>
        </li>
        <li class="settings-row">
          <button
            type="button"
            role="switch"
            class="settings-switch"
            :aria-checked="settings.displayScriptEnabled"
            aria-describedby="settings-display-script-note"
            data-settings-display-script
            @click="toggleDisplayScript"
          >
            <span class="settings-mark">{{ settings.displayScriptEnabled ? "入" : "切" }}</span>
            <span>スクリプトが動く表示を許可する</span>
          </button>
          <p id="settings-display-script-note" class="settings-note">
            pane のプログラムや拡張が、スクリプトの動く表示（グラフなど）を出せるようになります。表示の中のスクリプトは、アプリや端末の中身には触れませんが、表示に見えているもの・表示に入力したものを外へ送れます。
            信頼できるプログラムだけを使うときに有効にしてください（既定は無効。無効にすると、出ている表示は閉じます）。
            この設定は、不注意やふつうのプログラムが出すのを防ぐものです。同じ OS の利用者で動くプログラムは、認証の情報を読めば自分で有効にできます（悪意のあるプログラムへの防御ではありません）。有効になると、つながっている画面に知らせます。詳しくは docs/display.md。
          </p>
        </li>
      </ul>
    </section>
    <section class="settings-section" aria-labelledby="settings-agent-integration">
      <h3 id="settings-agent-integration" class="settings-heading">エージェント連携</h3>
      <p class="settings-note">
        各エージェントの公式フックを使い、サーバの再起動後にその会話を自動で再開します。導入すると、
        そのエージェントの設定ファイルにフックが追加されます（Codex など: 1 つ。他の設定は変更しません）。
        <strong>Claude Code はフックが 6 つ</strong>入ります——会話の再開に加えて、エージェントが動かしているサブエージェントの表示に使います。
        足りないフックがあれば「更新が必要」と出るので、［更新］で足せます（押すまで設定ファイルは書き換えません）。
        更新と解除は、その後に起動した Claude Code から効きます（すでに動いているものは前のままです）。
        この設定は<strong>サーバ全体</strong>で共有されます（ほかの節と違い、ブラウザごとではありません）。
      </p>
      <ul class="settings-list">
        <li v-for="k in AGENT_INTEGRATION_KINDS" :key="k.value" class="settings-row agent-integration-row">
          <div class="agent-integration-label">
            <span>{{ k.label }}</span>
            <span class="settings-note agent-integration-status">
              <template v-if="!agentIntegrations.status">確認中…</template>
              <template v-else>
                {{ agentIntegrations.status.agents[k.value].installed ? "導入済み" : "未導入" }}
                <template v-if="agentIntegrations.status.agents[k.value].needsUpdate">（更新が必要）</template>
                <template v-if="!agentIntegrations.status.agents[k.value].cliDetected">（この PATH には見つかりません）</template>
              </template>
            </span>
          </div>
          <button
            v-if="agentIntegrations.status?.agents[k.value].needsUpdate"
            type="button"
            class="settings-btn agent-integration-update"
            :disabled="agentIntegrationBusy === k.value"
            :aria-label="`${k.label} のフックを更新する`"
            @click="updateAgentIntegration(k.value)"
          >
            更新
          </button>
          <button
            type="button"
            class="settings-btn"
            :disabled="!agentIntegrations.status || agentIntegrationBusy === k.value"
            @click="toggleAgentIntegration(k.value, agentIntegrations.status?.agents[k.value].installed ?? false)"
          >
            {{ agentIntegrations.status?.agents[k.value].installed ? "解除" : "導入" }}
          </button>
        </li>
        <li class="settings-row">
          <button
            type="button"
            role="switch"
            class="settings-switch"
            :aria-checked="agentIntegrations.status?.autoResumeEnabled ?? true"
            @click="toggleAgentIntegrationAutoResume"
          >
            <span class="settings-mark">{{ (agentIntegrations.status?.autoResumeEnabled ?? true) ? "入" : "切" }}</span>
            <span>サーバ再起動時に自動で再開する</span>
          </button>
        </li>
      </ul>
      <p v-if="agentIntegrationMessage" class="settings-note" role="status" aria-live="polite">{{ agentIntegrationMessage }}</p>
    </section>
    <KeySettings v-model:capturing="keysCapturing" :kind="kind" />
    <!-- はじめの案内を開き直す（20260926-settings-onboarding の AC6）。設定画面は自分の watch で閉じる（kind が変わるので）。 -->
    <p class="settings-reopen-onboarding">
      <button type="button" class="settings-reopen-button" data-open-onboarding @click="openOnboarding">はじめの案内を開く</button>
    </p>
    <p class="settings-hint">
      この設定はこのブラウザにだけ残ります（テーマは、このブラウザが操作している pane の色の問い合わせの答えにも使います）。Esc か「閉じる」で閉じます。
    </p>
    </div>
  </dialog>
</template>

<style scoped>
.settings-dialog {
  /* 狭い画面（幅 320〜385px の携帯）でもはみ出さない。以前の `min-width: 22em` は content-box で、枠と padding を含めて 386px になっていた。
     背が高くなった（いまは 6 節）ので、画面の高さも越えないようにして中をスクロールさせる（`overflow` は UA の `dialog:modal` の既定が auto）。
     **`100vh` ではなく `100%`**（モーダルの `<dialog>` の包含ブロックは見えている領域）——iOS Safari の `100vh` はツールバーを畳んだときの
     高さなので、ツールバーが出ている間はダイアログが画面から切れる。 */
  box-sizing: border-box;
  min-width: min(22em, calc(100% - 16px));
  max-width: min(34em, calc(100% - 16px));
  max-height: calc(100% - 16px);
  padding: 1em;
  /* 上の余白は題名の行（sticky）に持たせる——ダイアログの padding の内側で止まると、その上の帯を中身が透けて流れる。
     焦点が移ったときに行が題名の行の下に隠れないよう、スクロールの止まる位置も題名の行の分だけ下げる（WCAG 2.4.11。review ラウンド2）。 */
  padding-top: 0;
  scroll-padding-top: calc(1em + 2rem + 0.8em);
  /* 節「キー」の結果の文（下に固定）の分。フォーカスが移ったとき、その帯の下に隠れないよう、スクロールの止まる位置も上げる（WCAG 2.4.11）。 */
  scroll-padding-bottom: calc(1.4em + 1.3em + 0.6em);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-fg, #f8f8f2);
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 6px;
}
.settings-dialog::backdrop {
  background: var(--soda-backdrop, rgba(0, 0, 0, 0.4));
}
/* 左に節の一覧（サイドメニュー。20261004-settings-side-menu）。**スクロールの入れ物は `<dialog>` 自身のまま**——題名の行・節「キー」の下の帯・
   `scroll-padding`・既存の E2E がそれに依存する。そこで `<dialog>` の中を grid の 2 列にし、メニューを sticky にする。
   幅 767px 以下は 1 列のまま（メニューを出さない。`mobileViewportQuery()` と同じ式）。`--settings-view-h` は `<dialog>` の見えている高さ（script が入れる）。 */
.settings-dialog {
  --settings-menu-w: 13em;
  --settings-header-h: calc(1em + 2rem + 0.8em);
}
.settings-dialog[open] {
  display: grid;
  grid-template-columns: var(--settings-menu-w) minmax(0, 1fr);
  column-gap: 1em;
  align-content: start;
  /* 本文の幅（34em）に、メニューの幅と、列の間（`column-gap` の 1em）を足す。 */
  max-width: min(calc(34em + var(--settings-menu-w) + 1em), calc(100% - 16px));
}
.settings-dialog[open] > .settings-header {
  grid-column: 1 / -1;
}
.settings-menu-col {
  align-self: stretch;
}
.settings-menu {
  position: sticky;
  top: var(--settings-header-h);
  max-height: calc(var(--settings-view-h, 100dvh) - var(--settings-header-h) - 1em);
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 0.2em;
}
.settings-menu-item {
  flex: none;
  text-align: left;
  font: inherit;
  color: inherit;
  background: transparent;
  border: 0;
  border-left: 3px solid transparent;
  border-radius: 0 4px 4px 0;
  padding: 0.35em 0.7em;
  cursor: pointer;
}
/* メニューは `overflow-y: auto` で、外側の枠（UA の outline）は切れる。キーでフォーカスしたときは内側に枠を描く。 */
.settings-menu-item:focus-visible {
  outline: 2px solid var(--soda-focus, #8be9fd);
  outline-offset: -2px;
}
.settings-menu-item:hover {
  background: var(--soda-menu-hover, rgba(255, 255, 255, 0.08));
}
/* 今の節。色に頼らない（太字と左の線）。 */
.settings-menu-item[aria-current="true"] {
  font-weight: bold;
  border-left-color: currentColor;
}
.settings-body {
  min-width: 0;
}
/* 見出しへのフォーカス（節へ移った後）。**`:focus-visible` は使わない**——マウスで項目を押してプログラムから移したときは付かず、枠が出ない。
   見出しはプログラムからしかフォーカスされない。節「キー」の見出しは子のコンポーネントなので `:deep`。 */
.settings-body :deep(h3[tabindex="-1"]:focus) {
  outline: 2px solid var(--soda-focus, #8be9fd);
  outline-offset: 2px;
}
@media (max-width: 767px) {
  .settings-dialog[open] {
    display: block;
    max-width: min(34em, calc(100% - 16px));
  }
  .settings-menu-col {
    display: none;
  }
}
/* 題名の行（「閉じる」）は、ダイアログを下までスクロールしても見えるようにする——小さい画面では端末の節まで下げると流れてしまう。 */
.settings-header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1em;
  margin: 0 0 0.8em;
  padding-top: 1em;
  background: var(--soda-menu-bg, #282a36);
}
.settings-close {
  flex: none;
  min-height: 2rem;
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  padding: 0.2em 0.8em;
  cursor: pointer;
}
.settings-title {
  margin: 0;
  font-size: 1em; /* 見出しにしても大きさは以前の題名（<p>）のまま。UA の既定の h2（1.5em）にしない */
  font-weight: bold;
}
.settings-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.8em;
}
.settings-switch {
  display: flex;
  align-items: center;
  gap: 0.6em;
  width: 100%;
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  padding: 0.4em 0.6em;
  cursor: pointer;
  text-align: left;
}
.settings-switch:disabled {
  opacity: 0.5;
  cursor: default;
}
.settings-mark {
  flex: none;
  min-width: 2em;
  text-align: center;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 3px;
  padding: 0 0.2em;
}
.settings-switch[aria-checked="true"] .settings-mark {
  background: var(--soda-menu-active-bg, #44475a);
}
.settings-note {
  margin: 0.3em 0 0;
  font-size: 0.85em;
  opacity: 0.8;
}
.settings-reopen-onboarding {
  margin: 1em 0 0;
}
.settings-reopen-button {
  min-height: 2rem;
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  padding: 0.2em 0.8em;
  cursor: pointer;
}
.settings-section + .settings-section {
  margin-top: 1em;
}
.settings-heading {
  margin: 0 0 0.5em;
  font-size: 0.95em;
  font-weight: bold;
  opacity: 0.85;
}
.settings-fieldset {
  margin: 0;
  padding: 0;
  border: none;
  display: flex;
  flex-direction: column;
  gap: 0.3em;
}
.settings-legend {
  padding: 0;
  margin-bottom: 0.4em;
}
.settings-fieldset + .settings-fieldset {
  margin-top: 1em;
}
/* 見た目は UA の既定のまま（ほかの入力欄——`NameDialog` 等——と同じ）。背景を透かして枠を薄くすると、値が入って placeholder が
   消えたとき欄であることを示すのが薄い枠だけになる（WCAG 1.4.11）。 */
.settings-path {
  box-sizing: border-box;
  width: 100%;
  font: inherit;
  padding: 0.3em 0.5em;
}
.settings-radio {
  display: flex;
  align-items: center;
  gap: 0.5em;
  /* 押せる大きさ（WCAG 2.5.8 の最小 24px）。押し間違えると隣の値がその場で保存されるので、携帯では特に要る。 */
  min-height: 1.75rem;
  cursor: pointer;
}
.settings-theme {
  display: flex;
  flex-direction: column;
  gap: 0.5em;
}
/* 狭い画面では選択肢が次の行へ回り、全幅を使う（「既定（〈対の名前〉）」が切れない）。 */
.settings-select-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.3em 0.8em;
}
.settings-select-row > span {
  flex: none;
}
/* 見た目は UA の既定のまま（入力欄と同じ。color-scheme で明暗に合う）。押せる大きさは WCAG 2.5.8 の 24px 以上。 */
.settings-select {
  font: inherit;
  min-height: 1.75rem;
  max-width: 100%;
}
.settings-hint {
  margin: 1em 0 0;
  font-size: 0.85em;
  opacity: 0.7;
}
/* `KeySettings.vue` の `.keys-btn` と同じ見た目（`scoped` なので共有できず、値をそろえるだけ）。
 * 20260922-tabbar-pane-appearance（PR #12 から取り込み）・20260922-theme-custom-overrides の両方が使う。 */
.settings-btn {
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  padding: 0.15em 0.7em;
  min-height: 1.75rem;
  cursor: pointer;
}
.settings-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.agent-integration-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1em;
}
.agent-integration-label {
  display: flex;
  flex-direction: column;
  gap: 0.15em;
}
.agent-integration-status {
  margin: 0;
}
/* 「更新」は、右端の導入・解除のボタンの隣へ寄せる（行は両端寄せ）。 */
.agent-integration-update {
  margin-left: auto;
}
.tabbar-right-fieldset {
  margin: 0;
  padding: 0;
  border: none;
  display: flex;
  flex-direction: column;
  gap: 0.5em;
}
.tabbar-right-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4em;
}
.tabbar-right-entry {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4em;
}
.tabbar-right-entry-kind {
  flex: none;
  min-width: 6em;
}
.tabbar-right-add {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6em;
}
.settings-theme-overrides {
  margin-top: 0.8em;
}
.theme-override-list {
  list-style: none;
  margin: 0.5em 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5em;
}
.theme-override-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3em 0.8em;
  border-top: 1px solid var(--soda-menu-border, #44475a);
  padding-top: 0.5em;
}
.theme-override-label {
  flex: 1 1 12em;
  display: flex;
  flex-direction: column;
  gap: 0.1em;
}
.theme-override-label code {
  font-size: 0.85em;
  opacity: 0.8;
}
.theme-override-field {
  display: flex;
  align-items: center;
  gap: 0.3em;
}
.theme-override-bucket-label {
  font-size: 0.85em;
  opacity: 0.8;
}
.theme-override-input {
  box-sizing: border-box;
  width: 8em;
  font: inherit;
  font-family: monospace;
  padding: 0.15em 0.4em;
  min-height: 1.75rem;
}
.theme-override-confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4em 0.6em;
  margin-top: 0.5em;
}
.theme-override-message {
  min-height: 1.2em;
}
</style>
