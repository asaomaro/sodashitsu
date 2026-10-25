import { expect, it } from "vitest";
import { workAgentProxyCloseMessage } from "./workAgentProxy.js";
it("renders only fixed lifecycle reasons, ignoring arbitrary text and prototype keys", () => {
  expect(workAgentProxyCloseMessage("lease_expired")).toContain("24時間");
  for (const reason of ["__proto__", "constructor", "private secret path", {}, null])
    expect(workAgentProxyCloseMessage(reason)).toBeUndefined();
});
