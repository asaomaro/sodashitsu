import type { AgentInfo } from "@sodashitsu/protocol";
import { SUPERVISOR_DEBOUNCE_MS } from "@sodashitsu/client-core";

/**
 * 監督役 1 つへの知らせの決定（20260927-agent-graph の design「監督」・decisions D1-5）。**純粋**——時刻は入力で受ける。
 *
 * - 「知らせが要る」の印: 監督役ができたとき（最初）・配下の顔ぶれ（線の追加・削除・配下のノードの無効化）が変わったとき。
 *   監督役の pane で別のエージェントが立ち上がっても送り直さない（線は pane に付いたまま残るので、新しく立ち上げたエージェントに、起動の直後に
 *   古い配下の知らせが届いてしまう）。
 * - 続く変化は 1 回にまとめる: 最後の変化から `SUPERVISOR_DEBOUNCE_MS` 待つ。
 * - 送るのは監督役の手が空いている（idle）ときだけ。作業中・承認待ち・起動直後（unknown）・居ない間は印を持ったまま待つ。一時停止の間も待つ。
 */
export type SupervisorInput =
  | { kind: "subordinates"; signature: string; at: number }
  | { kind: "supervisor"; agent: AgentInfo | null; at: number }
  | { kind: "paused"; paused: boolean; at: number }
  | { kind: "tick"; at: number };

export type SupervisorDecision = { kind: "send" } | null;

export class SupervisorNotifier {
  private signature: string;
  private supervisor: AgentInfo | null;
  private paused: boolean;
  /** 知らせが要る（最後の変化の時刻）。null = 要らない。 */
  private dirtyAt: number | null;

  constructor(initial: {
    signature: string;
    supervisor: AgentInfo | null;
    paused: boolean;
    at: number;
    /**
     * 知らせが要る状態で始めるか（既定は true＝今できた線）。サーバを起動し直した（`soda handoff` を含む）ときに、起動の前からあった線は false:
     * 線は保存されたまま残るので、起動のたびに同じ知らせを送り直さない。後から配下の顔ぶれが変われば、通常どおり知らせる。
     */
    pending?: boolean;
  }) {
    this.signature = initial.signature;
    this.supervisor = initial.supervisor;
    this.paused = initial.paused;
    this.dirtyAt = initial.pending === false ? null : initial.at;
  }

  /** 知らせを待っているか（試験用）。 */
  get pending(): boolean {
    return this.dirtyAt !== null;
  }

  handle(input: SupervisorInput): SupervisorDecision {
    switch (input.kind) {
      case "subordinates":
        if (input.signature !== this.signature) {
          this.signature = input.signature;
          this.dirtyAt = input.at;
        }
        break;
      case "supervisor": {
        this.supervisor = input.agent;
        break;
      }
      case "paused":
        this.paused = input.paused;
        break;
      case "tick":
        break;
      default:
        input satisfies never;
    }
    return this.decide(input.at);
  }

  /** 送れなかった（送信の失敗）。印を戻して、次に手が空いたときに送り直す。 */
  retry(at: number): void {
    this.dirtyAt = at;
  }

  private decide(at: number): SupervisorDecision {
    if (this.dirtyAt === null || this.paused) return null;
    if (this.supervisor?.state !== "idle") return null;
    if (at - this.dirtyAt < SUPERVISOR_DEBOUNCE_MS) return null;
    this.dirtyAt = null;
    return { kind: "send" };
  }
}

/** 配下の顔ぶれの署名（順に依らない）。呼び名・種類の変化では知らせ直さない（鍵だけ）。 */
export function subordinatesSignature(keys: readonly string[]): string {
  return [...keys].sort().join(",");
}
