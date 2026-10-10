import type { AgentForkProgress, ForkCreated, ForkNoteStatus } from "@sodashitsu/protocol";
import { defineStore } from "pinia";
import { ref } from "vue";
import { useViewStore } from "./view.js";

/**
 * エージェントの fork の進み具合（20261009-agent-fork PR2）。サーバのできごと `agent.fork_progress`（`StoreAdapter` が渡す）と、
 * このブラウザが始めた fork の記録を持つ。**ダイアログを閉じても裏で続く**ので、結果のトースト（完了・失敗）はここから出す。
 * 古いサーバ（できごとが来ない）でも、`agent.fork` の応答（`started`）で pane と最初の知らせの状態が分かるので、進み具合が届かなくても表示は止まらない。
 * 進み具合が `FORK_STALL_MS`（サーバの待ちの上限 11 分）経っても終わりに届かないとき（接続が切れて、できごとを取りこぼした）は、
 * 「進み具合が届きません」の終わった記録にして、表示が残り続けないようにする（`sodactl agent get` で確かめてもらう）。
 */
/** 進み具合が届かないと見なす時間（サーバの待ちの上限 11 分）。 */
export const FORK_STALL_MS = 11 * 60 * 1000;
export const FORK_STALLED_MESSAGE = "進み具合が届きません（sodactl agent get で確かめてください）";
export interface ForkRun {
  sourcePaneId: string;
  /** このブラウザが始めたか（トーストを出す）。 */
  mine: boolean;
  /** 新しい pane（できてから）。 */
  paneId?: string;
  name?: string;
  stage: AgentForkProgress["stage"] | "starting";
  noteStatus?: ForkNoteStatus;
  noteReason?: string;
  /** `failed` のときの、サーバの文言と、残ったもの。 */
  message?: string;
  code?: string;
  created?: ForkCreated;
  /** 終わった（`done` か `failed`）。 */
  finished: boolean;
  ok: boolean;
  worktreePath?: string;
  /** 進み具合が届かないまま時間が経った（接続が切れて、できごとを取りこぼした）。 */
  stalled?: boolean;
}

export const useAgentForkStore = defineStore("agentFork", () => {
  const runs = ref<Record<string, ForkRun>>({});
  const stallTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function clearStall(sourcePaneId: string): void {
    const t = stallTimers.get(sourcePaneId);
    if (t !== undefined) clearTimeout(t);
    stallTimers.delete(sourcePaneId);
  }
  function armStall(sourcePaneId: string): void {
    clearStall(sourcePaneId);
    stallTimers.set(
      sourcePaneId,
      setTimeout(() => {
        stallTimers.delete(sourcePaneId);
        const cur = runs.value[sourcePaneId];
        if (cur === undefined || cur.finished) return;
        const next: ForkRun = { ...cur, stage: "failed", finished: true, ok: false, stalled: true, message: FORK_STALLED_MESSAGE };
        runs.value = { ...runs.value, [sourcePaneId]: next };
        if (next.mine) toastResult(next);
      }, FORK_STALL_MS),
    );
  }

  /** 始めた（応答を待つ間）。 */
  function begin(sourcePaneId: string): void {
    runs.value = { ...runs.value, [sourcePaneId]: { sourcePaneId, mine: true, stage: "starting", finished: false, ok: false } };
    armStall(sourcePaneId);
  }
  function forget(sourcePaneId: string): void {
    clearStall(sourcePaneId);
    const next = { ...runs.value };
    delete next[sourcePaneId];
    runs.value = next;
  }
  /** `agent.fork` の応答（新しい pane ができ、起動のコマンドを打ち込んだ）。 */
  function started(sourcePaneId: string, r: { paneId: string; name: string; worktreePath?: string; noteStatus: ForkNoteStatus; noteReason?: string }): void {
    const cur = runs.value[sourcePaneId];
    if (cur?.finished === true) return; // 進み具合のできごとのほうが先に終わっていた
    runs.value = {
      ...runs.value,
      [sourcePaneId]: {
        ...(cur ?? { sourcePaneId, mine: true, finished: false, ok: false }),
        stage: cur !== undefined && cur.stage !== "starting" ? cur.stage : "launched",
        paneId: r.paneId,
        name: r.name,
        ...(r.worktreePath !== undefined ? { worktreePath: r.worktreePath } : {}),
        noteStatus: r.noteStatus,
        ...(r.noteReason !== undefined ? { noteReason: r.noteReason } : {}),
      },
    };
  }
  /** 失敗の応答（`fork_unavailable` など。pane ができる前）。 */
  function failedEarly(sourcePaneId: string, message: string, code?: string): void {
    clearStall(sourcePaneId);
    runs.value = {
      ...runs.value,
      [sourcePaneId]: { sourcePaneId, mine: true, stage: "failed", finished: true, ok: false, message, ...(code !== undefined ? { code } : {}) },
    };
  }

  /** `agent.fork_progress`。 */
  function apply(p: AgentForkProgress): void {
    const cur = runs.value[p.sourcePaneId];
    const next: ForkRun = {
      sourcePaneId: p.sourcePaneId,
      mine: cur?.mine ?? false,
      ...(cur ?? {}),
      stage: p.stage,
      finished: p.stage === "done" || p.stage === "failed",
      ok: p.stage === "done",
    };
    if (p.paneId !== undefined) next.paneId = p.paneId;
    if (p.noteStatus !== undefined) next.noteStatus = p.noteStatus;
    if (p.noteReason !== undefined) next.noteReason = p.noteReason;
    if (p.message !== undefined) next.message = p.message;
    if (p.code !== undefined) next.code = p.code;
    if (p.created !== undefined) next.created = p.created;
    if (p.created?.worktreePath !== undefined) next.worktreePath = p.created.worktreePath;
    const wasFinished = cur?.finished === true;
    if (next.finished) clearStall(p.sourcePaneId);
    else if (cur?.mine === true) armStall(p.sourcePaneId); // 進み具合が届いている間は、待ちを延ばす
    runs.value = { ...runs.value, [p.sourcePaneId]: next };
    if (next.finished && !wasFinished && next.mine) toastResult(next);
  }

  function toastResult(r: ForkRun): void {
    const view = useViewStore();
    if (r.ok) {
      const note = r.noteStatus === "pending" ? "（最初の知らせは、まだ送っていません）" : r.noteStatus === "timed_out" ? "（最初の知らせは、送れませんでした）" : "";
      view.toast(`fork しました: ${r.name ?? "新しい pane"}${note}`);
    } else {
      view.toast(r.message ? `fork に失敗しました: ${r.message}` : "fork に失敗しました。");
    }
  }

  /** 終わった記録（完了・失敗）を忘れる。ダイアログを閉じたとき・開くときに呼ぶ（前の結果が次に出ないように）。進行中のものは残す。 */
  function forgetFinished(sourcePaneId: string): void {
    if (runs.value[sourcePaneId]?.finished === true) forget(sourcePaneId);
  }

  return { runs, begin, forget, forgetFinished, started, failedEarly, apply };
});
