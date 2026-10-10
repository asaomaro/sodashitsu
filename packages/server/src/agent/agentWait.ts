import type { AgentInfo } from "@sodashitsu/protocol";
import type { EventBus } from "../bus/EventBus.js";
import type { TerminalHost } from "../terminal/TerminalHost.js";

/**
 * サーバの中のできごと（`pane.agent_status_changed`・`pane.closed`）を聞く、小さな待ちの関数（20261009-agent-fork の A1）。
 * CLI の `StartWait` と同じ決まり（blocked は「手が空かない」、idle/done は手が空いた）を、サーバの側で使えるようにしたもの（CLI の側は変えない）。
 */

export type AgentWaitResult<T> = { ok: true; value: T } | { ok: false; reason: "timeout" | "pane_closed" | "aborted" };

export interface AgentWaitDeps {
  bus: Pick<EventBus, "subscribe">;
  /** その pane の、いまのエージェント（実在しなければ `undefined`）。 */
  agentOf(paneId: string): AgentInfo | null | undefined;
}

/**
 * `check` が値を返すまで待つ。最初に今の状態で確かめ、以後は pane のできごとのたびに確かめる。上限で `timeout`、pane が閉じたら `pane_closed`。
 * `signal` が中断されたら `aborted`。
 */
export function waitForAgent<T>(
  deps: AgentWaitDeps,
  paneId: string,
  check: (agent: AgentInfo | null) => T | undefined,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<AgentWaitResult<T>> {
  // 中断済みの signal は、購読も上限のタイマーも作らずに返す（後から聞いても発火しないため。R4）。
  if (signal?.aborted) return Promise.resolve({ ok: false, reason: "aborted" });
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: AgentWaitResult<T>): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub.dispose();
      signal?.removeEventListener("abort", onAbort);
      resolve(r);
    };
    const onAbort = (): void => finish({ ok: false, reason: "aborted" });
    const timer = setTimeout(() => finish({ ok: false, reason: "timeout" }), timeoutMs);
    timer.unref?.();
    const sub = deps.bus.subscribe((e) => {
      if (e.event === "pane.closed" && e.data.paneId === paneId) return finish({ ok: false, reason: "pane_closed" });
      if (e.event === "pane.agent_status_changed" && e.data.paneId === paneId) {
        const v = check(e.data.agent);
        if (v !== undefined) finish({ ok: true, value: v });
      }
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    const now = deps.agentOf(paneId);
    if (now === undefined) return finish({ ok: false, reason: "pane_closed" });
    const v = check(now);
    if (v !== undefined) finish({ ok: true, value: v });
  });
}

/** 検知された（種類が合う）エージェント。別の種類なら `kind_mismatch` を返す（待ちは終わる）。 */
export type DetectVerdict = { kind: "detected"; agent: AgentInfo } | { kind: "kind_mismatch"; found: string };

export function detectedAgent(expectedKind: string): (agent: AgentInfo | null) => DetectVerdict | undefined {
  return (agent) => {
    if (agent === null) return undefined;
    return agent.kind === expectedKind ? { kind: "detected", agent } : { kind: "kind_mismatch", found: agent.kind };
  };
}

/** 手が空いた（`free`）か、居なくなった（`gone`）。 */
export type HandsFreeVerdict = { kind: "free"; agent: AgentInfo } | { kind: "gone" };

/**
 * `instanceId` のエージェントが手が空く（idle。`done` も idle）のを待つ。blocked（承認・信頼の確認などの入力待ち）は**終わりにせず**、
 * 状態が blocked に替わるたびに `onBlocked` を呼んで待ち続ける（利用者が答えた後に idle になる。A8）。
 */
export function handsFree(instanceId: string, onBlocked?: (blocked: boolean) => void): (agent: AgentInfo | null) => HandsFreeVerdict | undefined {
  let wasBlocked = false;
  return (agent) => {
    if (agent === null || agent.instanceId !== instanceId) return { kind: "gone" };
    const blocked = agent.state === "blocked";
    if (blocked !== wasBlocked) {
      wasBlocked = blocked;
      onBlocked?.(blocked);
    }
    if (agent.state === "idle") return { kind: "free", agent };
    return undefined;
  };
}

/**
 * 作ったばかりの pane のシェルが、入力を受けられるようになるのを待つ（A2）。`isAvailable`（前面がシェルだけと判定される）で、かつ出力が `quietMs` 静まるまで。
 * 出力がまだ一度も無い間は、`minWaitMs` までは待つ（rc の読み込みが重いシェルが、最初の出力の前に「静か」に見えるのを避ける）。上限で false。
 */
export async function waitForShellReady(
  host: Pick<TerminalHost, "lastOutputAt">,
  isAvailable: () => Promise<boolean>,
  opts: { quietMs?: number; maxMs?: number; minWaitMs?: number; pollMs?: number; now?: () => number } = {},
): Promise<boolean> {
  const quietMs = opts.quietMs ?? 300;
  const maxMs = opts.maxMs ?? 5000;
  const minWaitMs = opts.minWaitMs ?? 2000;
  const pollMs = opts.pollMs ?? 50;
  const now = opts.now ?? Date.now;
  const start = now();
  const startOutput = host.lastOutputAt();
  for (;;) {
    const t = now();
    const sawOutput = host.lastOutputAt() !== startOutput;
    const quiet = t - host.lastOutputAt() >= quietMs;
    if (quiet && (sawOutput || t - start >= minWaitMs) && (await isAvailable())) return true;
    if (now() - start >= maxMs) return false;
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
