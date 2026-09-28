import { describe, expect, it } from "vitest";
import { CliUsageError, parseArgs, USAGE_LINES } from "./cliArgs.js";

/** `sodactl graph …`（20260927-agent-graph の 05 T1）。 */
const noEnv = {} as NodeJS.ProcessEnv;
const OPTS = { url: "http://127.0.0.1:7780", token: undefined };

function usageError(argv: string[]): CliUsageError {
  try {
    parseArgs(argv, noEnv);
  } catch (err) {
    if (err instanceof CliUsageError) return err;
    throw err;
  }
  throw new Error(`expected a usage error: ${argv.join(" ")}`);
}

describe("parseArgs — graph", () => {
  it("show・pause・resume（--json は表の代わりに JSON）", () => {
    expect(parseArgs(["graph", "show"], noEnv)).toEqual({
      kind: "graph",
      opts: OPTS,
      json: false,
      action: { kind: "show" },
    });
    expect(parseArgs(["graph", "pause", "--json"], noEnv)).toEqual({
      kind: "graph",
      opts: OPTS,
      json: true,
      action: { kind: "pause" },
    });
    expect(parseArgs(["graph", "resume", "--url", "http://h:1"], noEnv)).toMatchObject({
      action: { kind: "resume" },
      opts: { url: "http://h:1" },
    });
  });

  it("link add: 既定はトリガ。設定のフラグを読む", () => {
    expect(parseArgs(["graph", "link", "add", "p1", "reviewer"], noEnv)).toEqual({
      kind: "graph",
      opts: OPTS,
      json: false,
      action: { kind: "link-add", from: "p1", to: "reviewer", linkKind: "trigger", config: {} },
    });
    expect(
      parseArgs(
        [
          "graph",
          "link",
          "add",
          "p1",
          "box:p7",
          "--on",
          "blocked",
          "--prompt",
          "見て {output}",
          "--output",
          "120",
          "--when-busy",
          "skip",
          "--limit",
          "3",
          "--json",
        ],
        noEnv,
      ),
    ).toMatchObject({
      json: true,
      action: {
        kind: "link-add",
        from: "p1",
        to: "box:p7",
        linkKind: "trigger",
        config: { on: "blocked", prompt: "見て {output}", output: 120, whenBusy: "skip", limit: 3 },
      },
    });
    expect(parseArgs(["graph", "link", "add", "p1", "p2", "--no-output"], noEnv)).toMatchObject({
      action: { config: { output: null } },
    });
    expect(
      parseArgs(
        [
          "graph",
          "link",
          "add",
          "p1",
          "p2",
          "--kind",
          "approval",
          "--mode",
          "delegate",
          "--lines",
          "60",
        ],
        noEnv,
      ),
    ).toMatchObject({
      action: { linkKind: "approval", config: { mode: "delegate", lines: 60 } },
    });
    expect(
      parseArgs(
        ["graph", "link", "add", "p1", "p2", "--kind", "supervise", "--limit", "100"],
        noEnv,
      ),
    ).toMatchObject({
      action: { linkKind: "supervise", config: { limit: 100 } },
    });
  });

  it("link add: 種類に使えない設定・範囲の外の値・欠けた端は使い方の誤り", () => {
    expect(
      usageError(["graph", "link", "add", "p1", "p2", "--kind", "supervise", "--prompt", "x"])
        .message,
    ).toMatch(/--prompt cannot be used with a supervise link/);
    expect(usageError(["graph", "link", "add", "p1", "p2", "--mode", "delegate"]).message).toMatch(
      /--mode cannot be used with a trigger link/,
    );
    expect(
      usageError(["graph", "link", "add", "p1", "p2", "--kind", "approval", "--no-output"]).message,
    ).toMatch(/--no-output/);
    expect(() => parseArgs(["graph", "link", "add", "p1", "p2", "--kind", "watch"], noEnv)).toThrow(
      CliUsageError,
    );
    expect(() => parseArgs(["graph", "link", "add", "p1", "p2", "--limit", "0"], noEnv)).toThrow(
      CliUsageError,
    );
    expect(() => parseArgs(["graph", "link", "add", "p1", "p2", "--limit", "101"], noEnv)).toThrow(
      CliUsageError,
    );
    expect(() => parseArgs(["graph", "link", "add", "p1", "p2", "--output", "501"], noEnv)).toThrow(
      CliUsageError,
    );
    expect(() => parseArgs(["graph", "link", "add", "p1", "p2", "--output", "1.5"], noEnv)).toThrow(
      CliUsageError,
    );
    expect(() => parseArgs(["graph", "link", "add", "p1", "p2", "--on", "idle"], noEnv)).toThrow(
      CliUsageError,
    );
    expect(() =>
      parseArgs(["graph", "link", "add", "p1", "p2", "--output", "5", "--no-output"], noEnv),
    ).toThrow(CliUsageError);
    expect(() => parseArgs(["graph", "link", "add", "p1"], noEnv)).toThrow(CliUsageError);
    expect(() => parseArgs(["graph", "link", "add", "p1", "p2", "p3"], noEnv)).toThrow(
      CliUsageError,
    );
  });

  it("link set: 変える項目が 1 つは要る。種類の検査は実行時（線の種類をまだ知らない）", () => {
    expect(parseArgs(["graph", "link", "set", "l3", "--mode", "delegate"], noEnv)).toMatchObject({
      action: { kind: "link-set", linkId: "l3", config: { mode: "delegate" } },
    });
    expect(usageError(["graph", "link", "set", "l3"]).message).toMatch(/nothing to change/);
    expect(usageError(["graph", "link", "set", "x3", "--limit", "2"]).message).toMatch(
      /invalid link id/,
    );
  });

  it("link rm・pause・resume は線の id を 1 つ取る", () => {
    for (const sub of ["rm", "pause", "resume"] as const) {
      expect(parseArgs(["graph", "link", sub, "l12"], noEnv)).toMatchObject({
        action: { kind: `link-${sub}`, linkId: "l12" },
      });
      expect(() => parseArgs(["graph", "link", sub], noEnv)).toThrow(CliUsageError);
      expect(() => parseArgs(["graph", "link", sub, "l1", "l2"], noEnv)).toThrow(CliUsageError);
      expect(() => parseArgs(["graph", "link", sub, "l0"], noEnv)).toThrow(CliUsageError);
    }
  });

  it("node add（複数）・rm・rekey", () => {
    expect(parseArgs(["graph", "node", "add", "p1", "box:p2"], noEnv)).toMatchObject({
      action: { kind: "node-add", panes: ["p1", "box:p2"] },
    });
    expect(parseArgs(["graph", "node", "rm", "p1"], noEnv)).toMatchObject({
      action: { kind: "node-rm", pane: "p1" },
    });
    expect(parseArgs(["graph", "node", "rekey", "p1", "p9"], noEnv)).toMatchObject({
      action: { kind: "node-rekey", pane: "p1", newPane: "p9" },
    });
    expect(() => parseArgs(["graph", "node", "add"], noEnv)).toThrow(CliUsageError);
    expect(() => parseArgs(["graph", "node", "rekey", "p1"], noEnv)).toThrow(CliUsageError);
    expect(() => parseArgs(["graph", "node", "move", "p1"], noEnv)).toThrow(
      /unknown subcommand: sodactl graph node move/,
    );
  });

  it("history（線を省けば全体・--limit）", () => {
    expect(parseArgs(["graph", "history"], noEnv)).toMatchObject({
      action: { kind: "history", linkId: undefined, limit: undefined },
    });
    expect(parseArgs(["graph", "history", "l2", "--limit", "5", "--json"], noEnv)).toMatchObject({
      json: true,
      action: { kind: "history", linkId: "l2", limit: 5 },
    });
    expect(() => parseArgs(["graph", "history", "--limit", "0"], noEnv)).toThrow(CliUsageError);
  });

  it("未知のサブコマンド・オプションは使い方の誤り（案内は graph の行）", () => {
    const err = usageError(["graph", "draw"]);
    expect(err.message).toBe("unknown subcommand: sodactl graph draw");
    expect(err.hint).toContain("sodactl graph link add");
    expect(err.hint).not.toContain("sodactl pane split");
    expect(() => parseArgs(["graph"], noEnv)).toThrow(/unknown subcommand: sodactl graph$/);
    expect(() => parseArgs(["graph", "link"], noEnv)).toThrow(CliUsageError);
    expect(() => parseArgs(["graph", "show", "--prompt", "x"], noEnv)).toThrow(
      /unknown option: --prompt/,
    );
  });

  it("--machine の前置きでも使える（そのマシンのサーバのグラフ）", () => {
    expect(parseArgs(["--machine", "box", "graph", "show"], noEnv)).toMatchObject({
      kind: "graph",
      opts: { machine: "box" },
    });
  });

  it("USAGE_LINES に graph の 12 行がある（help と skill の検査が見る）", () => {
    expect(USAGE_LINES.filter((l) => l.startsWith("sodactl graph "))).toHaveLength(12);
  });
});
