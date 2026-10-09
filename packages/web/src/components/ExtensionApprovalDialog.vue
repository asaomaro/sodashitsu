<script setup lang="ts">
import { EXTENSION_APPROVE_DELAY_MS } from "@sodashitsu/protocol";
import { LOCAL_MACHINE_ID } from "@sodashitsu/client-core";
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { focusPaneIfShown } from "../actions/paneFocus.js";
import { allowText, diffEntry, hasNonAscii, nextInQueue, nonAsciiList, pendingNotice, pendingQueue, showPath } from "../extensions/approvalView.js";
import { ExtensionControllerKey, TerminalRegistryKey } from "../injection.js";
import { useExtensionsStore } from "../store/extensions.js";
import { useMachinesStore } from "../store/machines.js";
import { useSessionStore } from "../store/session.js";
import { useSettingsStore } from "../store/settings.js";
import { useViewStore } from "../store/view.js";

/**
 * プロジェクトの拡張の承認のダイアログ（20261007-ext-host PR3）。**他人のリポジトリを開いただけで、その中のプログラムが動く道にしない**ための、利用者が見て決める画面。
 * 守るのは「コマンドの全文が、省略なく・偽れない形で読める」「うっかり Enter で承認しない」「承認したものと動かすものが同じ」。
 *
 * - 開くのは `store.dialogKey` が入ったときだけ（利用者がトーストの［確認する］か、設定の［確認］を押したとき）。**サーバのイベントでは開かない**。
 * - 別の `<dialog>`・`showModal()`・`view.setExtensionApprovalOpen`（`modalOpen` に入り、キーが端末へ流れない）。背景を押しても閉じない。`Esc` は［後で］。
 * - 中身は**すべて文字として出す**（`v-html` を使わない）。コマンドの `<pre>` に高さの上限・内側のスクロールを付けない（長いコマンドを途中で隠さない）。ボタンは中身の後ろ。
 * - 開いたときのフォーカスは［承認しない］。［承認して動かす］は、開いてから・中身が替わってから・ほかのモーダルが開閉してから 1 秒は押せない。
 * - 送る `digest` は、**この画面が描いた `approval.digest`**。違っていれば `extension_stale`（登録が変わった）で、描き直して待ちをやり直す。
 * - 同じ根の承認待ちを続けて見る（「N 件中 M 件目」）。「すべて承認」は無い。
 * - 承認待ちの知らせ（消えないトースト）も、ここで出す（`App.vue` に常にある部品）。フォーカス・表示中の tab・開いているダイアログを変えない。
 */
const store = useExtensionsStore();
const view = useViewStore();
const settings = useSettingsStore();
const session = useSessionStore();
const machines = useMachinesStore();
const controller = inject(ExtensionControllerKey, null);
const registry = inject(TerminalRegistryKey, undefined);

const dialogEl = ref<HTMLDialogElement | null>(null);
const denyBtn = ref<HTMLButtonElement | null>(null);
const titleEl = ref<HTMLElement | null>(null);

const info = computed(() => (store.dialogKey === null ? null : (store.list?.extensions.find((e) => e.key === store.dialogKey) ?? null)));
const approval = computed(() => info.value?.approval ?? null);
const open = computed(() => store.dialogKey !== null);

/** 開いたときの、同じ根の承認待ちの key の一覧。 */
const queue = ref<string[]>([]);
const position = computed(() => {
  const i = queue.value.indexOf(store.dialogKey ?? "");
  return queue.value.length > 1 && i >= 0 ? `${queue.value.length} 件中 ${i + 1} 件目` : "";
});

const machineName = computed(() => (machines.selectedId === LOCAL_MACHINE_ID ? "" : (machines.sections.find((s) => s.id === machines.selectedId)?.label ?? "")));
const command = computed(() => showPath(approval.value?.command ?? ""));
const nonAscii = computed(() => (approval.value && hasNonAscii(approval.value.command) ? nonAsciiList(approval.value.command) : null));
const diff = computed(() => {
  const a = approval.value;
  const i = info.value;
  if (!a?.previous || !i) return [];
  return diffEntry(a.previous, { command: a.command, description: i.description ?? null, enabled: true, allow: i.allow, onUnresponsive: i.onUnresponsive });
});
const hasScript = computed(() => info.value?.allow.includes("script-html") ?? false);

