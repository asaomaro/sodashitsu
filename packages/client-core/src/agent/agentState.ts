import type { AgentInfo, DisplayState, Pane } from "@sodashitsu/protocol";

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
