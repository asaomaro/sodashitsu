<script setup lang="ts">
import { inject, ref } from "vue";
import { KeyInputControllerKey } from "../injection.js";

/**
 * 追加キーの列（04-mobile T3。design「追加キーの列」）。`Esc`・`Tab`・`Ctrl`・`Alt`・矢印・`PgUp`・`PgDn`・
 * `Prefix`。列自体の開閉（「キーボード」ボタン）は `MobileShell.vue`（T5）の責務——ここは列の中身だけ。
 *
 * `Ctrl`/`Alt` は `KeyInputController.setPendingModifier`（D84）を使う。**視覚状態（ボタンの強調表示）は
 * このコンポーネント内で管理する簡略化**——実際にソフトキーボードで 1 文字打って one-shot が消費された
 * 瞬間を `KeyInputController` から知らせてもらう仕組みが無いため、消費後もこの列の何かを次に押すまでは
 * ボタンが armed のまま表示されうる（Termux 等、類似のモバイル端末アプリにもある制約。decisions.md D84）。
 * `Ctrl`/`Alt` を両方 lock しているとき、`setPendingModifier` の `locked` は 2 つの修飾を区別しない
 * （どちらか一方でも lock なら両方 lock 扱いになる）——MVP としては許容する簡略化。
 */
const keys = inject(KeyInputControllerKey);
if (!keys) throw new Error("ExtraKeys: KeyInputControllerKey が provide されていません");

type ModifierState = "off" | "oneshot" | "locked";
const ctrlState = ref<ModifierState>("off");
const altState = ref<ModifierState>("off");

const LONG_PRESS_MS = 500;
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let longPressFired = false;

// `keys` を参照するので arrow function にする（`function` 宣言だと const 絞り込みが効かない。T23 で判明）。
const applyModifiers = (): void => {
  const ctrl = ctrlState.value !== "off";
  const alt = altState.value !== "off";
  const locked = ctrlState.value === "locked" || altState.value === "locked";
  keys.setPendingModifier(ctrl || alt ? { ctrl, alt } : null, { locked });
};

function resetOneShotAfterUse(): void {
  if (ctrlState.value === "oneshot") ctrlState.value = "off";
  if (altState.value === "oneshot") altState.value = "off";
  applyModifiers();
}

function stateRef(which: "ctrl" | "alt") {
  return which === "ctrl" ? ctrlState : altState;
}

function onModifierPointerDown(which: "ctrl" | "alt"): void {
  longPressFired = false;
  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => {
    longPressFired = true;
    stateRef(which).value = "locked";
    applyModifiers();
  }, LONG_PRESS_MS);
}

function onModifierPointerUp(which: "ctrl" | "alt"): void {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  if (longPressFired) return; // 長押しは pointerdown 側で既に処理済み
  const state = stateRef(which);
  state.value = state.value === "off" ? "oneshot" : "off"; // 短いタップは armed / 解除のトグル
  applyModifiers();
}

const injectSimpleKey = (key: string): void => {
  keys.injectKey({ key, code: key, ctrl: false, alt: false, shift: false, meta: false, type: "keydown", composing: false });
  resetOneShotAfterUse();
};

// Prefix ボタンは**いまの prefix**（設定で変えた prefix。20260921-keybinding-customization の AC11）を注入する。どのキーかは `KeyInputController.injectPrefix()` が Router から得る。
const injectPrefix = (): void => {
  keys.injectPrefix();
  resetOneShotAfterUse();
};
</script>

<template>
  <div class="extra-keys" role="toolbar" aria-label="追加キー">
    <button type="button" class="extra-keys-btn" @click="injectSimpleKey('Escape')">Esc</button>
    <button type="button" class="extra-keys-btn" @click="injectSimpleKey('Tab')">Tab</button>
    <button
      type="button"
      class="extra-keys-btn"
      :class="{ 'extra-keys-btn-active': ctrlState !== 'off' }"
      :aria-pressed="ctrlState !== 'off'"
      @pointerdown="onModifierPointerDown('ctrl')"
      @pointerup="onModifierPointerUp('ctrl')"
      @pointercancel="onModifierPointerUp('ctrl')"
    >
      Ctrl
    </button>
    <button
      type="button"
      class="extra-keys-btn"
      :class="{ 'extra-keys-btn-active': altState !== 'off' }"
      :aria-pressed="altState !== 'off'"
      @pointerdown="onModifierPointerDown('alt')"
      @pointerup="onModifierPointerUp('alt')"
      @pointercancel="onModifierPointerUp('alt')"
    >
      Alt
    </button>
    <button type="button" class="extra-keys-btn" @click="injectSimpleKey('ArrowUp')">↑</button>
    <button type="button" class="extra-keys-btn" @click="injectSimpleKey('ArrowDown')">↓</button>
    <button type="button" class="extra-keys-btn" @click="injectSimpleKey('ArrowLeft')">←</button>
    <button type="button" class="extra-keys-btn" @click="injectSimpleKey('ArrowRight')">→</button>
    <button type="button" class="extra-keys-btn" @click="injectSimpleKey('PageUp')">PgUp</button>
    <button type="button" class="extra-keys-btn" @click="injectSimpleKey('PageDown')">PgDn</button>
    <button type="button" class="extra-keys-btn" @click="injectPrefix">Prefix</button>
  </div>
</template>

<style scoped>
.extra-keys {
  display: flex;
  gap: 0.25em;
  padding: 0.4em;
  overflow-x: auto;
  background: var(--soda-menu-bg, #282a36);
  border-top: 1px solid var(--soda-menu-border, #44475a);
}
.extra-keys-btn {
  flex: 0 0 auto;
  min-width: 2.5em;
  padding: 0.5em 0.7em;
  font: inherit;
  color: var(--soda-fg, #f8f8f2);
  background: var(--soda-menu-active-bg, #44475a);
  border: none;
  border-radius: 4px;
  touch-action: manipulation;
}
.extra-keys-btn-active {
  color: var(--soda-accent-fg, #f8f8f2);
  background: var(--soda-accent, #6070a1);
}
</style>
