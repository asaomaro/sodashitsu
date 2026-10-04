<script lang="ts">
/** 成果物の枠の `sandbox`。**`allow-same-origin` を付けない**（付けると枠の中のスクリプトがアプリの origin になり、隔離が全部崩れる）。テストがこの値を見る。 */
export const ASK_VIEW_SANDBOX = "allow-scripts";
/** 枠から親へ取り次ぐキー（枠のページ `keys.js` と同じ 3 種）。 */
export type AskViewKey = "cancel" | "submit" | "prev" | "next";
/** 枠の静的ページ（サーバの `/ask-view/*`。専用のヘッダ）。 */
export const ASK_VIEW_PAGES = {
  markdown: "/ask-view/markdown.html",
  html: "/ask-view/html.html",
} as const;
/** 枠から来たメッセージ（`event.data`）を、取り次ぐキーに読む。形が違う・取り次ぎの 3 種でなければ null。 */
export function readViewKey(data: unknown): AskViewKey | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d["type"] !== "key" || typeof d["key"] !== "string") return null;
  if (d["key"] === "Escape") return "cancel";
  if (d["key"] === "Enter" && (d["ctrl"] === true || d["meta"] === true)) return "submit";
  if (d["alt"] === true && d["key"] === "PageUp") return "prev";
  if (d["alt"] === true && d["key"] === "PageDown") return "next";
  return null;
}
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { AskViewLoaded } from "../ask/mediaUrl.js";

/**
 * 質問のダイアログの横に出す成果物（`view`。20261004-ask-media-popup の design「web」）。
 * - 上の固定のラベルは**アプリが描く**（定義の文字は使わない。soda 自身の確認画面に見せかけた成果物と見分けるため）。
 * - text は `<pre>`（`textContent`）・image は `<img>`・markdown・html は隔離した iframe（`sandbox="allow-scripts"` のみ・`allow-same-origin` なし）で、本文は `postMessage` で渡す。
 * - 枠の中のキー（Esc・Ctrl/Cmd+Enter・Alt+PageUp/Down）は枠のページが `postMessage` で親へ渡す。受けるのは自分の iframe（`event.source`）からのものだけ。
 */
const props = defineProps<{
  items: readonly AskViewLoaded[];
  /** 質問を出した pane の名前（固定のラベルに入れる。アプリが持つ値）。 */
  paneName: string;
  dark?: boolean;
}>();
const emit = defineEmits<{ key: [key: AskViewKey] }>();

const active = ref(0);
const frame = ref<HTMLIFrameElement | null>(null);
const item = computed<AskViewLoaded | undefined>(() => props.items[active.value]);
const label = computed(() => `pane『${props.paneName}』の成果物（隔離表示）`);
const pageOf = (kind: AskViewLoaded["kind"]): string | null =>
  kind === "markdown" || kind === "html" ? ASK_VIEW_PAGES[kind] : null;

watch(
  () => props.items,
  () => {
    active.value = 0;
  },
);

/** 枠が読み込めた（`ready` を送ってきた）ら本文を渡す。`event.source` が自分の iframe のときだけ受ける（ほかの窓・ほかの枠のメッセージは無視）。 */
function onMessage(ev: MessageEvent): void {
  const win = frame.value?.contentWindow;
  if (!win || ev.source !== win) return;
  const d = ev.data as { type?: unknown } | null;
  if (d && typeof d === "object" && d.type === "ready") {
    const it = item.value;
    if (!it || it.text === undefined || pageOf(it.kind) === null) return;
    // 不透明 origin の枠へ送るので宛先の origin は `"*"`（送るのは利用者に見せる成果物の本文だけ）。
    win.postMessage({ type: "ask-view", source: it.text, dark: props.dark }, "*");
    return;
  }
  const key = readViewKey(ev.data);
  if (key === null) return;
  // ここでは決定しない: 取り次ぐのは「枠の中で決定のキーが押された」という知らせだけ（受けた側は、決定せずに質問側へフォーカスを移す。AskDialog の `onViewKey`）。
  // 枠の中のスクリプトは本物のキー操作と見分けがつかない `postMessage` を送れる（`navigator.userActivation` は親ページの操作でも立ち、枠のフォーカスはスクリプトが
  // `focus()` で奪える。実測は ask-view の E2E）ので、枠からの知らせだけで回答を確定させない。
  emit("key", key);
}
onMounted(() => window.addEventListener("message", onMessage));
onBeforeUnmount(() => window.removeEventListener("message", onMessage));

