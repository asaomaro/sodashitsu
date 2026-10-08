import type { ExtensionListResult } from "@sodashitsu/protocol";
import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * 拡張（20261007-ext-host）の一覧。**サーバ全体**の状態なので localStorage には持たない。`ExtensionController` が
 * 接続のたびに `extension.list` で取り、`extension.changed`（中身なし）のたびに取り直す。
 * `supported` は `null`＝未確認／`false`＝古いサーバ（`extension.list` が `not_found`）。
 * `busy` は操作中の key（二重押しを防ぐ）。承認の項目（`dialogKey`・`notifiedPending`）は PR3 が足す。
 */
export const useExtensionsStore = defineStore("extensions", () => {
  const supported = ref<boolean | null>(null);
  const list = ref<ExtensionListResult | null>(null);
  const busy = ref<Set<string>>(new Set());

  function setList(next: ExtensionListResult): void {
    list.value = next;
    supported.value = true;
  }
  function setUnsupported(): void {
    list.value = null;
    supported.value = false;
  }
  function clear(): void {
    list.value = null;
    supported.value = null;
    busy.value = new Set();
  }
  function setBusy(key: string, on: boolean): void {
    const next = new Set(busy.value);
    if (on) next.add(key);
    else next.delete(key);
    busy.value = next;
  }

  return { supported, list, busy, setList, setUnsupported, clear, setBusy };
});
