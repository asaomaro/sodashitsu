<script setup lang="ts">
/**
 * グラフから pane を足すフォーム（20261008-graph-first の PR3 T14c）。囲いの「＋」・ツールバーの「＋ pane」から開く。面の上の層（モーダルではない）で、囲いの下に置く。
 * 送るもの（`submit`）は**種類の id と名前と「監督の線を結ぶか」だけ**——任意のコマンドの文字列を入れる欄は無い（D84。サーバへは `kind` と `name` だけが `agent.start` で送られる）。
 * キー: Esc・［取りやめ］・外を押す、で閉じる（呼び出した「＋」へフォーカスを戻すのは親）。ここのキーは外（グラフのキー・prefix）へ渡さない。
 */
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { isValidAgentName } from "@sodashitsu/protocol";

export interface AddFormKind {
  kind: string;
  label: string;
  available: boolean;
}
export interface AddFormSubmit {
  /** `"shell"` か、エージェントの種類の id。 */
  kind: string;
  name: string;
  supervise: boolean;
}

const props = defineProps<{
  workspaceTitle: string;
  /** `agent.kinds` の結果。取得中・取得できなかったときは null（エージェントの選択肢は出さない）。 */
  kinds: readonly AddFormKind[] | null;
  /** 監督役にできるノードの名前（エージェントを足すとき、選んでいるノード）。無ければ項目を出さない。 */
  supervisorName: string | null;
  /** 足している最中の説明（「pane を足しています…」など）。null なら操作できる。 */
  busyText: string | null;
  /** 直前の失敗の理由。 */
  error: string | null;
  /** 画面の位置（親が計算する。キャンバスの左上からの px）。 */
  x: number;
  y: number;
  /** 前の試みで pane は足せた（やり直しは、起動だけ）。 */
  retrying: boolean;
}>();
const emit = defineEmits<{ submit: [AddFormSubmit]; cancel: [] }>();

const KIND_MAIN = ["claude", "codex"] as const;
const choice = ref<"shell" | "claude" | "codex" | "other">("shell");
const otherKind = ref("");
const name = ref("");
const supervise = ref(true);
const root = ref<HTMLElement | null>(null);

const available = (k: string): boolean => props.kinds?.find((x) => x.kind === k)?.available === true;
const labelOf = (k: string): string => props.kinds?.find((x) => x.kind === k)?.label ?? k;
const others = computed(() => (props.kinds ?? []).filter((k) => !(KIND_MAIN as readonly string[]).includes(k.kind)));
const agentKind = computed<string | null>(() => {
  if (choice.value === "shell") return null;
  if (choice.value === "other") return otherKind.value === "" ? null : otherKind.value;
  return choice.value;
});
const isAgent = computed(() => choice.value !== "shell");
const nameInvalid = computed(() => isAgent.value && name.value !== "" && !isValidAgentName(name.value));
const canSubmit = computed(() => props.busyText === null && !nameInvalid.value && (choice.value === "shell" || (agentKind.value !== null && available(agentKind.value))));

watch(otherKind, () => {
  if (otherKind.value !== "") choice.value = "other";
});

function submit(): void {
  if (!canSubmit.value) return;
  emit("submit", {
    kind: agentKind.value ?? "shell",
    name: isAgent.value ? name.value : "",
    supervise: isAgent.value && props.supervisorName !== null && supervise.value,
  });
}
function onKeydown(ev: KeyboardEvent): void {
  if (ev.isComposing) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    emit("cancel");
  } else if (ev.key === "Enter" && (ev.target as HTMLElement).tagName !== "BUTTON" && (ev.target as HTMLElement).tagName !== "SELECT") {
    ev.preventDefault();
    submit();
  } else if (ev.key === "Tab") {
    // フォームの中で回る
    const els = [...(root.value?.querySelectorAll<HTMLElement>("input:not(:disabled), select:not(:disabled), button:not(:disabled)") ?? [])];
    if (els.length === 0) return;
    const i = els.indexOf(document.activeElement as HTMLElement);
    const next = ev.shiftKey ? els[(i <= 0 ? els.length : i) - 1] : els[(i + 1) % els.length];
    ev.preventDefault();
    next?.focus();
  }
  ev.stopPropagation();
}
onMounted(() => void nextTick(() => root.value?.querySelector<HTMLElement>("input[type=radio]:checked")?.focus({ preventScroll: true })));
</script>

