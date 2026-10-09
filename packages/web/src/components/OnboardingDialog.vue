<script setup lang="ts">
import { DEFAULT_THEME_NAME, THEME_APPEARANCE, THEME_NAMES, type ThemeName } from "@sodashitsu/protocol";
import { computed, inject, nextTick, ref, watch } from "vue";
import { DeviceKindKey, NotificationControllerKey } from "../injection.js";
import { applyRecommended } from "@sodashitsu/client-core";
import { KEY_PRESETS } from "@sodashitsu/client-core";
import { isMobileViewport } from "../mobile/detect.js";
import type { DesktopPermission } from "../notify/ports.js";
import type { NotifyPrefs } from "@sodashitsu/client-core";
import { useNotificationsStore } from "../store/notifications.js";
import { useOnboardingStore } from "../store/onboarding.js";
import { useSettingsStore } from "../store/settings.js";
import { useViewStore } from "../store/view.js";
import { THEME_LABELS } from "@sodashitsu/client-core";

/**
 * はじめの案内（20260926-settings-onboarding。herdr の onboarding）。`view.dialogContext.kind === "onboarding"` を扱う。
 * 形は `SettingsDialog` と同じ（ネイティブ `<dialog>` ＋ `showModal()` ＋ `@cancel` の抑止）。
 * **背景のクリックでは閉じない**（初回の案内を誤って消費しない。herdr も外側のクリックを無視する。AC-I1）。
 *
 * 選択は**下書き**で持ち、［この設定ではじめる］で**開いたときから変えたものだけ**を設定画面と同じ setter で反映する（AC3・AC-I2）。
 * 即座に効かないので、通知は `role="switch"`（APG では即座に効くもの）ではなく checkbox にする。
 */
const view = useViewStore();
const onboarding = useOnboardingStore();
const settings = useSettingsStore();
const notifications = useNotificationsStore();
const controller = inject(NotificationControllerKey);
// `SettingsDialog.vue` と同じ流儀（握りつぶすと、OS 通知の許可が黙って効かなくなる）。
if (!controller)
  throw new Error("OnboardingDialog: NotificationControllerKey が provide されていません");

/**
 * 指で操作する端末（`client.hello` の kind と同じ判定）ではキーのプリセットを出さない（画面のキーボードでは組み合わせのキーを使えない。
 * decisions D5）。既定値つきで受ける（`SettingsDialog.vue` と同じ）。
 */
const kind = inject(DeviceKindKey, "desktop");
const isTouchDevice = kind === "mobile";
/**
 * 1 列の画面（`MobileShell`。`App.vue` と同じ画面幅の判定）では、サイドバーの代わりに上のバーを案内する。
 * **`kind` とは別の軸**——狭くしたデスクトップの窓は 1 列、幅の広いタブレットはデスクトップの配置になる（cross 点検の指摘。D9）。
 */
const narrow = isMobileViewport();

/**
 * 主要な操作の入口（herdr の「ctrl+b enters prefix mode · ? shows keybinds and settings」）。**現在の割り当て**で書き、
 * 割り当てが無い操作は全体メニューの経路を書く（AC7。`ContextMenu.vue` の全体メニューに「キー割り当て」「設定」がある）。
 */
const helpHow = computed(() => {
  const key = settings.keymap.hintFor("help");
  return key === null ? "サイドバーの［メニュー］→「キー割り当て」" : key;
});
const settingsHow = computed(() => {
  const key = settings.keymap.hintFor("settings");
  return key === null ? "サイドバーの［メニュー］→「設定」" : key;
});

const NO_PRESET = "none";
interface Draft {
  theme: ThemeName;
  preset: string;
  toast: boolean;
  desktop: boolean;
  sound: boolean;
}

/** 許可の状態は reactive ではないので、開いたときに読み直す（`SettingsDialog.vue` の `permission` と同じ事情）。 */
const permission = ref<DesktopPermission>(controller.desktopPermission());