/** ［承認して動かす］を押せるか（開いてから・中身が替わってから・ほかのモーダルが開閉してから 1 秒後）。 */
const approveReady = ref(false);
let readyTimer: ReturnType<typeof setTimeout> | null = null;
function startDelay(): void {
  approveReady.value = false;
  if (readyTimer !== null) clearTimeout(readyTimer);
  readyTimer = setTimeout(() => {
    readyTimer = null;
    approveReady.value = true;
  }, EXTENSION_APPROVE_DELAY_MS);
}
const staleNote = ref(false);
const working = ref(false);

function focusDeny(): void {
  denyBtn.value?.focus({ preventScroll: true });
}

// --- 開閉 ----------------------------------------------------------------------------------------

let previousFocus: Element | null = null;
let previousPaneId: string | null = null;

watch(
  () => store.dialogKey,
  (key, oldKey) => {
    if (key !== null && (oldKey === null || oldKey === undefined)) {
      queue.value = pendingQueue(store.list?.extensions ?? [], key);
      staleNote.value = false;
      void nextTick(() => {
        const el = dialogEl.value;
        if (!el) return;
        previousFocus = document.activeElement;
        if (!el.open) el.showModal();
        view.setExtensionApprovalOpen(true);
        previousPaneId = view.preExtensionApprovalFocusPaneId;
        startDelay();
        focusDeny();
        el.scrollTop = 0;
      });
    } else if (key !== null) {
      // 次の 1 件へ替わった（フォーカスは［承認しない］へ戻し、待ちをやり直す）。
      staleNote.value = false;
      void nextTick(() => {
        startDelay();
        focusDeny();
        if (dialogEl.value) dialogEl.value.scrollTop = 0;
      });
    } else if (oldKey !== null && oldKey !== undefined) {
      closeDialog();
    }
  },
  { immediate: true },
);

function closeDialog(): void {
  if (readyTimer !== null) clearTimeout(readyTimer);
  readyTimer = null;
  approveReady.value = false;
  view.setExtensionApprovalOpen(false);
  dialogEl.value?.close();
  const paneId = previousPaneId;
  const back = previousFocus;
  previousPaneId = null;
  previousFocus = null;
  void nextTick(() => restoreFocus(paneId, back));
}

/** フォーカスの戻し先: ほかのモーダルが開いていればその中（開く前の要素）、そうでなく pane が表示中ならその pane の端末、どちらでもなければ開く前の要素。 */
function restoreFocus(paneId: string | null, back: Element | null): void {
  const otherModal = view.openDialog !== null || view.graphDialogOpen || view.askOpen;
  if (!otherModal && paneId !== null && registry) {
    const done = focusPaneIfShown(
      {
        paneTab: (id) => session.panes.get(id)?.tabId,
        shownTab: () => view.tabId,
        focus: (id) => {
          view.focusPane(id);
          registry.focus(id);
        },
      },
      paneId,
    );
    if (done) return;
  }
  if (back instanceof HTMLElement && back.isConnected) back.focus();
}

onBeforeUnmount(() => {
  if (readyTimer !== null) clearTimeout(readyTimer);
  view.setExtensionApprovalOpen(false);
});

// 開いている間に、中身（登録の鍵）が替わった・その拡張が承認待ちでなくなった。
watch(
  () => [store.dialogKey, info.value?.approval?.digest ?? null, info.value?.state ?? null] as const,
  ([key, digest, state], [oldKey, oldDigest]) => {
    if (!open.value || key === null) return;
    if (info.value === null || (state !== "pending" && state !== "denied")) {
      // 消えた・承認待ちでなくなった: 次の承認待ちへ替わるか、無ければ閉じる。
      const next = nextInQueue(queue.value, store.list?.extensions ?? [], key);
      if (next !== null) store.openApproval(next);
      else store.closeApproval();
      return;
    }
    // 同じ拡張のまま、鍵が替わった（別の拡張へ替わったときは、開閉の `watch` が見る）。
    if (oldKey === key && oldDigest !== null && oldDigest !== undefined && digest !== oldDigest) {
      staleNote.value = true;
      void nextTick(() => {
        startDelay();
        focusDeny();
      });
    }
  },
);

