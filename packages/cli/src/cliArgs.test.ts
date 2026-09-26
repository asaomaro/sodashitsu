import { describe, expect, it } from "vitest";
import { CliUsageError, DEFAULT_URL, parseArgs } from "./cliArgs.js";

const noEnv = {} as NodeJS.ProcessEnv;

describe("parseArgs — help", () => {
  it.each([[], ["help"], ["--help"], ["-h"]])("%s -> help", (...argv) => {
    expect(parseArgs(argv, noEnv)).toEqual({ kind: "help" });
  });
});

describe("parseArgs — global opts (--url/--token, env fallback, defaults)", () => {
  it("既定は DEFAULT_URL・token 無し", () => {
    expect(parseArgs(["snapshot"], noEnv)).toEqual({ kind: "snapshot", opts: { url: DEFAULT_URL, token: undefined } });
  });
  it("--url/--token を優先する", () => {
    expect(parseArgs(["snapshot", "--url", "http://h:1", "--token", "t"], noEnv)).toEqual({
      kind: "snapshot",
      opts: { url: "http://h:1", token: "t" },
    });
  });
  it("環境変数 WTMCTL_URL/WTMCTL_TOKEN にフォールバックする", () => {
    const env = { WTMCTL_URL: "http://envhost:2", WTMCTL_TOKEN: "envtoken" } as NodeJS.ProcessEnv;
    expect(parseArgs(["snapshot"], env)).toEqual({ kind: "snapshot", opts: { url: "http://envhost:2", token: "envtoken" } });
  });
  it("--url は環境変数より優先する", () => {
    const env = { WTMCTL_URL: "http://envhost:2" } as NodeJS.ProcessEnv;
    expect(parseArgs(["snapshot", "--url", "http://flag:3"], env)).toEqual({ kind: "snapshot", opts: { url: "http://flag:3", token: undefined } });
  });
});

describe("parseArgs — login", () => {
  it("--token 必須", () => {
    expect(() => parseArgs(["login", "--url", "http://h:1"], noEnv)).toThrow(CliUsageError);
  });
  it("正常系", () => {
    expect(parseArgs(["login", "--url", "http://h:1", "--token", "t"], noEnv)).toEqual({
      kind: "login",
      opts: { url: "http://h:1", token: "t" },
    });
  });
});

describe("parseArgs — workspace", () => {
  it("create（フラグ無し）", () => {
    expect(parseArgs(["workspace", "create"], noEnv)).toEqual({
      kind: "workspace-create",
      opts: { url: DEFAULT_URL, token: undefined },
      cwd: undefined,
      label: undefined,
    });
  });
  it("create --cwd --label", () => {
    expect(parseArgs(["workspace", "create", "--cwd", "/repo", "--label", "api"], noEnv)).toEqual({
      kind: "workspace-create",
      opts: { url: DEFAULT_URL, token: undefined },
      cwd: "/repo",
      label: "api",
    });
  });
  it("close は workspaceId が必須", () => {
    expect(() => parseArgs(["workspace", "close"], noEnv)).toThrow(CliUsageError);
  });
  it("close 正常系", () => {
    expect(parseArgs(["workspace", "close", "w1"], noEnv)).toEqual({
      kind: "workspace-close",
      opts: { url: DEFAULT_URL, token: undefined },
      workspaceId: "w1",
    });
  });
  it("rename は workspaceId と label が必須", () => {
    expect(() => parseArgs(["workspace", "rename", "w1"], noEnv)).toThrow(CliUsageError);
  });
  it("rename 正常系", () => {
    expect(parseArgs(["workspace", "rename", "w1", "new-name"], noEnv)).toEqual({
      kind: "workspace-rename",
      opts: { url: DEFAULT_URL, token: undefined },
      workspaceId: "w1",
      label: "new-name",
    });
  });
  it("余分な位置引数は拒否する", () => {
    expect(() => parseArgs(["workspace", "close", "w1", "extra"], noEnv)).toThrow(CliUsageError);
  });
  it("未知のサブコマンドは拒否する", () => {
    expect(() => parseArgs(["workspace", "delete", "w1"], noEnv)).toThrow(CliUsageError);
  });
  it("サブコマンド自体が無い場合も拒否する", () => {
    expect(() => parseArgs(["workspace"], noEnv)).toThrow(CliUsageError);
  });
});

