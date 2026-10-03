import { describe, expect, it } from "vitest";
import { CliUsageError, parseArgs } from "./cliArgs.js";

/** `sodactl agent start` の引数（20260926-agent-start design「CLI の引数」。AC5・AC15）。 */

const ENV = {};

function usageError(argv: string[]): CliUsageError {
  try {
    parseArgs(argv, ENV);
  } catch (err) {
    if (err instanceof CliUsageError) return err;
    throw err;
  }
  throw new Error("expected a CliUsageError");
}

describe("parseArgs — agent start", () => {
  it("名前・--kind・--pane・--timeout と、-- の後のエージェントへの引数を読む", () => {
    expect(
      parseArgs(
        [
          "agent",
          "start",
          "reviewer",
          "--kind",
          "claude",
          "--pane",
          "p3",
          "--timeout",
          "5000",
          "--",
          "--model",
          "x",
        ],
        ENV,
      ),
    ).toEqual({
      kind: "agent-start",
      opts: { url: "http://127.0.0.1:7780", token: undefined, urlExplicit: false },
      name: "reviewer",
      agentKind: "claude",
      paneId: "p3",
      timeoutMs: 5000,
      args: ["--model", "x"],
    });
  });

  it("-- の後は --kind・--pane・--url・-- もそのまま引数になる。-- が無ければ引数は空・timeout は省略（AC15）", () => {
    const cmd = parseArgs(
      [
        "agent",
        "start",
        "r",
        "--pane",
        "p1",
        "--kind",
        "codex",
        "--",
        "--kind",
        "gemini",
        "--url",
        "http://x",
        "--",
        "",
      ],
      ENV,
    );
    expect(cmd).toMatchObject({
      agentKind: "codex",
      paneId: "p1",
      args: ["--kind", "gemini", "--url", "http://x", "--", ""],
    });
    expect(cmd).toMatchObject({ opts: { url: "http://127.0.0.1:7780" } });
    expect(
      parseArgs(["agent", "start", "r", "--kind", "codex", "--pane", "p1"], ENV),
    ).toMatchObject({
      args: [],
      timeoutMs: undefined,
    });
  });

  it("表に無い kind は使用誤りで、一覧を案内する（AC5）", () => {
    for (const kind of ["sh", "claude-code", "Claude", "omp", "__proto__", "bash -c id"]) {
      const err = usageError(["agent", "start", "r", "--kind", kind, "--pane", "p1"]);
      expect(err.message).toContain("unsupported interactive agent kind");
      expect(err.hint).toContain("claude");
    }
  });

  it("--timeout が整数でなければ使用誤り。範囲はサーバが判定するので 3000 も読む（AC15）", () => {
    for (const t of ["abc", "1.5", "-1", "1e4", " 5000"]) {
      expect(
        usageError(["agent", "start", "r", "--kind", "claude", "--pane", "p1", "--timeout", t])
          .message,
      ).toContain("--timeout");
    }
    expect(
      parseArgs(
        ["agent", "start", "r", "--kind", "claude", "--pane", "p1", "--timeout", "3000"],
        ENV,
      ),
    ).toMatchObject({
      timeoutMs: 3000,
    });
  });

  it("名前・--kind・--pane の欠落、-- より前の余分な位置引数、未知のオプションは使用誤り", () => {
    expect(usageError(["agent", "start"]).message).toBe("missing name");
    expect(usageError(["agent", "start", "--kind", "claude", "--pane", "p1"]).message).toBe(
      "missing name",
    );
    expect(usageError(["agent", "start", "r", "--pane", "p1"]).message).toBe(
      "missing required --kind",
    );
    expect(usageError(["agent", "start", "r", "--kind", "claude"]).message).toBe(
      "missing required --pane",
    );
    expect(
      usageError(["agent", "start", "r", "extra", "--kind", "claude", "--pane", "p1"]).message,
    ).toBe("unexpected argument: extra");
    expect(
      usageError(["agent", "start", "r", "--kind", "claude", "--pane", "p1", "--model", "x"])
        .message,
    ).toBe("unknown option: --model");
    expect(usageError(["agent", "start", "r", "--kind", "--", "claude"]).message).toBe(
      "missing value for --kind",
    );
  });
});
