import { defineStore } from "pinia";
import { ref } from "vue";

/** 初回の案内（`store/onboarding.ts`）が既存の利用者の痕跡としても読む。 */
export const SEEN_STORAGE_KEY = "soda.seen.v1";

function loadFromStorage(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SEEN_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function saveToStorage(data: Record<string, number>): void {
  try {
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 保存できなくても致命的ではない（次回の起動で既読が再初期化されるだけ）。
  }
}

/**
 * 既読の鍵（20260927-multi-host-machines）。エージェントの `instanceId`（`a1` 等）はマシンごとの連番で衝突するので、ローカル以外のマシンは
 * `m:<machineId>:<instanceId>` にする（ローカルは今までの鍵のまま）。
 */
export function seenKeyFor(scope: string, instanceId: string): string {
  return scope === "local" ? instanceId : `m:${scope}:${instanceId}`;
}

/**
 * エージェントの `instanceId` ごとの既読（architecture.md「store/seen」）。ブラウザごとに別々に持つ
 * （design「エージェントの状態」。`[H]concepts.mdx:51` と同じ）。
 */
export const useSeenStore = defineStore("seen", () => {
  const seen = ref<Record<string, number>>(loadFromStorage());
  /** 画面の接続が向いているマシン（`getSeenSeq`・`markSeen` が使う）。 */
  const scope = ref("local");

  function setScope(machineId: string): void {
    scope.value = machineId;
  }

  /** 記録が無ければ `fallback`（サーバの `serverSeenSeq`）を返す。 */
  function getSeenSeq(instanceId: string, fallback: number): number {
    return seen.value[seenKeyFor(scope.value, instanceId)] ?? fallback;
  }

  /** 選んでいないマシンの要約の状態の印に使う（そのマシンの鍵で引く）。 */
  function getSeenSeqIn(machineId: string, instanceId: string, fallback: number): number {
    return seen.value[seenKeyFor(machineId, instanceId)] ?? fallback;
  }

  function markSeen(instanceId: string, seq: number): void {
    const key = seenKeyFor(scope.value, instanceId);
    if (seen.value[key] === seq) return;
    seen.value = { ...seen.value, [key]: seq };
    saveToStorage(seen.value);
  }

  return { seen, scope, setScope, getSeenSeq, getSeenSeqIn, markSeen };
});

// 純粋な関数（状態の優先度・表示状態・集約・既読の掃引）は client-core へ移した（20260927-cli-mode）。今までの参照先を壊さないよう再 export する。
export { aggregate, displayStateFor, shouldMarkSeen, STATE_PRIORITY, sweepMarkSeen } from "@sodashitsu/client-core";