describe("parseArgs — tab", () => {
  it("create（フラグ無し）", () => {
    expect(parseArgs(["tab", "create"], noEnv)).toEqual({
      kind: "tab-create",
      opts: { url: DEFAULT_URL, token: undefined },
      workspaceId: undefined,
      label: undefined,
    });
  });
  it("create --workspace --label", () => {
    expect(parseArgs(["tab", "create", "--workspace", "w1", "--label", "logs"], noEnv)).toEqual({
      kind: "tab-create",
      opts: { url: DEFAULT_URL, token: undefined },
      workspaceId: "w1",
      label: "logs",
    });
  });
  it("close は tabId が必須", () => {
    expect(() => parseArgs(["tab", "close"], noEnv)).toThrow(CliUsageError);
  });
  it("サブコマンド自体が無い場合も拒否する", () => {
    expect(() => parseArgs(["tab"], noEnv)).toThrow(CliUsageError);
  });
});

describe("parseArgs — pane split", () => {
  it("--direction は必須", () => {
    expect(() => parseArgs(["pane", "split", "p1"], noEnv)).toThrow(CliUsageError);
  });
  it("--direction が right/down 以外なら拒否する", () => {
    expect(() => parseArgs(["pane", "split", "p1", "--direction", "up"], noEnv)).toThrow(CliUsageError);
  });
  it("正常系（--ratio 省略）", () => {
    expect(parseArgs(["pane", "split", "p1", "--direction", "right"], noEnv)).toEqual({
      kind: "pane-split",
      opts: { url: DEFAULT_URL, token: undefined },
      paneId: "p1",
      direction: "right",
      ratio: undefined,
    });
  });
  it("--ratio は 0.05〜0.95 の範囲を受け付ける", () => {
    expect(parseArgs(["pane", "split", "p1", "--direction", "down", "--ratio", "0.3"], noEnv)).toMatchObject({ ratio: 0.3 });
  });
  it.each(["0.04", "0.96", "abc", "-1"])("--ratio %s は範囲外・非数値として拒否する", (bad) => {
    expect(() => parseArgs(["pane", "split", "p1", "--direction", "down", "--ratio", bad], noEnv)).toThrow(CliUsageError);
  });
});

describe("parseArgs — pane close/input/run", () => {
  it("サブコマンド自体が無い場合も拒否する", () => {
    expect(() => parseArgs(["pane"], noEnv)).toThrow(CliUsageError);
  });
  it("close は paneId が必須", () => {
    expect(() => parseArgs(["pane", "close"], noEnv)).toThrow(CliUsageError);
  });
  it("--で始まるテキストは未知のオプションとして拒否される（既知の制約）", () => {
    expect(() => parseArgs(["pane", "input", "p1", "--not-a-flag"], noEnv)).toThrow(CliUsageError);
  });
  it("input は paneId と text が必須", () => {
    expect(() => parseArgs(["pane", "input", "p1"], noEnv)).toThrow(CliUsageError);
  });
  it("input 正常系", () => {
    expect(parseArgs(["pane", "input", "p1", "echo hi"], noEnv)).toEqual({
      kind: "pane-input",
      opts: { url: DEFAULT_URL, token: undefined },
      paneId: "p1",
      text: "echo hi",
    });
  });
  it("run は paneId と command が必須", () => {
    expect(() => parseArgs(["pane", "run", "p1"], noEnv)).toThrow(CliUsageError);
  });
  it("run 正常系", () => {
    expect(parseArgs(["pane", "run", "p1", "ls -la"], noEnv)).toEqual({
      kind: "pane-run",
      opts: { url: DEFAULT_URL, token: undefined },
      paneId: "p1",
      command: "ls -la",
    });
  });
});

