import type { ServerSessionEntry } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { ControlSurface } from "../ControlSurface.js";
import type { ClientSink } from "../../terminal/OutputFanout.js";
import type { MethodDeps } from "./deps.js";
import { registerServerSessionMethods } from "./serverSessions.js";

/** 20260926-named-session-ui（AC4）。 */
describe("server.sessions", () => {
  const ctx = { clientId: "c1", sink: {} as ClientSink };

  it("依存の一覧をそのまま sessions で返す", async () => {
    const sessions: ServerSessionEntry[] = [
      { name: "default", default: true, running: true, current: true },
    ];
    const surface = new ControlSurface();
    registerServerSessionMethods(surface, {
      serverSessions: () => Promise.resolve(sessions),
    } as unknown as MethodDeps);
    expect(await surface.invoke(ctx, "server.sessions", {})).toEqual({
      ok: true,
      result: { sessions },
    });
  });

  it("依存が無ければ空の一覧", async () => {
    const surface = new ControlSurface();
    registerServerSessionMethods(surface, {} as MethodDeps);
    expect(await surface.invoke(ctx, "server.sessions", {})).toEqual({
      ok: true,
      result: { sessions: [] },
    });
  });
});
