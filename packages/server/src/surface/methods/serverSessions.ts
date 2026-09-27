import { ServerSessionsParams } from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

/**
 * 同じ session の根の session の一覧（20260926-named-session-ui。herdr の `session list` を画面から）。認証済みの WebSocket でだけ届く
 * （`/ws` の upgrade が Cookie と Origin を検査する）。依存が無ければ空の一覧（テストの組み立て等）。
 */
export function registerServerSessionMethods(surface: ControlSurface, deps: MethodDeps): void {
  surface.register("server.sessions", {
    schema: ServerSessionsParams,
    handler: async () => ({ sessions: deps.serverSessions ? await deps.serverSessions() : [] }),
  });
}
