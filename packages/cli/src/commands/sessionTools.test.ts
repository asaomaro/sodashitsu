import { expect, it, vi, afterEach } from "vitest";
import { parseArgs, type Command } from "../cliArgs.js";
import { runSessionTools } from "./sessionTools.js";
import { callPaneOp } from "../paneSocket.js";
import type { SessionStore } from "../session.js";
vi.mock("../paneSocket.js", async (original) => ({
  ...(await original<typeof import("../paneSocket.js")>()),
  callPaneOp: vi.fn(),
}));
afterEach(() => vi.restoreAllMocks());
it("allows the agent to read its own session notes via the read-only pane socket without logging in", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const cmd = parseArgs(
    ["agent", "notes"],
    {
      SODA_PANE_ID: id,
      SODA_SERVER_URL: "http://127.0.0.1:7780",
      SODA_PANE_SOCKET: "/tmp/test/pane.sock",
    },
    "linux",
  ) as Extract<Command, { kind: "agent-session-tools" }>;
  vi.mocked(callPaneOp).mockResolvedValueOnce({
    kind: "result",
    result: { kind: "claude", sessionId: "s1", notes: [{ title: "決定事項", body: "本文" }] },
  });
  const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  await runSessionTools(cmd, {} as SessionStore);
  expect(callPaneOp).toHaveBeenCalledWith(
    "/tmp/test/pane.sock",
    { op: "agent.notes", paneId: id },
    expect.anything(),
  );
  expect(output.mock.calls.flat().join("")).toContain("本文");
});
it("parses explicit targets and rejects a missing target outside a pane", async () => {
  const cmd = parseArgs(["agent", "todos", "abcd"], {}) as Extract<
    Command,
    { kind: "agent-session-tools" }
  >;
  expect(cmd).toMatchObject({ kind: "agent-session-tools", tool: "todos", paneId: "abcd" });
  await expect(runSessionTools({ ...cmd, paneId: undefined }, {} as SessionStore)).rejects.toThrow(
    /target required/,
  );
});
