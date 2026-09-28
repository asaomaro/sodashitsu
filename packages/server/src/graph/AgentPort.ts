import type { AgentInfo, PaneId } from "@sodashitsu/protocol";
import type { Disposable } from "../util/Disposable.js";

/**
 * エージェントへの口（20260927-agent-graph の architecture「AgentPort」）。手元（`LocalAgentPort`）と別のマシン（04 の `RemoteAgentPort`）を同じ形で扱い、
 * `GraphEngine` はノードの鍵のマシン部分で口を選ぶだけにする。
 */
export interface AgentStatusEvent {
  paneId: PaneId;
  /** null = エージェントが居ない（終了・pane が閉じた）。 */
  agent: AgentInfo | null;
}

/** `prompt` の失敗。`code` はサーバの方式の code（`agent_blocked`・`agent_not_found` 等）。 */
export class AgentPortError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AgentPortError";
  }
}

export interface AgentPort {
  /** `"local"` か マシンの id。 */
  readonly machine: string;
  /**
   * 繋がっていて使えるか（手元は常に true）。使えない間の `status` は null、`prompt`・`tail` は `machine_unavailable` で断る。
   * 使えるようになったら（繋ぎ直しを含む）`onAvailability(true)` の時点の `status` が基準（切れている間の変化は知らせない）。
   */
  available(): boolean;
  onStatus(cb: (e: AgentStatusEvent) => void): Disposable;
  onAvailability(cb: (up: boolean) => void): Disposable;
  /** 今のエージェント（居なければ・pane が無ければ null）。 */
  status(paneId: PaneId): AgentInfo | null;
  /** マシンの呼び名（手元は null。別のマシンは登録簿の label。監督の知らせ・承認の代理の文面。04）。 */
  machineLabel(): string | null;
  /** pane の呼び名（`paneNameOf`）。pane が無ければ null。 */
  paneName(paneId: PaneId): string | null;
  /** 画面の末尾 `lines` 行（末尾の空行を除いてから数える。制御文字を落とした平文）。 */
  tail(paneId: PaneId, lines: number): Promise<string>;
  /** `agent.prompt` と同じ送信。失敗は `AgentPortError`（blocked は `agent_blocked`）。 */
  prompt(paneId: PaneId, text: string): Promise<void>;
}
