import { RpcError } from "@sodashitsu/protocol";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import type { ClientSink } from "../terminal/OutputFanout.js";
import { MemoryLogger } from "../log/Logger.js";
import { ControlSurface } from "./ControlSurface.js";

const fakeSink: ClientSink = { clientId: "c1", sendOutput: () => undefined, sendSnapshot: () => undefined, bufferedAmount: 0 };
const ctx = { clientId: "c1", sink: fakeSink };

describe("ControlSurface", () => {
  it("returns not_found for an unregistered method", async () => {
    const surface = new ControlSurface();
    const result = await surface.invoke(ctx, "workspace.create", {});
    expect(result).toEqual({ ok: false, error: { code: "not_found", message: expect.stringContaining("workspace.create") } });
  });

  it("validates params with the registered zod schema and returns invalid_params on mismatch", async () => {
    const surface = new ControlSurface();
    surface.register("workspace.create", { schema: z.object({ label: z.string() }), handler: (_c, p) => ({ label: p.label }) });
    const bad = await surface.invoke(ctx, "workspace.create", { label: 5 });
    expect(bad.ok).toBe(false);
    if (bad.ok) throw new Error("unreachable");
    expect(bad.error.code).toBe("invalid_params");
  });

  it("calls the handler with validated params and returns its result on success", async () => {
    const surface = new ControlSurface();
    surface.register("workspace.rename", { schema: z.object({ n: z.number() }), handler: (_c, p) => ({ doubled: p.n * 2 }) });
    const result = await surface.invoke(ctx, "workspace.rename", { n: 21 });
    expect(result).toEqual({ ok: true, result: { doubled: 42 } });
  });

  it("passes ctx through to the handler unchanged", async () => {
    const surface = new ControlSurface();
    let seen: typeof ctx | null = null;
    surface.register("workspace.focus", { schema: z.object({}), handler: (c) => ((seen = c), {}) });
    await surface.invoke(ctx, "workspace.focus", {});
    expect(seen).toEqual(ctx);
  });

  it("converts a thrown RpcError into its protocol error shape", async () => {
    const surface = new ControlSurface();
    surface.register("pane.focus", {
      schema: z.object({}),
      handler: () => {
        throw new RpcError("not_found", "pane not found: p9");
      },
    });
    const result = await surface.invoke(ctx, "pane.focus", {});
    expect(result).toEqual({ ok: false, error: { code: "not_found", message: "pane not found: p9" } });
  });

  it("converts an unexpected thrown error into a generic code 'internal' without leaking the raw message, but logs the real error server-side", async () => {
    // レビュー指摘: 以前はクライアントへ例外メッセージをそのまま転送しており、内部パス等が漏れうるうえ
    // サーバ側には何も残らなかった。今は汎用メッセージを返し、実際の内容はサーバのログにだけ残す。
    const logger = new MemoryLogger();
    const surface = new ControlSurface(logger);
    surface.register("pane.close", {
      schema: z.object({}),
      handler: () => {
        throw new Error("boom");
      },
    });
    const result = await surface.invoke(ctx, "pane.close", {});
    expect(result).toEqual({ ok: false, error: { code: "internal", message: "internal error" } });
    expect(logger.lines.some((l) => l.level === "error" && String(l.fields?.error).includes("boom"))).toBe(true);
  });

  it("supports async handlers", async () => {
    const surface = new ControlSurface();
    surface.register("tab.create", { schema: z.object({}), handler: async () => Promise.resolve({ ok: true }) });
    const result = await surface.invoke(ctx, "tab.create", {});
    expect(result).toEqual({ ok: true, result: { ok: true } });
  });
});
