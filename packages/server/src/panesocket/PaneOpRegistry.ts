import type { z } from "zod";
import { RpcError, type PaneSocketResponse } from "@sodashitsu/protocol";
import type { Logger } from "../log/Logger.js";

/** 操作の handler に渡す、呼び出しの文脈。 */
export interface PaneOpContext {
  /** 要求が名乗った pane（受け口が実在を確かめた後の値）。 */
  paneId: string;
  /** 接続ごとの名前 `pane-socket:<連番>`（持ち主として使える。ほかの接続と重ならない）。 */
  connId: string;
  /** 返事の前に接続が切れた・受け口が閉じた、で abort する。 */
  signal: AbortSignal;
}

export interface PaneOpDef<P> {
  name: string;
  params: z.ZodType<P>;
  /** 結果は JSON にできる値。`RpcError` を投げれば、その code の返事になる。 */
  handler(ctx: PaneOpContext, params: P): Promise<unknown> | unknown;
}

/**
 * ログイン不要の受け口（`pane.sock`）に載せる操作の登録表（20261003-sodactl-ask-socket の design「サーバ: 操作の登録」）。
 * 受け口はここに登録した名前しか呼ばない（`/ws` の RPC は通さない）。
 *
 * **載せてよい操作の条件**（受け口はファイルの権限だけで守られ、認証が無い）: (1) 対象が呼び出し元の pane に限られる、
 * (2) pane のプログラムがもともと出来ることを超えない（pane の入出力・ほかの pane・設定・認証に触れない）、(3) 秘密を返さない、
 * (4) 量の上限がある。`/ws` の handler をそのまま登録しない。
 */
export class PaneOpRegistry {
  private readonly ops = new Map<string, PaneOpDef<unknown>>();

  constructor(private readonly logger?: Pick<Logger, "warn">) {}

  /** 同じ名前の二重登録は throw（起動時の誤りを早く出す）。 */
  register<P>(def: PaneOpDef<P>): void {
    if (this.ops.has(def.name)) throw new Error(`pane op is already registered: ${def.name}`);
    this.ops.set(def.name, def as unknown as PaneOpDef<unknown>);
  }

  has(name: string): boolean {
    return this.ops.has(name);
  }

  /**
   * 検査して呼ぶ。知らない操作 → `unknown_op`、schema 違反 → `invalid_params`、`RpcError` → その code、想定外 → `internal`（詳細はログだけ）。
   * `rawParams` の省略（`undefined`）だけを `{}` として扱う（`null` はそのまま schema に通す）。投げない（どの失敗も返事の形にする）。
   */
  async invoke(name: string, ctx: PaneOpContext, rawParams: unknown): Promise<PaneSocketResponse> {
    const def = this.ops.get(name);
    if (!def) return { ok: false, error: { code: "unknown_op", message: `unknown op: ${name}` } };
    const parsed = def.params.safeParse(rawParams === undefined ? {} : rawParams);
    if (!parsed.success) {
      return { ok: false, error: { code: "invalid_params", message: parsed.error.message } };
    }
    try {
      // handler は `try` の中で `await` する（同期の throw——`AskService.open` の検査の誤り等——も、Promise の reject も同じ所で拾う）。
      const result = await def.handler(ctx, parsed.data);
      return { ok: true, result };
    } catch (err) {
      if (err instanceof RpcError) return { ok: false, error: err.toProtocolError() };
      // 想定外の例外は詳細を呼び出し側へ漏らさない（内部パス等が含まれうる）。サーバ側にだけ残す。引数の中身は書かない。
      this.logger?.warn("pane socket: unhandled error in op handler", {
        op: name,
        paneId: ctx.paneId,
        connId: ctx.connId,
        error: String(err instanceof Error ? (err.stack ?? err.message) : err),
      });
      return { ok: false, error: { code: "internal", message: "internal error" } };
    }
  }
}