function currentDraft(): Draft {
  return {
    theme: settings.theme,
    preset: NO_PRESET,
    toast: notifications.prefs.toast,
    desktop: notifications.prefs.desktop && permission.value === "granted",
    sound: notifications.prefs.sound,
  };
}
const draft = ref<Draft>(currentDraft());
/** 開いたときの下書き。確定ではこれと違う項目だけを反映する（開き直して何も変えずに確定しても保存値は動かない）。 */
let initial: Draft = { ...draft.value };
/**
 * テーマの欄に触ったか。「OS の明暗に合わせる」が入っている間は、同じテーマを選び直しても確定で「そのテーマにする」
 * （設定画面の「テーマ」で選ぶのと同じく合わせるのをやめる）。値の比較だけだと選び直しが無視される（タスク点検 T3 の指摘）。
 */
const themeTouched = ref(false);

const darkThemes = THEME_NAMES.filter((n) => THEME_APPEARANCE[n] === "dark");
const lightThemes = THEME_NAMES.filter((n) => THEME_APPEARANCE[n] === "light");
const themeLabel = (n: ThemeName): string =>
  n === DEFAULT_THEME_NAME ? `${THEME_LABELS[n]}（既定）` : THEME_LABELS[n];

const desktopBlocked = computed(
  () =>
    !notifications.desktopUsable ||
    permission.value === "denied" ||
    permission.value === "unsupported",
);
const desktopNote = computed(() => {
  if (!notifications.desktopUsable || permission.value === "unsupported")
    return "この環境では使えません（ブラウザが対応していないか、この画面からは出せません）。";
  if (permission.value === "denied")
    return "ブラウザで拒否されています。許可するにはブラウザの設定から変えてください。";
  if (permission.value === "default") return "選んではじめると、ブラウザが許可を求めます。";
  return "";
});

const dialogEl = ref<HTMLDialogElement | null>(null);
const titleEl = ref<HTMLElement | null>(null);

/**
 * 起動時に 1 回だけ開く。**接続が最初に open になってから**（端末にフォーカスが入った後に `showModal()` すると、閉じたときに
 * `<dialog>` が端末へフォーカスを戻す。design D6）。ほかのダイアログが開いている間は待ち、閉じたら開く。
 */
function startupReady(): boolean {
  return (
    onboarding.pendingAtStartup &&
    !onboarding.startupOpened &&
    view.connectionState === "open" &&
    view.openDialog === null
  );
}
watch(
  () =>
    [
      onboarding.pendingAtStartup,
      onboarding.startupOpened,
      view.connectionState,
      view.openDialog,
    ] as const,
  () => {
    if (!startupReady()) return;
    void nextTick(() => {
      if (!startupReady()) return;
      onboarding.markStartupOpened();
      view.openDialogWithContext({ kind: "onboarding" });
    });
  },
  { immediate: true },
);

watch(
  () => view.dialogContext,
  (ctx) => {
    if (ctx?.kind === "onboarding") {
      permission.value = controller.desktopPermission();
      draft.value = currentDraft(); // 開くたびに現在の設定から始める（AC6）
      initial = { ...draft.value };
      themeTouched.value = false;
      void nextTick(() => {
        dialogEl.value?.showModal();
        // 内容が大きいダイアログは先頭の静的な要素（見出し）へ（WAI-ARIA APG の Dialog (Modal) Pattern。research F13）。
        titleEl.value?.focus();
      });
    } else {
      dialogEl.value?.close();
    }
  },
  // 置き直されたとき（開いている間にログイン画面へ切り替わり、戻った等）も、開いている状態なら描き直す——でないと
  // `view.openDialog` だけが残り、KeyRouter が dialog モードのまま見えない案内にキーを食われる（review ラウンド 1）。
  { immediate: true },
);

/** スキップ（［スキップ］・Esc）。何も反映せず、案内済みにだけする（AC4・AC-I2）。 */
function skip(): void {
  onboarding.markDone();
  view.closeDialog();
}

/** 選んだプリセットの一式を足す（設定画面の［足す］と同じ。`KeySettings.vue` の `addPreset`）。 */
function applyPreset(id: string): void {
  const preset = KEY_PRESETS.find((p) => p.id === id);
  if (!preset) return;
  const r = applyRecommended(settings.keymap, settings.keyPrefs, preset.bindings);
  settings.replaceKeyPrefs(r.prefs);
  if (r.skipped.length > 0)
    view.toast(
      `${preset.label}のうち ${r.skipped.length} 個は、ほかの割り当てと重なるなどの理由で足しませんでした（設定の「キー」で確かめられます）。`,
    );
}

