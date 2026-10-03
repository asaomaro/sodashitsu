import { describe, expect, it } from "vitest";
import { z } from "zod";
import { RpcError } from "@sodashitsu/protocol";
import { MemoryLogger } from "../log/Logger.js";
import { askOpenOp } from "./askOp.js";
import { PaneOpRegistry, type PaneOpContext, type PaneOpDef } from "./PaneOpRegistry.js";

const EchoParams = z.object({
  text: z.string().max(16),
  fail: z.enum(["rpc", "sync", "crash"]).optional(),
});

/** テスト用の操作: 受け取った文脈と引数をそのまま返す。`fail` で失敗の種類を選ぶ。 */
function echoOp(): PaneOpDef<z.infer<typeof EchoParams>> {
  return {
    name: "test.echo",
    params: EchoParams,
    handler: (ctx, p) => {
      // `AskService.open` と同じ、Promise を返す前の同期の throw。
      if (p.fail === "sync") throw new RpcError("ask_busy", "busy (sync)");
      return (async () => {
        await Promise.resolve();
        if (p.fail === "rpc") throw new RpcError("not_found", "nothing here");
        if (p.fail === "crash") throw new Error("secret detail /home/user/x");
        return { text: p.text, paneId: ctx.paneId, connId: ctx.connId };
      })();
    },
  };
}

function ctx(overrides: Partial<PaneOpContext> = {}): PaneOpContext {
  return {
    paneId: "p1",
    connId: "pane-socket:1",
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe("PaneOpRegistry", () => {
  it("登録した操作を呼び、結果を返す。handler は要求の paneId と connId を受け取る（AC13・AC16）", async () => {
    const registry = new PaneOpRegistry();
    registry.register(echoOp());

    const res = await registry.invoke(
      "test.echo",
      ctx({ paneId: "p7", connId: "pane-socket:42" }),
      { text: "hi" },
    );

    expect(res).toEqual({
      ok: true,
      result: { text: "hi", paneId: "p7", connId: "pane-socket:42" },
    });
  });

  it("has は登録した名前だけ真", () => {
    const registry = new PaneOpRegistry();
    expect(registry.has("test.echo")).toBe(false);
    registry.register(echoOp());
    expect(registry.has("test.echo")).toBe(true);
    expect(registry.has("pane.write")).toBe(false);
  });

  it("同じ名前の二重登録は throw し、先の登録は残る", async () => {
    const registry = new PaneOpRegistry();
    registry.register(echoOp());

    expect(() =>
      registry.register({ name: "test.echo", params: z.object({}), handler: () => "second" }),
    ).toThrow(/test\.echo/);

    expect(await registry.invoke("test.echo", ctx(), { text: "a" })).toMatchObject({
      ok: true,
      result: { text: "a" },
    });
  });

  it("知らない操作は unknown_op（handler は呼ばない）", async () => {
    const registry = new PaneOpRegistry();
    registry.register(echoOp());

    const res = await registry.invoke("pane.write", ctx(), { text: "x" });

    expect(res).toMatchObject({ ok: false, error: { code: "unknown_op" } });
  });

  it("引数が schema に合わなければ invalid_params（handler は呼ばない）", async () => {
    const registry = new PaneOpRegistry();
    let called = 0;
    registry.register({ ...echoOp(), handler: () => ++called });

    expect(await registry.invoke("test.echo", ctx(), { text: 1 })).toMatchObject({
      ok: false,
      error: { code: "invalid_params" },
    });
    expect(await registry.invoke("test.echo", ctx(), { text: "x".repeat(17) })).toMatchObject({
      ok: false,
      error: { code: "invalid_params" },
    });
    expect(await registry.invoke("test.echo", ctx(), "text")).toMatchObject({
      ok: false,
      error: { code: "invalid_params" },
    });
    expect(called).toBe(0);
  });

  it("引数の省略は {} として検査する", async () => {
    const registry = new PaneOpRegistry();
    registry.register({ name: "test.noargs", params: z.object({}), handler: (c) => c.paneId });
    registry.register(echoOp());

    expect(await registry.invoke("test.noargs", ctx(), undefined)).toEqual({
      ok: true,
      result: "p1",
    });
    // 必須の項目がある操作では、省略は schema 違反。
    expect(await registry.invoke("test.echo", ctx(), undefined)).toMatchObject({
      ok: false,
      error: { code: "invalid_params" },
    });
  });

  it("null は省略ではない: {} に置き換えず、schema に通して invalid_params", async () => {
    const registry = new PaneOpRegistry();
    let called = 0;
    registry.register({ name: "test.noargs", params: z.object({}), handler: () => ++called });

    expect(await registry.invoke("test.noargs", ctx(), null)).toMatchObject({
      ok: false,
      error: { code: "invalid_params" },
    });
    expect(called).toBe(0);
  });

  it("handler が投げた RpcError は、その code と message の返事になる", async () => {
    const registry = new PaneOpRegistry();
    registry.register(echoOp());

    const res = await registry.invoke("test.echo", ctx(), { text: "x", fail: "rpc" });

    expect(res).toEqual({ ok: false, error: { code: "not_found", message: "nothing here" } });
  });

  it("handler の同期の throw（Promise を返す前の RpcError）も拾う", async () => {
    const registry = new PaneOpRegistry();
    registry.register(echoOp());

    const res = await registry.invoke("test.echo", ctx(), { text: "x", fail: "sync" });

    expect(res).toEqual({ ok: false, error: { code: "ask_busy", message: "busy (sync)" } });
  });

  it("想定外の例外は internal。詳細は返事に出さず、ログにだけ残す（引数の中身は書かない）", async () => {
    const logger = new MemoryLogger();
    const registry = new PaneOpRegistry(logger);
    registry.register(echoOp());

    const res = await registry.invoke("test.echo", ctx({ paneId: "p3", connId: "pane-socket:9" }), {
      text: "TOP-SECRET-TEXT",
      fail: "crash",
    });

    expect(res).toEqual({ ok: false, error: { code: "internal", message: "internal error" } });
    const warns = logger.lines.filter((l) => l.level === "warn");
    expect(warns).toHaveLength(1);
    expect(warns[0]?.fields).toMatchObject({
      op: "test.echo",
      paneId: "p3",
      connId: "pane-socket:9",
    });
    expect(String(warns[0]?.fields?.error)).toContain("secret detail");
    expect(JSON.stringify(logger.lines)).not.toContain("TOP-SECRET-TEXT");
  });
});
