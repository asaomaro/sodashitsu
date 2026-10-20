import { expect, it } from "vitest";
import { WorkBinding, WorkMethods, WorkTransferMethods } from "./work.js";
const scope = { workspaceId: "w3", expectedFolder: "/project", agentKind: "codex" };
it("accepts restored legacy entity IDs for every work entry point", () => {
  expect(WorkMethods["work.binding"].safeParse({ action: "get", paneId: "p3" }).success).toBe(true);
  expect(WorkMethods["work.inspect"].safeParse(scope).success).toBe(true);
  expect(WorkMethods["work.memory"].safeParse({ ...scope, sourcePaneId: "p3", action: "list" }).success).toBe(true);
  expect(WorkTransferMethods["work.export_start"].safeParse({ paneId: "p3" }).success).toBe(true);
  expect(WorkBinding.safeParse({ machineId: "a".repeat(32), workspaceId: "w3", folder: "/project", root: "/project", identity: "a".repeat(64), agentKind: "codex", sourceSession: null }).success).toBe(true);
});
it.each(["../p3", "p3/other", "p3\\other", ".", "..", "C:project", "p\0", "", "CON", "NUL", "COM1"])("rejects unsafe stored ID components %j", id => {
  expect(WorkMethods["work.binding"].safeParse({ action: "get", paneId: id }).success).toBe(false);
  expect(WorkMethods["work.inspect"].safeParse({ ...scope, workspaceId: id }).success).toBe(false);
  expect(WorkMethods["work.memory"].safeParse({ ...scope, sourcePaneId: id, action: "read" }).success).toBe(false);
});
