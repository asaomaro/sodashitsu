import { expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { WorkMethods, WorkTransferMethods } from "@sodashitsu/protocol";
import { registerWorkMethods } from "./work.js";
import { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";
it("keeps work and transfer methods off unauthenticated/internal/pane contexts", async () => {
  const work = { binding: vi.fn(), inspect: vi.fn(), scope: vi.fn(), skill: vi.fn(), memory: vi.fn() }, transfers = { exportStart: vi.fn(), exportRead: vi.fn(), importStart: vi.fn(), importChunk: vi.fn(), importFinish: vi.fn() };
  const surface = new ControlSurface(); registerWorkMethods(surface, { work, workTransfers: transfers, exec: { start: vi.fn() } } as unknown as MethodDeps);
  const scope = { workspaceId: randomUUID(), expectedFolder: "/target", agentKind: "codex" };
  const id = randomUUID(), params: Record<string, unknown> = {
    "work.binding": { action: "get", paneId: id }, "work.inspect": scope, "work.exec": { ...scope, command: "true" },
    "work.skill": { ...scope, id: "a".repeat(64) }, "work.memory": { ...scope, action: "list", sourcePaneId: id },
    "work.export_start": { paneId: id }, "work.export_read": { id, offset: 0 },
    "work.import_start": { ...scope, meta: { kind: "codex", sessionId: id, sourcePaneId: id, bytes: 1, sha256: "a".repeat(64), memories: [], warnings: [] } },
    "work.import_chunk": { id, offset: 0, data: "YQ==" }, "work.import_finish": { id },
  };
  const base = { clientId: "a", sink: { clientId: "a", bufferedAmount: 0, sendOutput() {}, sendSnapshot() {} } };
  for (const name of Object.keys({ ...WorkMethods, ...WorkTransferMethods })) for (const ctx of [base, { ...base, connection: {} }, { ...base, connection: {}, connectionAuthorized: () => false }])
    expect(await surface.invoke(ctx as never, name, params[name])).toMatchObject({ ok: false, error: { code: "unauthorized" } });
  for (const fn of [...Object.values(work), ...Object.values(transfers)]) expect(fn).not.toHaveBeenCalled();
});