// ほかのモーダル（質問のフォーム・設定・確認）が開いた・閉じた: 待ちをやり直し、閉じたときは、閉じたモーダル自身のフォーカスの戻しの後に、［承認しない］へ置き直す。
const otherModal = computed(() => view.openDialog !== null || view.graphDialogOpen || view.askOpen);
watch(otherModal, (now) => {
  if (!open.value) return;
  startDelay();
  if (!now) {
    void nextTick(() => {
      requestAnimationFrame(() => {
        if (open.value && !otherModal.value) focusDeny();
      });
    });
  }
});

// --- 操作 ----------------------------------------------------------------------------------------

function advance(fromKey: string): void {
  const next = nextInQueue(queue.value, store.list?.extensions ?? [], fromKey);
  if (next !== null) store.openApproval(next);
  else store.closeApproval();
}

async function decide(kind: "approve" | "deny"): Promise<void> {
  const a = approval.value;
  const key = store.dialogKey;
  if (!controller || !a || key === null || working.value) return;
  if (kind === "approve" && !approveReady.value) return;
  working.value = true;
  try {
    const r = kind === "approve" ? await controller.approve(key, a.digest) : await controller.deny(key, a.digest);
    if (r === "done") advance(key);
    else if (r === "stale") staleNote.value = true;
  } finally {
    working.value = false;
  }
}

/** ［後で］（`Esc` も）: 閉じる。同じ登録（key:digest）の知らせは、出し直さない。 */
function later(): void {
  const a = approval.value;
  const key = store.dialogKey;
  if (a && key !== null) store.dismissPending([`${key}:${a.digest}`]);
  store.closeApproval();
}

// --- 承認待ちの知らせ（消えないトースト）------------------------------------------------------------

let toastId: number | null = null;
let shown: { count: number; ids: string[] } | null = null;
/** こちらで消したトースト（利用者が閉じたものと区別する）。 */
const removedByUs = new Set<number>();

function removeToast(): void {
  if (toastId === null) return;
  removedByUs.add(toastId);
  view.dismissToast(toastId);
  toastId = null;
  shown = null;
}

function syncNotice(): void {
  const list = store.list?.extensions ?? [];
  const n = store.dialogKey !== null ? null : pendingNotice(list, store.dismissedPending);
  if (n === null) {
    removeToast();
    return;
  }
  if (toastId !== null && shown?.count === n.count && shown.ids.join() === n.ids.join()) return;
  removeToast();
  const first = n.keys[0]!;
  const id = view.toast(`プロジェクトの拡張が承認を待っています（${n.count} 件）`, {
    kind: "sticky",
    actions: [
      {
        label: "確認する",
        run: () => {
          // トーストは、ダイアログを開いている間は消す（こちらで消したことにする。閉じたら、残りがあれば出し直す）。
          store.openApproval(first);
        },
      },
    ],
  });
  toastId = id;
  shown = { count: n.count, ids: n.ids };
}

watch(
  () => [store.list, store.dismissedPending, store.dialogKey] as const,
  () => syncNotice(),
  { immediate: true },
);

// 利用者がトーストを閉じた（こちらで消したものではない）→ そのとき数えていた登録は、出し直さない。
watch(
  () => view.toasts.map((t) => t.id),
  (ids) => {
    if (toastId === null || ids.includes(toastId)) return;
    const gone = toastId;
    toastId = null;
    if (removedByUs.delete(gone)) return;
    if (shown) store.dismissPending(shown.ids);
    shown = null;
  },
);
onBeforeUnmount(() => removeToast());
</script>

