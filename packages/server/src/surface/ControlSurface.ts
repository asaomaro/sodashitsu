import type { z } from "zod";
import { RpcError, type ErrorCode, type MethodName } from "@sodashitsu/protocol";
import type { ClientSink } from "../terminal/OutputFanout.js";
// `session/SessionService.js` の再エクスポート経由で取る（architecture.md の依存表に無い
// `session/SessionModel` への直接依存を避ける。レビュー指摘・round2）。
import { NotFoundError } from "../session/SessionService.js";
import type { Logger } from "../log/Logger.js";

export interface MethodContext {
  clientId: string;
  sink: ClientSink;
}

export interface MethodDef<P = unknown, R = unknown> {
  schema: z.ZodType<P>;
  handler(ctx: MethodContext, params: P): Promise<R> | R;
}

export type InvokeResult = { ok: true; result: unknown } | { ok: false; error: { code: ErrorCode; message: string } };

/** 方式名 → ハンドラの登録表（architecture.md「ControlSurface」・依存の規則 2）。 */
export class ControlSurface {
  private readonly methods = new Map<string, MethodDef>();

  constructor(private readonly logger?: Logger) {}

  register<P, R>(name: MethodName, def: MethodDef<P, R>): void {
    this.methods.set(name, def as unknown as MethodDef);
  }

  async invoke(ctx: MethodContext, name: string, rawParams: unknown): Promise<InvokeResult> {
    const def = this.methods.get(name);
    if (!def) return { ok: false, error: { code: "not_found", message: `unknown method: ${name}` } };
    const parsed = def.schema.safeParse(rawParams);
    if (!parsed.success) {
      return { ok: false, error: { code: "invalid_params", message: parsed.error.message } };
    }
    try {
      const result = await def.handler(ctx, parsed.data);
      return { ok: true, result };
    } catch (err) {
      if (err instanceof RpcError) return { ok: false, error: err.toProtocolError() };
      // `SessionModel` の `requireX` 系が投げる素の NotFoundError（`RpcError` を使わない箇所がある）も
      // 同じ規約で not_found に読み替える（レビュー指摘。個々のメソッドで都度ガードするのをやめる）。
      if (err instanceof NotFoundError) return { ok: false, error: { code: "not_found", message: err.message } };
      // 想定外の例外は詳細をクライアントへ漏らさない（内部パス等が含まれうる）。サーバ側にだけ残す。
      this.logger?.error("unhandled error in method handler", { method: name, error: String(err instanceof Error ? (err.stack ?? err.message) : err) });
      return { ok: false, error: { code: "internal", message: "internal error" } };
    }
  }
}