<template>
  <div
    ref="root"
    class="graph-add-form"
    role="dialog"
    aria-modal="false"
    :aria-label="`${workspaceTitle} に pane を足す`"
    data-graph-add-form
    :style="{ left: `${x}px`, top: `${y}px` }"
    @keydown="onKeydown"
    @pointerdown.stop
    @wheel.stop
  >
    <p class="graph-add-title">{{ workspaceTitle }} に足す</p>
    <fieldset class="graph-add-kinds" :disabled="busyText !== null || retrying">
      <legend class="graph-add-legend">種類</legend>
      <label><input v-model="choice" type="radio" name="graph-add-kind" value="shell" data-add-kind="shell" /> シェル</label>
      <label :class="{ 'graph-add-na': kinds !== null && !available('claude') }">
        <input v-model="choice" type="radio" name="graph-add-kind" value="claude" data-add-kind="claude" :disabled="!available('claude')" /> {{ labelOf("claude") }}
      </label>
      <label :class="{ 'graph-add-na': kinds !== null && !available('codex') }">
        <input v-model="choice" type="radio" name="graph-add-kind" value="codex" data-add-kind="codex" :disabled="!available('codex')" /> {{ labelOf("codex") }}
      </label>
      <label v-if="others.length > 0" class="graph-add-other">
        <input v-model="choice" type="radio" name="graph-add-kind" value="other" data-add-kind="other" :disabled="otherKind === ''" />
        <select v-model="otherKind" aria-label="ほかのエージェント" data-add-other>
          <option value="">ほかのエージェント…</option>
          <option v-for="k in others" :key="k.kind" :value="k.kind" :disabled="!k.available">{{ k.label }}{{ k.available ? "" : "（見つかりません）" }}</option>
        </select>
      </label>
    </fieldset>
    <label v-if="isAgent" class="graph-add-name">
      名前（空なら自動）
      <input v-model="name" type="text" maxlength="32" spellcheck="false" autocomplete="off" :disabled="busyText !== null || retrying" :aria-invalid="nameInvalid" data-add-name />
    </label>
    <p v-if="nameInvalid" class="graph-add-error" role="alert">名前は英小文字で始め、英小文字・数字・_・- で 32 文字までです。</p>
    <label v-if="isAgent && supervisorName !== null" class="graph-add-supervise">
      <input v-model="supervise" type="checkbox" :disabled="busyText !== null" data-add-supervise /> 監督の線を結ぶ（{{ supervisorName }} が監督）
    </label>
    <p v-if="busyText !== null" class="graph-add-busy" role="status">{{ busyText }}</p>
    <p v-if="error !== null" class="graph-add-error" role="alert" data-add-error>{{ error }}</p>
    <div class="graph-add-actions">
      <button type="button" class="graph-add-cancel" :disabled="busyText !== null" @click="emit('cancel')">取りやめ</button>
      <button type="button" class="graph-add-submit" :disabled="!canSubmit" data-add-submit @click="submit">{{ retrying ? "もう一度起動する" : "足して、端末を開く" }}</button>
    </div>
  </div>
</template>

<style scoped>
.graph-add-form {
  position: absolute;
  z-index: 30;
  box-sizing: border-box;
  width: 280px;
  padding: var(--soda-shape-pad, 10px);
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius-l, 6px);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  box-shadow: var(--soda-shape-shadow, none);
  font-size: 12px;
}
.graph-add-title {
  margin: 0;
  font-weight: bold;
}
.graph-add-kinds {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  border: 0;
}
.graph-add-legend {
  padding: 0;
  opacity: 0.75;
}
.graph-add-na {
  font-style: italic;
}
.graph-add-other {
  display: flex;
  align-items: center;
  gap: 4px;
}
.graph-add-other select {
  flex: 1 1 auto;
  min-width: 0;
}
.graph-add-name {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.graph-add-name input,
.graph-add-other select {
  min-height: var(--soda-shape-control-h, auto);
  box-sizing: border-box;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius, 4px);
  background: transparent;
  color: inherit;
  font: inherit;
}
.graph-add-busy {
  margin: 0;
  opacity: 0.85;
}
.graph-add-error {
  margin: 0;
  color: var(--soda-error-fg, #ff5555);
}
.graph-add-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
.graph-add-actions button {
  min-height: var(--soda-shape-control-h, auto);
  padding: 2px 10px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius, 4px);
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.graph-add-actions button:disabled {
  opacity: 0.5;
  cursor: default;
}
.graph-add-submit:not(:disabled) {
  background: var(--soda-accent, #6070a1);
  border-color: var(--soda-accent, #6070a1);
  color: var(--soda-accent-fg, #f8f8f2);
}
</style>