<template>
  <dialog ref="dialogEl" class="ext-approval-dialog" aria-labelledby="ext-approval-title" data-ext-approval-dialog @cancel.prevent="later">
    <div v-if="open && info && approval" class="ext-approval-body">
      <h2 id="ext-approval-title" ref="titleEl" class="ext-approval-title" tabindex="-1">
        プロジェクトの拡張の確認<span v-if="position" class="ext-approval-position" data-ext-approval-position>（{{ position }}）</span>
      </h2>
      <p v-if="machineName" class="ext-approval-line" data-ext-approval-machine>マシン: {{ machineName }}</p>
      <p v-if="staleNote" class="ext-approval-stale" role="status" data-ext-approval-stale>登録が変わりました。中身を確かめ直してください。</p>
      <p class="ext-approval-line" data-ext-approval-root>リポジトリ: {{ showPath(info.root ?? "") }}</p>
      <p class="ext-approval-line" data-ext-approval-config>設定ファイル: {{ showPath(info.configPath) }}</p>
      <p class="ext-approval-line" data-ext-approval-id>拡張の id: {{ info.id }}</p>

      <h3 class="ext-approval-sub">実行されるコマンド</h3>
      <pre class="ext-approval-command" data-ext-approval-command>{{ command }}</pre>
      <p class="ext-approval-line" data-ext-approval-cwd>作業ディレクトリ: {{ showPath(approval.cwd) }}</p>
      <div v-if="nonAscii" class="ext-approval-warn" data-ext-approval-nonascii>
        <p>ASCII でない文字を含みます（見た目の似た別の文字に注意）</p>
        <p class="ext-approval-chars">{{ nonAscii.items.join("、") }}<template v-if="nonAscii.more > 0">、ほか {{ nonAscii.more }} 個</template></p>
      </div>

      <div class="ext-approval-box" data-ext-approval-fixed>
        <p>このプログラムは、あなたの OS の利用者の権限で動き、隔離されません。ファイルの読み書き・通信・ほかのプログラムの起動が出来ます。</p>
        <p>コマンドが指すファイルの中身が後で変わっても、確認は出ません。</p>
        <p>承認は、フォルダの場所（パス）に結びつきます。同じ場所に別のリポジトリを置くと、聞き直されないことがあります（閉じている間の差し替えは、見つけられません）。</p>
      </div>

      <h3 class="ext-approval-sub">求めている許可</h3>
      <p class="ext-approval-line" data-ext-approval-allow>
        <template v-if="info.allow.length === 0">なし（文字・Markdown・スクリプトの動かない HTML の表示だけ）</template>
        <template v-else>{{ allowText(info.allow) }}</template>
      </p>
      <div v-if="hasScript" class="ext-approval-box ext-approval-script" data-ext-approval-script>
        <p>スクリプトが動く表示: ブラウザの中で、この拡張のスクリプトが動きます。操作中に打ったキーは、スクリプトが読めます（残る限界は docs/display.md）。</p>
        <p data-ext-approval-script-state>サーバの設定『スクリプトが動く表示』が有効のときだけ動きます。<strong>いまは、{{ settings.displayScriptEnabled ? "有効" : "無効" }}です。</strong></p>
        <p>この設定は、不注意を防ぐためのもので、拡張からの守りではありません。拡張は、あなたの権限で動くので、この設定を、自分で有効に出来ます（有効になると、すべての画面に知らせが出ます）。</p>
      </div>
      <p class="ext-approval-line" data-ext-approval-unresponsive>応答しないとき: {{ info.onUnresponsive === "block" ? "止める（この版では、まだ効きません）" : "素通し" }}</p>
      <p v-if="approval.groupWritable" class="ext-approval-warn" data-ext-approval-group>この設定ファイル（か、その場所）は、同じグループのほかの利用者が書き換えられます。</p>

      <h3 class="ext-approval-sub">作者が書いた説明（Sodashitsu は、中身を確かめていません）</h3>
      <p class="ext-approval-line" data-ext-approval-description>{{ info.description ?? "（説明はありません）" }}</p>

      <template v-if="approval.previous">
        <h3 class="ext-approval-sub">前に承認した登録からの変更</h3>
        <ul class="ext-approval-diff" data-ext-approval-diff>
          <li v-for="d in diff" :key="d.field">
            {{ d.label }}:
            <span class="ext-approval-before">{{ d.before }}</span>
            →
            <span class="ext-approval-after">{{ d.after }}</span>
          </li>
        </ul>
        <p class="ext-approval-line" data-ext-approval-previous>前に承認した中身の記録は、残っています（登録が、その中身へ戻ると、確認なしで動きます。設定の［承認を取り消す］で消せます）。</p>
      </template>
      <p v-if="approval.deniedBefore" class="ext-approval-warn" data-ext-approval-denied-before>この拡張は、前に、別の中身を「承認しない」としています。登録が、その後に変えられました。</p>

      <div class="ext-approval-buttons">
        <button ref="denyBtn" type="button" class="ext-approval-btn" data-ext-approval-deny :aria-disabled="working ? 'true' : undefined" @click="decide('deny')">承認しない</button>
        <button type="button" class="ext-approval-btn" data-ext-approval-later @click="later">後で</button>
        <button
          type="button"
          class="ext-approval-btn ext-approval-primary"
          data-ext-approval-approve
          :disabled="!approveReady"
          :aria-disabled="working ? 'true' : undefined"
          @click="decide('approve')"
        >
          承認して動かす
        </button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.ext-approval-dialog {
  box-sizing: border-box;
  width: min(720px, calc(100% - 16px));
  max-height: calc(100% - 16px);
  overflow-y: auto;
  padding: 0;
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-fg, #f8f8f2);
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 6px;
  overscroll-behavior: contain;
}
.ext-approval-dialog::backdrop {
  background: var(--soda-backdrop, rgba(0, 0, 0, 0.4));
}
.ext-approval-body {
  padding: 0.8em 1em 1em;
}
.ext-approval-title {
  margin: 0 0 0.5em;
  font-size: 1.05em;
}
.ext-approval-title:focus-visible {
  outline: 2px solid var(--soda-accent, #6070a1);
  outline-offset: 2px;
}
.ext-approval-position {
  font-weight: normal;
  font-size: 0.85em;
  margin-left: 0.5em;
}
.ext-approval-sub {
  margin: 0.9em 0 0.3em;
  font-size: 0.95em;
}
.ext-approval-line {
  margin: 0.2em 0;
  overflow-wrap: anywhere;
}
/* 高さの上限・内側のスクロールを付けない（長いコマンドを途中で隠さない）。折り返して全部を出す。 */
.ext-approval-command {
  margin: 0.3em 0;
  padding: 0.5em 0.6em;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--soda-bg, #1e1f29);
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  font-family: var(--soda-mono, ui-monospace, monospace);
  font-size: 0.9em;
}
.ext-approval-box {
  margin: 0.7em 0;
  padding: 0.5em 0.7em;
  border: 1px solid var(--soda-warn-fg, #ffb86c);
  border-radius: 4px;
}
.ext-approval-box p {
  margin: 0.25em 0;
}
.ext-approval-warn {
  margin: 0.4em 0;
  color: var(--soda-warn-fg, #ffb86c);
}
.ext-approval-warn p {
  margin: 0.15em 0;
}
.ext-approval-stale {
  margin: 0.4em 0;
  padding: 0.3em 0.6em;
  border: 1px solid var(--soda-error-fg, #ff5555);
  border-radius: 4px;
}
.ext-approval-diff {
  margin: 0.3em 0;
  padding-left: 1.2em;
  overflow-wrap: anywhere;
}
.ext-approval-before {
  text-decoration: line-through;
  opacity: 0.8;
}
.ext-approval-buttons {
  display: flex;
  gap: 0.6em;
  flex-wrap: wrap;
  margin-top: 1em;
}
.ext-approval-btn {
  padding: 0.4em 1em;
  background: var(--soda-bg, #1e1f29);
  color: inherit;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  cursor: pointer;
}
.ext-approval-btn:focus-visible {
  outline: 2px solid var(--soda-accent, #6070a1);
  outline-offset: 2px;
}
.ext-approval-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ext-approval-primary {
  background: var(--soda-accent, #6070a1);
  color: var(--soda-accent-fg, #f8f8f2);
}
@media (max-width: 767px) {
  .ext-approval-dialog {
    width: calc(100% - 16px);
  }
}
</style>
