import type { ExtensionListResult } from "@sodashitsu/protocol";
import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * 拡張（20261007-ext-host）の一覧。**サーバ全体**の状態なので localStorage には持たない。`ExtensionController` が
 * 接続のたびに `extension.list` で取り、`extension.changed`（中身なし）のたびに取り直す。
 * `supported` は `null`＝未確認／`false`＝古いサーバ（`extension.list` が `not_found`）。
 * `loadFailed` は、最初の一覧を取れなかった（`not_found` 以外）こと（「確認中…」のまま止まらないよう、画面が失敗を見せて［読み直す］で取り直せるようにする）。
 * `busy` は操作中の key（二重押しを防ぐ）。
 * 承認（PR3）: `dialogKey` は開いている承認のダイアログの拡張（利用者がトーストの［確認する］か設定の［確認］を押したときだけ入る。サーバのイベントでは入れない）、
 * `dismissedPending` は利用者が知らせを閉じた・ダイアログを［後で］で閉じた `key:digest`（同じ登録では知らせを出し直さない。ページを読み込み直すまで）。
 */
export const useExtensionsStore = defineStore("extensions", () => {
  const supported = ref<boolean | null>(null);
  const list = ref<ExtensionListResult | null>(null);
  const busy = ref<Set<string>>(new Set());
  const loadFailed = ref(false);
  const dialogKey = ref<string | null>(null);
  const dismissedPending = ref<Set<string>>(new Set());

  function setList(next: ExtensionListResult): void {
    list.value = next;
    supported.value = true;
    loadFailed.value = false;
  }
  function setUnsupported(): void {
    list.value = null;
    supported.value = false;
    loadFailed.value = false;
  }
  function setLoadFailed(): void {
    if (supported.value === null) loadFailed.value = true;
  }
  function openApproval(key: string): void {
    dialogKey.value = key;
  }
  function closeApproval(): void {
    dialogKey.value = null;
  }
  function dismissPending(ids: readonly string[]): void {
    if (ids.length === 0) return;
    const next = new Set(dismissedPending.value);
    for (const id of ids) next.add(id);
    dismissedPending.value = next;
  }
  function clear(): void {
    dialogKey.value = null;
    list.value = null;
    supported.value = null;
    loadFailed.value = false;
    busy.value = new Set();
  }
  function setBusy(key: string, on: boolean): void {
    const next = new Set(busy.value);
    if (on) next.add(key);
    else next.delete(key);
    busy.value = next;
  }

  return { supported, list, busy, loadFailed, dialogKey, dismissedPending, setLoadFailed, setList, setUnsupported, clear, setBusy, openApproval, closeApproval, dismissPending };
});
