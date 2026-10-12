import { expect, it } from "vitest";
import { WorkspaceToolsParams } from "./workspaceTools.js";
import { WorkspaceProjectFolderParams } from "./messages.js";
it("accepts restored legacy workspace IDs consistently with project folder settings", () => {
  for (const workspaceId of ["w3", "2028afa2-0459-488c-8cd2-b33aa297e799"]) {
    expect(
      WorkspaceProjectFolderParams.parse({ workspaceId, path: "/workspaces/sodashitsu" })
        .workspaceId,
    ).toBe(workspaceId);
    for (const operation of [
      "list",
      "read",
      "write",
      "search",
      "git-log",
      "git-status",
      "git-diff",
    ] as const)
      expect(WorkspaceToolsParams.parse({ workspaceId, operation }).workspaceId).toBe(workspaceId);
  }
  expect(WorkspaceToolsParams.safeParse({ workspaceId: "", operation: "list" }).success).toBe(
    false,
  );
});
