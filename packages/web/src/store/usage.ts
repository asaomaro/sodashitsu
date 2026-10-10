import type { AccountUsage, AgentUsage, AgentUsageChangedEvent, AgentUsageResult } from "@sodashitsu/protocol";
import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * エージェントの利用状況（20261010-agent-usage PR3）。ダッシュボードが見えている間だけ、`UsageController` が `agent.usage` で最初の値を取り、
 * 以後は `agent.usage_changed`（見ていると知らせた接続にだけ届く）の差分を足す。数字・モデル名・時刻・ラベルだけを持つ（会話の中身は来ない）。
 * 見えていない間は更新されない（値は残るが、画面が出す時刻（`updatedAt`）で古さは分かる）。
 */
export const useUsageStore = defineStore("usage", () => {
  /** pane の id → 利用状況（取れない pane は入れない）。 */
  const panes = ref<Record<string, AgentUsage>>({});
  const accounts = ref<AccountUsage[]>([]);
  /** 最初の値を受け取った。 */
  const loaded = ref(false);
  /** このマシンのサーバが利用状況を知らない（古い版）。 */
  const unsupported = ref(false);
  /** 取れなかった（接続の失敗など）。次の機会に取り直す。 */
  const failed = ref(false);

  function setSnapshot(r: AgentUsageResult): void {
    const next: Record<string, AgentUsage> = {};
    for (const [id, u] of Object.entries(r.panes)) if (u !== null) next[id] = u;
    panes.value = next;
    accounts.value = r.accounts;
    loaded.value = true;
    unsupported.value = false;
    failed.value = false;
  }

  /** `agent.usage_changed`。pane は差分（`null`＝取れなくなった）。古い値で新しい値を戻さない（`updatedAt`）。 */
  function applyChanged(d: AgentUsageChangedEvent["data"]): void {
    const next = { ...panes.value };
    for (const [id, u] of Object.entries(d.panes)) {
      if (u === null) delete next[id];
      else if (next[id] === undefined || u.updatedAt >= next[id]!.updatedAt) next[id] = u;
    }
    panes.value = next;
    if (d.accounts !== undefined) accounts.value = d.accounts;
  }

  function forgetPane(paneId: string): void {
    if (panes.value[paneId] === undefined) return;
    const next = { ...panes.value };
    delete next[paneId];
    panes.value = next;
  }

  function markUnsupported(): void {
    unsupported.value = true;
    failed.value = false;
  }
  function markFailed(): void {
    failed.value = true;
  }

  /** 別のマシンへ替わったとき（前のマシンの値を残さない）。 */
  function clear(): void {
    panes.value = {};
    accounts.value = [];
    loaded.value = false;
    unsupported.value = false;
    failed.value = false;
  }

  return { panes, accounts, loaded, unsupported, failed, setSnapshot, applyChanged, forgetPane, markUnsupported, markFailed, clear };
});
