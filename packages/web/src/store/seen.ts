import type { AgentInfo, DisplayState, Pane } from "@wtm/protocol";
import { defineStore } from "pinia";
import { ref } from "vue";

/** 初回の案内（`store/onboarding.ts`）が既存の利用者の痕跡としても読む。 */
export const SEEN_STORAGE_KEY = "wtm.seen.v1";

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

/** D19：利用者の対応が要る順。数値が大きいほど優先。 */
export const STATE_PRIORITY: Record<DisplayState, number> = {
  blocked: 4,
  done: 3,
  working: 2,
  idle: 1,
  unknown: 0,
};

/** pane 単体の表示用の状態。`done` は `idle` かつ `completionSeq > seenSeq` のとき（design「エージェントの状態」）。 */
export function displayStateFor(agent: AgentInfo | null, seenSeq: number): DisplayState | null {
  if (!agent) return null;
  if (agent.state === "idle" && agent.completionSeq > seenSeq) return "done";
  return agent.state;
}

/**
 * 複数の表示状態から代表を選ぶ（D19。pane → tab → workspace と段を踏んでも数学的に同じ結果になるので、
 * tab の段は経由せず全 pane から直接求める。D56 の訂正 6）。エージェントの居ない pane（null）は無視する。
 */
export function aggregate(states: (DisplayState | null)[]): DisplayState | null {
  let best: DisplayState | null = null;
  for (const s of states) {
    if (s === null) continue;
    if (best === null || STATE_PRIORITY[s] > STATE_PRIORITY[best]) best = s;
  }
  return best;
}

/**
 * 既読を進めてよいか（D56 の訂正 6）：pane が表示に含まれていて（破棄されていない）、かつウィンドウの
 * フォーカスが失われたと分かっていないとき（`document.hasFocus()` が false と確認できていなければ進める）。
 * 既読を進める呼び出し元（`sweepMarkSeen`・`TerminalPane.vue` の `onMounted`。
 * 20260925-seen-semantics-fix）は、いずれも必ずこの関数を経由すること——新しい発火点を
 * 足すときも、判定ロジックをここ以外に複製しない。
 */
export function shouldMarkSeen(paneVisible: boolean, windowFocused: boolean): boolean {
  return paneVisible && windowFocused;
}

/**
 * session 内の pane を掃引し、`shouldMarkSeen` を満たすものだけ既読を進める
 * （20260925-seen-semantics-fix。design「設計方針」）。`main.ts`（export を持たず単体テスト
 * できないエントリポイント）から独立してテストできるよう、ここへ切り出した。
 */
export function sweepMarkSeen(
  panes: Iterable<Pick<Pane, "id" | "agent">>,
  isVisible: (paneId: string) => boolean,
  windowFocused: boolean,
  markSeen: (instanceId: string, seq: number) => void,
): void {
  for (const pane of panes) {
    if (pane.agent && shouldMarkSeen(isVisible(pane.id), windowFocused)) {
      markSeen(pane.agent.instanceId, pane.agent.completionSeq);
    }
  }
}