/**
 * 確定。**利用者の操作の勢いが要る呼び出し（OS 通知の許可・音の自動再生の解除）を先に、同期で**行う（AC9）。
 * 許可の答えは閉じたあとに届くので、拒否されたらトーストで知らせる。
 */
function confirm(): void {
  const d = { ...draft.value };
  const patch: Partial<NotifyPrefs> = {};
  let asking: Promise<DesktopPermission> | null = null;
  if (d.desktop !== initial.desktop) {
    if (!d.desktop) patch.desktop = false;
    else if (controller!.desktopPermission() === "granted") patch.desktop = true;
    else asking = controller!.requestDesktopPermission();
  }
  if (d.sound !== initial.sound) {
    if (d.sound) controller!.unlockSound();
    patch.sound = d.sound;
  }
  if (d.toast !== initial.toast) patch.toast = d.toast;
  if (Object.keys(patch).length > 0) notifications.setPrefs(patch);
  if (d.theme !== initial.theme || (themeTouched.value && settings.themeAuto))
    settings.setTheme(d.theme);
  if (d.preset !== NO_PRESET) applyPreset(d.preset);
  controller!.markHintAnswered();
  onboarding.markDone();
  view.closeDialog();
  if (asking)
    void asking.then((p) => {
      if (p === "granted") notifications.setPrefs({ desktop: true });
      else
        view.toast(
          p === "denied"
            ? "OS の通知はブラウザで拒否されたため入れませんでした（ブラウザのサイトの設定で許可したあと、設定の「通知」で入れられます）。"
            : "OS の通知は許可されなかったため入れませんでした（設定の「通知」で、もう一度許可を求められます）。",
        );
    });
}

function onNativeCancel(ev: Event): void {
  ev.preventDefault(); // 既定の close は `view` を更新しないので、こちらで閉じる
  skip();
}
</script>