describe("parseArgs — pane read", () => {
  it("既定（--follow/--raw 無し・--timeout 既定 5000）", () => {
    expect(parseArgs(["pane", "read", "p1"], noEnv)).toEqual({
      kind: "pane-read",
      opts: { url: DEFAULT_URL, token: undefined },
      paneId: "p1",
      follow: false,
      raw: false,
      timeoutMs: 5000,
    });
  });
  it("--follow --raw --timeout", () => {
    expect(parseArgs(["pane", "read", "p1", "--follow", "--raw", "--timeout", "1000"], noEnv)).toEqual({
      kind: "pane-read",
      opts: { url: DEFAULT_URL, token: undefined },
      paneId: "p1",
      follow: true,
      raw: true,
      timeoutMs: 1000,
    });
  });
  it.each(["0", "-1", "abc", "1.5"])("--timeout %s は正の整数以外として拒否する", (bad) => {
    expect(() => parseArgs(["pane", "read", "p1", "--timeout", bad], noEnv)).toThrow(CliUsageError);
  });
});

// 20260926-pane-direct-connect。
describe("parseArgs — pane attach", () => {
  it("既定は --takeover 無し", () => {
    expect(parseArgs(["pane", "attach", "p1"], noEnv)).toEqual({
      kind: "pane-attach",
      opts: { url: DEFAULT_URL, token: undefined },
      paneId: "p1",
      takeover: false,
    });
  });
  it("--takeover と --url/--token", () => {
    expect(parseArgs(["pane", "attach", "p1", "--takeover", "--url", "http://h:1", "--token", "t"], noEnv)).toEqual({
      kind: "pane-attach",
      opts: { url: "http://h:1", token: "t" },
      paneId: "p1",
      takeover: true,
    });
  });
  it.each([
    [["pane", "attach"]],
    [["pane", "attach", "p1", "p2"]],
    [["pane", "attach", "p1", "--cols", "80"]],
    [["pane", "attach", "p1", "--takeover", "yes"]],
  ])("%j は使用誤り", (argv) => {
    expect(() => parseArgs(argv, noEnv)).toThrow(CliUsageError);
  });
});

// 20260926-pane-observe-control。
describe("parseArgs — pane observe / pane control", () => {
  it("observe は paneId と --url/--token だけ", () => {
    expect(parseArgs(["pane", "observe", "p1", "--url", "http://h:1", "--token", "t"], noEnv)).toEqual({
      kind: "pane-observe",
      opts: { url: "http://h:1", token: "t" },
      paneId: "p1",
    });
  });
  it("control の既定は 120x40・--takeover 無し（AC6）", () => {
    expect(parseArgs(["pane", "control", "p1"], noEnv)).toEqual({
      kind: "pane-control",
      opts: { url: DEFAULT_URL, token: undefined },
      paneId: "p1",
      takeover: false,
      cols: 120,
      rows: 40,
    });
  });
  it("control の --takeover・--cols・--rows（上限ちょうど 1000 と下限 1）", () => {
    expect(parseArgs(["pane", "control", "p1", "--takeover", "--cols", "1000", "--rows", "1"], noEnv)).toMatchObject({
      kind: "pane-control",
      takeover: true,
      cols: 1000,
      rows: 1,
    });
  });
  it.each([
    [["pane", "observe"]],
    [["pane", "observe", "p1", "p2"]],
    [["pane", "observe", "p1", "--cols", "80"]],
    [["pane", "observe", "p1", "--rows", "24"]],
    [["pane", "observe", "p1", "--takeover"]],
    [["pane", "control"]],
    [["pane", "control", "p1", "p2"]],
    [["pane", "control", "p1", "--cols", "0"]],
    [["pane", "control", "p1", "--cols", "1001"]],
    [["pane", "control", "p1", "--rows", "1001"]],
    [["pane", "control", "p1", "--rows", "-5"]],
    [["pane", "control", "p1", "--cols", "8.5"]],
    [["pane", "control", "p1", "--cols", "abc"]],
    [["pane", "control", "p1", "--cols"]],
    [["pane", "control", "p1", "--scroll"]],
  ])("%j は使用誤り（AC6）", (argv) => {
    expect(() => parseArgs(argv, noEnv)).toThrow(CliUsageError);
  });
  it.each(["0", "1001", "-5", "8.5", "abc"])("--cols %s の案内は範囲つきの同じ文言", (v) => {
    try {
      parseArgs(["pane", "control", "p1", "--cols", v], noEnv);
      throw new Error("expected a usage error");
    } catch (err) {
      expect(err).toBeInstanceOf(CliUsageError);
      expect((err as CliUsageError).hint).toBe("--cols は 1〜1000 の整数にしてください。");
    }
  });
});