function pick(i: number): void {
  active.value = i;
}
/** タブの矢印キー（← →・Home・End）。 */
function onTabKey(ev: KeyboardEvent): void {
  const n = props.items.length;
  const to =
    ev.key === "ArrowRight"
      ? (active.value + 1) % n
      : ev.key === "ArrowLeft"
        ? (active.value + n - 1) % n
        : ev.key === "Home"
          ? 0
          : ev.key === "End"
            ? n - 1
            : -1;
  if (to < 0) return;
  ev.preventDefault();
  active.value = to;
  void nextTick(() =>
    (document.getElementById(`ask-view-tab-${to}`) as HTMLElement | null)?.focus(),
  );
}
</script>

<template>
  <section class="ask-viewer" aria-label="成果物">
    <p class="ask-viewer-label" data-ask-view-label>{{ label }}</p>
    <div
      v-if="items.length > 1"
      class="ask-viewer-tabs"
      role="tablist"
      aria-label="成果物の一覧"
      @keydown="onTabKey"
    >
      <button
        v-for="(it, i) in items"
        :id="`ask-view-tab-${i}`"
        :key="i"
        type="button"
        role="tab"
        class="ask-viewer-tab"
        :aria-selected="i === active"
        :tabindex="i === active ? 0 : -1"
        data-ask-view-tab
        @click="pick(i)"
      >
        {{ it.title }}
      </button>
    </div>
    <div class="ask-viewer-stage" role="tabpanel" data-ask-view-stage>
      <template v-if="item">
        <pre v-if="item.kind === 'text'" class="ask-viewer-text" tabindex="0" data-ask-view-text>{{
          item.text
        }}</pre>
        <img
          v-else-if="item.kind === 'image'"
          class="ask-viewer-image"
          :src="item.url"
          alt=""
          data-ask-view-image
        />
        <iframe
          v-else
          ref="frame"
          :key="`${active}-${item.kind}`"
          class="ask-viewer-frame"
          :sandbox="ASK_VIEW_SANDBOX"
          referrerpolicy="no-referrer"
          :src="pageOf(item.kind) ?? undefined"
          title="成果物（隔離表示）"
          data-ask-view-frame
        ></iframe>
      </template>
    </div>
  </section>
</template>

<style scoped>
.ask-viewer {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--soda-bg, #1e1f29);
  border: 1px solid var(--soda-menu-border, #44475a);
}
.ask-viewer-label {
  flex: none;
  margin: 0;
  padding: 0.3em 0.8em;
  font-size: 0.8em;
  font-weight: bold;
  background: var(--soda-menu-border, #44475a);
  color: var(--soda-fg, #f8f8f2);
}
.ask-viewer-tabs {
  flex: none;
  display: flex;
  gap: 2px;
  overflow-x: auto;
  padding: 4px 6px 0;
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
.ask-viewer-tab {
  font: inherit;
  font-size: 0.85em;
  padding: 0.25em 0.8em;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-bottom: none;
  border-radius: 4px 4px 0 0;
  background: transparent;
  color: var(--soda-fg, #f8f8f2);
  cursor: pointer;
  white-space: nowrap;
}
.ask-viewer-tab[aria-selected="true"] {
  background: var(--soda-accent, #6070a1);
  color: var(--soda-accent-fg, #f8f8f2);
}
.ask-viewer-stage {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: flex;
}
.ask-viewer-frame {
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  border: 0;
  background: #fff;
}
.ask-viewer-text {
  margin: 0;
  padding: 0.8em 1em;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font:
    13px/1.6 ui-monospace,
    "Cascadia Mono",
    Consolas,
    Menlo,
    monospace;
  flex: 1 1 auto;
}
.ask-viewer-image {
  max-width: 100%;
  max-height: 100%;
  margin: auto;
  object-fit: contain;
}
</style>