<template>
  <dialog
    ref="dialogEl"
    class="onboarding-dialog"
    aria-labelledby="onboarding-title"
    @cancel="onNativeCancel"
  >
    <h2 id="onboarding-title" ref="titleEl" class="onboarding-title" tabindex="-1">
      soda へようこそ
    </h2>
    <p class="onboarding-lead">
      コーディングエージェントのための、ブラウザで使う端末のワークスペースです。
    </p>
    <ul v-if="!narrow" class="onboarding-intro" data-onboarding-intro>
      <li data-onboarding-mouse>
        サイドバーのクリックで workspace を切り替え、pane
        の境界のドラッグで大きさを変え、右クリックでメニューを開けます。
      </li>
      <li data-onboarding-keys>
        <kbd>{{ settings.keymap.prefix }}</kbd> で prefix（続けて押すキーで操作）・{{
          helpHow
        }}
        でキー一覧・{{ settingsHow }} で設定を開けます。
      </li>
    </ul>
    <ul v-else class="onboarding-intro" data-onboarding-intro>
      <li>上のバーで workspace・pane を選び、［設定］から設定を開けます。</li>
    </ul>
    <label class="onboarding-row">
      <span class="onboarding-label">テーマ</span>
      <select
        v-model="draft.theme"
        class="onboarding-select"
        data-onboarding-theme
        :aria-describedby="settings.themeAuto ? 'onboarding-theme-auto-note' : undefined"
        @change="themeTouched = true"
      >
        <optgroup label="暗いテーマ">
          <option v-for="n in darkThemes" :key="n" :value="n">{{ themeLabel(n) }}</option>
        </optgroup>
        <optgroup label="明るいテーマ">
          <option v-for="n in lightThemes" :key="n" :value="n">{{ themeLabel(n) }}</option>
        </optgroup>
      </select>
    </label>
    <p v-if="settings.themeAuto" id="onboarding-theme-auto-note" class="onboarding-note">
      いまは OS
      の明暗に合わせています。ここでテーマを選んではじめると、合わせるのをやめてそのテーマにします。
    </p>
    <fieldset v-if="!isTouchDevice" class="onboarding-fieldset" data-onboarding-presets>
      <legend>キーのプリセット</legend>
      <label class="onboarding-choice">
        <input v-model="draft.preset" type="radio" name="onboarding-preset" :value="NO_PRESET" />
        <span>使わない（既定のキーだけ）</span>
      </label>
      <label v-for="p in KEY_PRESETS" :key="p.id" class="onboarding-choice">
        <input v-model="draft.preset" type="radio" name="onboarding-preset" :value="p.id" />
        <span>{{ p.label }}</span>
      </label>
    </fieldset>
    <fieldset class="onboarding-fieldset" data-onboarding-notify>
      <legend>エージェントの入力待ち・完了の知らせ</legend>
      <label class="onboarding-choice">
        <input v-model="draft.toast" type="checkbox" data-notify="toast" />
        <span>画面の中で知らせる</span>
      </label>
      <label class="onboarding-choice">
        <input
          v-model="draft.desktop"
          type="checkbox"
          data-notify="desktop"
          :disabled="desktopBlocked"
          :aria-describedby="desktopNote ? 'onboarding-desktop-note' : undefined"
        />
        <span>OS の通知で知らせる</span>
      </label>
      <p v-if="desktopNote" id="onboarding-desktop-note" class="onboarding-note">
        {{ desktopNote }}
      </p>
      <label class="onboarding-choice">
        <input
          v-model="draft.sound"
          type="checkbox"
          data-notify="sound"
          :disabled="!notifications.soundUsable"
        />
        <span>音で知らせる</span>
      </label>
    </fieldset>
    <p class="onboarding-note-block">
      エージェント連携（会話の自動再開）は、設定の「エージェント連携」で入れられます。選んだ内容はこのブラウザにだけ残ります。
      あとから設定で変えられ、この案内も設定から開き直せます。
    </p>
    <div class="onboarding-actions">
      <button type="button" class="onboarding-button" data-onboarding-skip @click="skip">
        スキップ
      </button>
      <button
        type="button"
        class="onboarding-button onboarding-primary"
        data-onboarding-confirm
        @click="confirm"
      >
        この設定ではじめる
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.onboarding-dialog {
  /* 寸法は設定画面（`SettingsDialog.vue` の `.settings-dialog`）と同じ——狭い画面でもはみ出さず、背が高ければ中をスクロールする。 */
  box-sizing: border-box;
  min-width: min(22em, calc(100% - 16px));
  max-width: min(34em, calc(100% - 16px));
  max-height: calc(100% - 16px);
  padding: 1em;
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-fg, #f8f8f2);
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius-l);
}
.onboarding-dialog::backdrop {
  background: var(--soda-backdrop, rgba(0, 0, 0, 0.4));
}
.onboarding-title {
  margin: 0 0 0.3em;
  font-size: 1.1em;
  font-weight: bold;
}
.onboarding-lead {
  margin: 0 0 0.8em;
  opacity: 0.85;
}
.onboarding-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6em;
  margin: 0 0 0.8em;
}
.onboarding-select {
  font: inherit;
  min-height: 2rem;
}
.onboarding-fieldset {
  margin: 0 0 0.8em;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius);
  padding: 0.4em 0.8em 0.6em;
}
.onboarding-choice {
  display: flex;
  align-items: center;
  gap: 0.5em;
  min-height: 2rem;
}
.onboarding-note {
  margin: 0 0 0.3em 1.8em;
  font-size: 0.85em;
  opacity: 0.8;
}
.onboarding-intro {
  margin: 0 0 0.8em;
  padding-left: 1.2em;
  display: flex;
  flex-direction: column;
  gap: 0.3em;
}
.onboarding-intro kbd {
  font: inherit;
  font-weight: bold;
}
.onboarding-note-block {
  margin: 0;
  font-size: 0.85em;
  opacity: 0.8;
}
.onboarding-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.6em;
  margin-top: 1em;
}
.onboarding-button {
  min-height: 2rem;
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius);
  padding: 0.2em 0.8em;
  cursor: pointer;
}
.onboarding-primary {
  background: var(--soda-accent, #6070a1);
  color: var(--soda-accent-fg, #f8f8f2);
  border-color: var(--soda-accent, #6070a1);
}
</style>