describe("parseArgs — snapshot/watch", () => {
  it("snapshot に余分な位置引数は拒否する", () => {
    expect(() => parseArgs(["snapshot", "extra"], noEnv)).toThrow(CliUsageError);
  });
  it("watch 既定は --json 無し", () => {
    expect(parseArgs(["watch"], noEnv)).toEqual({ kind: "watch", opts: { url: DEFAULT_URL, token: undefined }, json: false });
  });
  it("watch --json", () => {
    expect(parseArgs(["watch", "--json"], noEnv)).toEqual({ kind: "watch", opts: { url: DEFAULT_URL, token: undefined }, json: true });
  });
});

describe("parseArgs — 未知のオプション・値の欠落・未知のコマンド（変異的な誤り入力の網羅）", () => {
  it("未知のトップレベルコマンド", () => {
    expect(() => parseArgs(["bogus"], noEnv)).toThrow(CliUsageError);
  });
  it("未知のオプション", () => {
    expect(() => parseArgs(["snapshot", "--bogus"], noEnv)).toThrow(CliUsageError);
  });
  it("値の無いオプション（末尾）", () => {
    expect(() => parseArgs(["snapshot", "--url"], noEnv)).toThrow(CliUsageError);
  });
  it("値の無いオプション（次が別のフラグ）", () => {
    expect(() => parseArgs(["snapshot", "--url", "--token", "t"], noEnv)).toThrow(CliUsageError);
  });
  it("bool フラグに値を渡そうとしても、その値は位置引数として扱われ余分な引数エラーになる", () => {
    expect(() => parseArgs(["watch", "--json", "extra"], noEnv)).toThrow(CliUsageError);
  });
});

