import type { NotifyKind } from "@sodashitsu/client-core";
import type { SoundPort, SoundResult } from "./ports.js";

/**
 * 通知音。**音源ファイルを同梱せず `OscillatorNode` で作る**（design の退けた代替案）——
 * ライセンスと容量が要らず、なにより **`AudioContext.state` で「鳴らせたか」を判定できる**（AC13）。
 * herdr が mp3 を埋め込んでいるのは外部プレイヤーに渡す都合で、ブラウザには当てはまらない。
 *
 * **自動再生の制限**はページの読み込みごとに利用者の操作を要求する。本製品は端末に打鍵するので
 * 実質ほぼ解除されるが、「開いて放置 → 別タブ → 最初の通知」は未解除で来うる。
 * そのとき **`"blocked"` を返して黙って捨てない**。
 */

/** 2 音の高さ（Hz）。入力待ちは**上がる**、完了は**下がる**——耳で区別できるように向きを変える（AC2）。 */
const TONES: Record<NotifyKind, readonly [number, number]> = {
  blocked: [660, 990],
  done: [880, 587],
};

const TONE_MS = 110;
const GAP_MS = 40;
/** 包絡線の立ち上がり。**付けないと start/stop でプツッというクリック音が出る**。 */
const ATTACK_S = 0.008;
const RELEASE_S = 0.09;

type AudioContextCtor = new () => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  const w = globalThis as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export class ToneSound implements SoundPort {
  /** **1 つを使い回す**（通知のたびに new すると上限に当たる）。 */
  #ctx: AudioContext | null = null;
  #unsupported = false;

  #context(): AudioContext | null {
    if (this.#unsupported) return null;
    if (this.#ctx) return this.#ctx;
    const Ctor = audioContextCtor();
    if (!Ctor) {
      this.#unsupported = true;
      return null;
    }
    try {
      this.#ctx = new Ctor();
      return this.#ctx;
    } catch {
      this.#unsupported = true;
      return null;
    }
  }

  play(kind: NotifyKind): SoundResult {
    const ctx = this.#context();
    if (!ctx) return "unsupported";
    // 利用者がこの画面をまだ操作していなければ `suspended` のまま——**鳴らない事実を返す**。
    // **ここでは解除しにいかない**。解除は `NotificationController.#unlockSound()` が握っていて
    // （成功したら「鳴らせませんでした」の印も下ろす）、ここで直に `unlock()` を呼ぶと
    // **その出口を迂回して印だけが残る**（タスク点検 T24 ラウンド2 の指摘）。
    if (ctx.state !== "running") return "blocked";

    try {
      const [a, b] = TONES[kind];
      this.#beep(ctx, a, ctx.currentTime);
      this.#beep(ctx, b, ctx.currentTime + (TONE_MS + GAP_MS) / 1000);
      return "played";
    } catch {
      return "blocked";
    }
  }

  /**
   * 自動再生の制限を解除する。**解除できたら `true`**（`ports.ts` の契約）。
   * 呼び口は `NotificationController.#unlockSound()` の 1 つだけ（案内の［許可する］・設定で音を
   * 「入」にしたとき・画面への操作・鳴らせなかった知らせの後）。**reject しない**（`ports.ts` の契約）。
   */
  async unlock(): Promise<boolean> {
    const ctx = this.#context();
    if (!ctx) return false;
    if (ctx.state === "running") return true;
    try {
      await ctx.resume();
    } catch {
      return false; // 失敗しても投げない。次の `play` が `"blocked"` を返すだけ
    }
    // **`await` の後の実物の値は型に反映されない**（早期 return で `"running"` 以外に絞られたまま）。
    // 持ち物のほうから読み直す（同じ `AudioContext` を指している）。
    return this.#ctx?.state === "running";
  }

  #beep(ctx: AudioContext, hz: number, at: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(hz, at);
    // 包絡線：無音 → 立ち上げ → 減衰。`exponentialRampToValueAtTime` は 0 を取れないので小さい値へ。
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.2, at + ATTACK_S);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + ATTACK_S + RELEASE_S);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + ATTACK_S + RELEASE_S + 0.01);
  }
}
