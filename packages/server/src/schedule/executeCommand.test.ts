import { expect, it } from "vitest";
import { executeScheduledCommand } from "./executeCommand.js";
it.skipIf(process.platform === "win32")(
  "captures cwd, output and non-zero exit status",
  async () => {
    const result = await executeScheduledCommand(
      "pwd; printf stderr >&2; exit 7",
      "/tmp",
      new AbortController().signal,
    );
    expect(result).toMatchObject({ status: "failed", exitCode: 7 });
    expect(result.output).toContain("/tmp");
    expect(result.output).toContain("stderr");
  },
);
it.skipIf(process.platform === "win32")(
  "aborts the command process group",
  async () => {
    const abort = new AbortController();
    const pending = executeScheduledCommand("sleep 60", "/tmp", abort.signal);
    setTimeout(() => abort.abort(), 30);
    const result = await pending;
    expect(result.status).toBe("failed");
    expect(result.output).toContain("中断");
  },
  3000,
);