describe("parseArgs — agent", () => {
  const opts = { url: DEFAULT_URL, token: undefined };
  it("list", () => {
    expect(parseArgs(["agent", "list"], noEnv)).toEqual({ kind: "agent-list", opts });
  });
  it("get <paneId>", () => {
    expect(parseArgs(["agent", "get", "p1"], noEnv)).toEqual({ kind: "agent-get", opts, paneId: "p1" });
  });
  it("wait: --until 省略・--timeout 省略なら until は空・timeoutMs は undefined（無期限）", () => {
    expect(parseArgs(["agent", "wait", "p1"], noEnv)).toEqual({ kind: "agent-wait", opts, paneId: "p1", until: [], timeoutMs: undefined });
  });
  it("wait: --until を繰り返すと順に集める・--timeout は正の整数", () => {
    expect(parseArgs(["agent", "wait", "p1", "--until", "idle", "--timeout", "1500", "--until", "done"], noEnv)).toEqual({
      kind: "agent-wait",
      opts,
      paneId: "p1",
      until: ["idle", "done"],
      timeoutMs: 1500,
    });
  });
  it("wait: --timeout は Node のタイマーの上限 2147483647 まで受ける", () => {
    expect(parseArgs(["agent", "wait", "p1", "--timeout", "2147483647"], noEnv)).toMatchObject({ timeoutMs: 2147483647 });
  });
  it("read: 既定は 80 行・raw 無し・timeout 5000", () => {
    expect(parseArgs(["agent", "read", "p1"], noEnv)).toEqual({ kind: "agent-read", opts, paneId: "p1", lines: 80, raw: false, timeoutMs: 5000 });
  });
  it("read: --lines/--raw/--timeout", () => {
    expect(parseArgs(["agent", "read", "p1", "--lines", "5", "--raw", "--timeout", "900"], noEnv)).toEqual({
      kind: "agent-read",
      opts,
      paneId: "p1",
      lines: 5,
      raw: true,
      timeoutMs: 900,
    });
  });
  // 20260926-agent-prompt-send-keys
  it("prompt: --wait 無しなら until は空・timeoutMs は undefined", () => {
    expect(parseArgs(["agent", "prompt", "p1", "line1\nline2"], noEnv)).toEqual({
      kind: "agent-prompt",
      opts,
      paneId: "p1",
      text: "line1\nline2",
      wait: false,
      until: [],
      timeoutMs: undefined,
    });
  });
  it("prompt: --wait と --until の繰り返し・--timeout", () => {
    expect(parseArgs(["agent", "prompt", "p1", "hi", "--wait", "--until", "idle", "--until", "blocked", "--timeout", "120000"], noEnv)).toEqual({
      kind: "agent-prompt",
      opts,
      paneId: "p1",
      text: "hi",
      wait: true,
      until: ["idle", "blocked"],
      timeoutMs: 120000,
    });
    expect(parseArgs(["agent", "prompt", "p1", "hi", "--wait"], noEnv)).toMatchObject({ wait: true, until: [], timeoutMs: undefined });
  });
  it("send-keys: paneId の後の位置引数を全部キーとして集める", () => {
    expect(parseArgs(["agent", "send-keys", "p1", "esc", "C-c", "enter"], noEnv)).toEqual({
      kind: "agent-send-keys",
      opts,
      paneId: "p1",
      keys: ["esc", "C-c", "enter"],
    });
  });
  it.each([
    [["agent", "wait", "p1", "--until", "finished"]],
    [["agent", "wait", "p1", "--until"]],
    [["agent", "wait", "p1", "--timeout", "0"]],
    [["agent", "wait", "p1", "--timeout", "1.5"]],
    [["agent", "wait", "p1", "--timeout", "2147483648"]],
    [["agent", "wait"]],
    [["agent", "wait", "p1", "p2"]],
    [["agent", "read", "p1", "--lines", "0"]],
    [["agent", "read", "p1", "--lines", "x"]],
    [["agent", "read", "p1", "--follow"]],
    [["agent", "read"]],
    [["agent", "get"]],
    [["agent", "get", "p1", "p2"]],
    [["agent", "list", "p1"]],
    [["agent", "start"]],
    [["agent"]],
    [["agent", "prompt"]],
    [["agent", "prompt", "p1"]],
    [["agent", "prompt", "p1", "hi", "extra"]],
    [["agent", "prompt", "p1", "hi", "--until", "idle"]],
    [["agent", "prompt", "p1", "hi", "--timeout", "1000"]],
    [["agent", "prompt", "p1", "hi", "--wait", "--until", "finished"]],
    [["agent", "prompt", "p1", "hi", "--wait", "--timeout", "0"]],
    [["agent", "prompt", "p1", "hi", "--wait", "--timeout", "2147483648"]],
    [["agent", "prompt", "p1", "hi", "--raw"]],
    [["agent", "send-keys"]],
    [["agent", "send-keys", "p1"]],
    [["agent", "send-keys", "p1", "esc", "--wait"]],
  ])("使い方の誤り: %j", (argv) => {
    expect(() => parseArgs(argv, noEnv)).toThrow(CliUsageError);
  });
});

// 20260926-agent-start-rename（AC6）。
describe("parseArgs — agent rename", () => {
  const opts = { url: DEFAULT_URL, token: undefined };
  it("<target> <name> で名前を付け、<target> --clear で外す", () => {
    expect(parseArgs(["agent", "rename", "p1", "reviewer"], noEnv)).toEqual({ kind: "agent-rename", opts, paneId: "p1", name: "reviewer" });
    expect(parseArgs(["agent", "rename", "reviewer", "--clear"], noEnv)).toEqual({ kind: "agent-rename", opts, paneId: "reviewer", name: null });
    expect(parseArgs(["agent", "rename", "--clear", "p1"], noEnv)).toMatchObject({ paneId: "p1", name: null });
  });
  it("名前の書式は CLI では検査しない（サーバが invalid_agent_name で返す）", () => {
    expect(parseArgs(["agent", "rename", "p1", "Bad.Name"], noEnv)).toMatchObject({ name: "Bad.Name" });
  });
  it.each([
    [["agent", "rename"]],
    [["agent", "rename", "p1"]],
    [["agent", "rename", "p1", "reviewer", "--clear"]],
    [["agent", "rename", "p1", "reviewer", "extra"]],
    [["agent", "rename", "p1", "--clear", "extra"]],
    [["agent", "rename", "p1", "--wait"]],
  ])("使い方の誤り: %j", (argv) => {
    expect(() => parseArgs(argv, noEnv)).toThrow(CliUsageError);
  });
});
