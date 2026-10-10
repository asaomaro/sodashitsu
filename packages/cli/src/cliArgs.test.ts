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
    expect(parseArgs(["snapshot"], noEnv)).toEqual({ kind: "snapshot", opts: { url: DEFAULT_URL, token: undefined, urlExplicit: false } });
  });
  it("--url/--token を優先する", () => {
    expect(parseArgs(["snapshot", "--url", "http://h:1", "--token", "t"], noEnv)).toEqual({
      kind: "snapshot",
      opts: { url: "http://h:1", token: "t", urlExplicit: true },
    });
  });
  it("環境変数 SODACTL_URL/SODACTL_TOKEN にフォールバックする", () => {
    const env = { SODACTL_URL: "http://envhost:2", SODACTL_TOKEN: "envtoken" } as NodeJS.ProcessEnv;
    expect(parseArgs(["snapshot"], env)).toEqual({ kind: "snapshot", opts: { url: "http://envhost:2", token: "envtoken", urlExplicit: true } });
  });
  it("--url は環境変数より優先する", () => {
    const env = { SODACTL_URL: "http://envhost:2" } as NodeJS.ProcessEnv;
    expect(parseArgs(["snapshot", "--url", "http://flag:3"], env)).toEqual({ kind: "snapshot", opts: { url: "http://flag:3", token: undefined, urlExplicit: true } });
  });
});

describe("parseArgs — login", () => {
  it("--token 必須", () => {
    expect(() => parseArgs(["login", "--url", "http://h:1"], noEnv)).toThrow(CliUsageError);
  });
  it("正常系", () => {
    expect(parseArgs(["login", "--url", "http://h:1", "--token", "t"], noEnv)).toEqual({
      kind: "login",
      opts: { url: "http://h:1", token: "t", urlExplicit: true },
    });
  });
});

describe("parseArgs — workspace", () => {
  it("create（フラグ無し）", () => {
    expect(parseArgs(["workspace", "create"], noEnv)).toEqual({
      kind: "workspace-create",
      opts: { url: DEFAULT_URL, token: undefined, urlExplicit: false },
      cwd: undefined,
      label: undefined,
    });
  });
  it("create --cwd --label", () => {
    expect(parseArgs(["workspace", "create", "--cwd", "/repo", "--label", "api"], noEnv)).toEqual({
      kind: "workspace-create",
      opts: { url: DEFAULT_URL, token: undefined, urlExplicit: false },
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
      opts: { url: DEFAULT_URL, token: undefined, urlExplicit: false },
      workspaceId: "w1",
    });
  });
  it("rename は workspaceId と label が必須", () => {
    expect(() => parseArgs(["workspace", "rename", "w1"], noEnv)).toThrow(CliUsageError);
  });
  it("rename 正常系", () => {
    expect(parseArgs(["workspace", "rename", "w1", "new-name"], noEnv)).toEqual({
      kind: "workspace-rename",
      opts: { url: DEFAULT_URL, token: undefined, urlExplicit: false },
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
      opts: { url: DEFAULT_URL, token: undefined, urlExplicit: false },
      workspaceId: undefined,
      label: undefined,
    });
  });
  it("create --workspace --label", () => {
    expect(parseArgs(["tab", "create", "--workspace", "w1", "--label", "logs"], noEnv)).toEqual({
      kind: "tab-create",
      opts: { url: DEFAULT_URL, token: undefined, urlExplicit: false },
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
      opts: { url: DEFAULT_URL, token: undefined, urlExplicit: false },
      target: { kind: "id", paneId: "p1" },
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

describe("parseArgs — pane の対象の指定（20260927-caller-pane-default）", () => {
  const inPane = { SODA_PANE_ID: "p3", SODA_SERVER_URL: "http://127.0.0.1:7780" } as NodeJS.ProcessEnv;
  const split = (args: string[], env: NodeJS.ProcessEnv) => parseArgs(["pane", "split", ...args, "--direction", "down"], env);

  it("位置引数・--pane は明示の ID、--current は呼び出し元（AC2）", () => {
    expect(split(["p2"], inPane)).toMatchObject({ kind: "pane-split", target: { kind: "id", paneId: "p2" } });
    expect(split(["--pane", "p2"], inPane)).toMatchObject({ target: { kind: "id", paneId: "p2" } });
    expect(split(["--current"], inPane)).toMatchObject({ target: { kind: "caller", paneId: "p3", explicit: true } });
  });

  it("省略は pane の中なら呼び出し元、外ならフォーカスの pane（AC1・AC12）", () => {
    expect(split([], inPane)).toMatchObject({ target: { kind: "caller", paneId: "p3", explicit: false } });
    expect(split([], noEnv)).toMatchObject({ target: { kind: "focused" } });
    expect(split([], { SODA_PANE_ID: "" } as NodeJS.ProcessEnv)).toMatchObject({ target: { kind: "focused" } });
    // SODA_SERVER_URL が無くても pane の中（呼び出し元）とみなす——同じサーバかは実行時に確かめて断る（AC9）。
    expect(split([], { SODA_PANE_ID: "p3" } as NodeJS.ProcessEnv)).toMatchObject({ target: { kind: "caller", paneId: "p3", explicit: false } });
  });

  it.each([
    [["p2", "--pane", "p4"]],
    [["p2", "--current"]],
    [["--pane", "p2", "--current"]],
    [["p2", "p4"]],
    [["--pane"]],
  ])("pane split %j は使い方の誤り（AC3）", (args) => {
    expect(() => split(args, inPane)).toThrow(CliUsageError);
  });

  it("--current は SODA_PANE_ID が無ければ使い方の誤り（AC4）", () => {
    expect(() => split(["--current"], noEnv)).toThrow(/--current requires SODA_PANE_ID/);
    expect(() => parseArgs(["pane", "current", "--current"], { SODA_PANE_ID: "" } as NodeJS.ProcessEnv)).toThrow(/--current requires SODA_PANE_ID/);
  });

  it("pane current は --pane・--current・省略を受け、位置引数は取らない（AC5・AC7）", () => {
    expect(parseArgs(["pane", "current"], inPane)).toEqual({
      kind: "pane-current",
      opts: { url: "http://127.0.0.1:7780", token: undefined, urlExplicit: false, caller: { paneId: "p3", serverUrl: "http://127.0.0.1:7780" } },
      target: { kind: "caller", paneId: "p3", explicit: false },
    });
    expect(parseArgs(["pane", "current", "--current"], inPane)).toMatchObject({ target: { kind: "caller", explicit: true } });
    expect(parseArgs(["pane", "current", "--pane", "p2"], inPane)).toMatchObject({ target: { kind: "id", paneId: "p2" } });
    expect(parseArgs(["pane", "current"], noEnv)).toMatchObject({ target: { kind: "focused" } });
    expect(() => parseArgs(["pane", "current", "p2"], inPane)).toThrow(CliUsageError);
    expect(() => parseArgs(["pane", "current", "--pane", "p2", "--current"], inPane)).toThrow(CliUsageError);
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
      opts: { url: DEFAULT_URL, token: undefined, urlExplicit: false },
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
      opts: { url: DEFAULT_URL, token: undefined, urlExplicit: false },
      paneId: "p1",
      command: "ls -la",
    });
  });
});

describe("parseArgs — pane read", () => {
  it("既定（--follow/--raw 無し・--timeout 既定 5000）", () => {
    expect(parseArgs(["pane", "read", "p1"], noEnv)).toEqual({
      kind: "pane-read",
      opts: { url: DEFAULT_URL, token: undefined, urlExplicit: false },
      paneId: "p1",
      follow: false,
      raw: false,
      timeoutMs: 5000,
    });
  });
  it("--follow --raw --timeout", () => {
    expect(parseArgs(["pane", "read", "p1", "--follow", "--raw", "--timeout", "1000"], noEnv)).toEqual({
      kind: "pane-read",
      opts: { url: DEFAULT_URL, token: undefined, urlExplicit: false },
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
      opts: { url: DEFAULT_URL, token: undefined, urlExplicit: false },
      paneId: "p1",
      takeover: false,
    });
  });
  it("--takeover と --url/--token", () => {
    expect(parseArgs(["pane", "attach", "p1", "--takeover", "--url", "http://h:1", "--token", "t"], noEnv)).toEqual({
      kind: "pane-attach",
      opts: { url: "http://h:1", token: "t", urlExplicit: true },
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
      opts: { url: "http://h:1", token: "t", urlExplicit: true },
      paneId: "p1",
    });
  });
  it("control の既定は 120x40・--takeover 無し（AC6）", () => {
    expect(parseArgs(["pane", "control", "p1"], noEnv)).toEqual({
      kind: "pane-control",
      opts: { url: DEFAULT_URL, token: undefined, urlExplicit: false },
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
    expect(parseArgs(["watch"], noEnv)).toEqual({ kind: "watch", opts: { url: DEFAULT_URL, token: undefined, urlExplicit: false }, json: false });
  });
  it("watch --json", () => {
    expect(parseArgs(["watch", "--json"], noEnv)).toEqual({ kind: "watch", opts: { url: DEFAULT_URL, token: undefined, urlExplicit: false }, json: true });
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
  const opts = { url: DEFAULT_URL, token: undefined, urlExplicit: false };
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
  const opts = { url: DEFAULT_URL, token: undefined, urlExplicit: false };
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

describe("parseArgs — pane の中の接続先と呼び出し元（20260926-agent-skill-file）", () => {
  const inPane = { SODA_PANE_ID: "p1", SODA_SERVER_URL: "http://127.0.0.1:7790" } as NodeJS.ProcessEnv;

  it("--url > SODACTL_URL > SODA_SERVER_URL > 既定（AC10）", () => {
    const env = { ...inPane, SODACTL_URL: "http://envhost:2" } as NodeJS.ProcessEnv;
    expect(parseArgs(["snapshot", "--url", "http://flag:3"], env)).toMatchObject({ opts: { url: "http://flag:3" } });
    expect(parseArgs(["snapshot"], env)).toMatchObject({ opts: { url: "http://envhost:2" } });
    expect(parseArgs(["snapshot"], inPane)).toMatchObject({ opts: { url: "http://127.0.0.1:7790" } });
    expect(parseArgs(["snapshot"], { SODA_SERVER_URL: "" } as NodeJS.ProcessEnv)).toMatchObject({ opts: { url: DEFAULT_URL } });
  });

  it("SODA_PANE_ID と SODA_SERVER_URL がどちらもあれば caller を持つ", () => {
    expect(parseArgs(["snapshot"], inPane)).toEqual({
      kind: "snapshot",
      opts: { url: "http://127.0.0.1:7790", token: undefined, urlExplicit: false, caller: { paneId: "p1", serverUrl: "http://127.0.0.1:7790" } },
    });
  });

  it("--machine <local 以外> を付けると caller が無くなる。--machine local では残る", () => {
    const optsOf = (argv: string[]) => {
      const cmd = parseArgs(argv, inPane);
      if (!("opts" in cmd)) throw new Error(`no opts: ${cmd.kind}`);
      return cmd.opts;
    };
    expect(optsOf(["--machine", "box", "snapshot"]).caller).toBeUndefined();
    expect(optsOf(["--machine", "local", "snapshot"]).caller).toEqual({ paneId: "p1", serverUrl: "http://127.0.0.1:7790" });
  });

  it.each([
    ["SODA_PANE_ID が空", { SODA_PANE_ID: "", SODA_SERVER_URL: "http://127.0.0.1:7790" }],
    ["SODA_PANE_ID が無い", { SODA_SERVER_URL: "http://127.0.0.1:7790" }],
    ["SODA_SERVER_URL が無い", { SODA_PANE_ID: "p1" }],
    ["SODA_SERVER_URL が空", { SODA_PANE_ID: "p1", SODA_SERVER_URL: "" }],
  ])("%s なら caller を持たない（AC13）", (_label, env) => {
    const cmd = parseArgs(["snapshot"], env as NodeJS.ProcessEnv);
    expect(cmd.kind).toBe("snapshot");
    expect(cmd.kind === "snapshot" ? Object.keys(cmd.opts).sort() : []).toEqual(["token", "url", "urlExplicit"]);
  });
});

/** 20261003-sodactl-ask-socket（AC8・AC11）。 */
describe("parseArgs — 接続先を明示したかの印（urlExplicit）と受け口のパス（paneSocket）", () => {
  const inPane = { SODA_PANE_ID: "p1", SODA_SERVER_URL: "http://127.0.0.1:7790" } as NodeJS.ProcessEnv;
  const optsOf = (argv: string[], env: NodeJS.ProcessEnv, platform: NodeJS.Platform = "linux") => {
    const cmd = parseArgs(argv, env, platform);
    if (!("opts" in cmd)) throw new Error(`no opts: ${cmd.kind}`);
    return cmd.opts;
  };

  it("--url を指定すると urlExplicit（SODA_SERVER_URL と同じ文字列でも明示した扱い）", () => {
    expect(optsOf(["ask", "--url", "http://h:1"], noEnv).urlExplicit).toBe(true);
    expect(optsOf(["ask", "--url", "http://127.0.0.1:7790"], inPane)).toMatchObject({ url: "http://127.0.0.1:7790", urlExplicit: true });
  });

  it("空でない SODACTL_URL でも urlExplicit。空の SODACTL_URL は明示したことにしない", () => {
    expect(optsOf(["ask"], { ...inPane, SODACTL_URL: "http://envhost:2" }).urlExplicit).toBe(true);
    expect(optsOf(["ask"], { ...inPane, SODACTL_URL: "" }).urlExplicit).toBe(false);
  });

  it("空の SODACTL_URL のとき url は空文字のまま（`??` は空文字を通す）。明示した扱いにはしない", () => {
    // この作業（受け口の追加）より前からの挙動で、変えると全コマンドの接続先の決め方が変わるので、ここでは固定するだけにする。
    expect(optsOf(["ask"], { ...inPane, SODACTL_URL: "" })).toMatchObject({ url: "", urlExplicit: false });
    expect(optsOf(["snapshot"], { SODACTL_URL: "" } as NodeJS.ProcessEnv)).toMatchObject({ url: "", urlExplicit: false });
  });

  it("SODA_SERVER_URL・既定から決まった接続先は urlExplicit でない", () => {
    expect(optsOf(["ask"], inPane)).toMatchObject({ url: "http://127.0.0.1:7790", urlExplicit: false });
    expect(optsOf(["ask"], noEnv)).toMatchObject({ url: DEFAULT_URL, urlExplicit: false });
  });

  it("SODA_PANE_SOCKET があればそのパス（SODA_AGENT_REPORT_SOCKET からの導出より先）", () => {
    expect(optsOf(["ask"], { ...inPane, SODA_PANE_SOCKET: "/s/pane.sock" }).paneSocket).toBe("/s/pane.sock");
    expect(optsOf(["ask"], { ...inPane, SODA_PANE_SOCKET: "/s/pane.sock", SODA_AGENT_REPORT_SOCKET: "/x/agent-report.sock" }).paneSocket).toBe("/s/pane.sock");
  });

  it("相対パスの SODA_PANE_SOCKET は使わない（どの受け口かが cwd で変わるため。導出にも落ちない）", () => {
    expect(optsOf(["ask"], { ...inPane, SODA_PANE_SOCKET: "st/pane.sock" }).paneSocket).toBeUndefined();
    expect(optsOf(["ask"], { ...inPane, SODA_PANE_SOCKET: "st/pane.sock", SODA_AGENT_REPORT_SOCKET: "/x/agent-report.sock" }).paneSocket).toBeUndefined();
  });

  it("SODA_PANE_SOCKET が無い・空なら、SODA_AGENT_REPORT_SOCKET（/x/agent-report.sock）と同じディレクトリの pane.sock", () => {
    expect(optsOf(["ask"], { ...inPane, SODA_AGENT_REPORT_SOCKET: "/x/agent-report.sock" }).paneSocket).toBe("/x/pane.sock");
    expect(optsOf(["ask"], { ...inPane, SODA_PANE_SOCKET: "", SODA_AGENT_REPORT_SOCKET: "/x/agent-report.sock" }).paneSocket).toBe("/x/pane.sock");
    // 実行中の OS の流儀に依らず、スラッシュ区切り（`path.posix`）で組む。深いディレクトリ・ルート直下でも同じ。
    expect(optsOf(["ask"], { ...inPane, SODA_AGENT_REPORT_SOCKET: "/home/u/.local/state/sodashitsu/agent-report.sock" }).paneSocket).toBe("/home/u/.local/state/sodashitsu/pane.sock");
    expect(optsOf(["ask"], { ...inPane, SODA_AGENT_REPORT_SOCKET: "/agent-report.sock" }).paneSocket).toBe("/pane.sock");
  });

  it.each([
    ["別の名前", { SODA_AGENT_REPORT_SOCKET: "/x/other.sock" }],
    ["名前の一部が同じだけ", { SODA_AGENT_REPORT_SOCKET: "/x/my-agent-report.sock" }],
    ["ディレクトリの名前が同じだけ", { SODA_AGENT_REPORT_SOCKET: "/x/agent-report.sock/y" }],
    ["末尾がスラッシュ", { SODA_AGENT_REPORT_SOCKET: "/x/agent-report.sock/" }],
    ["相対パス（ファイル名だけ）", { SODA_AGENT_REPORT_SOCKET: "agent-report.sock" }],
    ["相対パス（ディレクトリつき）", { SODA_AGENT_REPORT_SOCKET: "x/agent-report.sock" }],
    ["Windows の区切り（win32 以外では 1 つのファイル名）", { SODA_AGENT_REPORT_SOCKET: "C:\\x\\agent-report.sock" }],
    ["空", { SODA_AGENT_REPORT_SOCKET: "" }],
    ["どちらも無い", {}],
  ])("SODA_AGENT_REPORT_SOCKET が %s なら paneSocket は無い（キーも持たない）", (_label, extra) => {
    const opts = optsOf(["ask"], { ...inPane, ...extra } as NodeJS.ProcessEnv);
    expect(opts.paneSocket).toBeUndefined();
    expect("paneSocket" in opts).toBe(false);
  });

  it("Windows では、どちらの変数があっても常に無い（同じ環境が linux・darwin では入る）", () => {
    const env = { ...inPane, SODA_PANE_SOCKET: "/s/pane.sock", SODA_AGENT_REPORT_SOCKET: "/x/agent-report.sock" } as NodeJS.ProcessEnv;
    expect(optsOf(["ask"], env, "win32").paneSocket).toBeUndefined();
    expect(optsOf(["ask"], { ...inPane, SODA_AGENT_REPORT_SOCKET: "\\\\.\\pipe\\soda-agent-report-0123456789abcdef" }, "win32").paneSocket).toBeUndefined();
    expect(optsOf(["ask"], env, "linux").paneSocket).toBe("/s/pane.sock");
    expect(optsOf(["ask"], env, "darwin").paneSocket).toBe("/s/pane.sock");
  });

  it("どのコマンドの opts にも入り、--machine の前置きでも残る（使うかどうかは実行時に決める）。接続先を持たないコマンドは変わらない", () => {
    const env = { ...inPane, SODA_PANE_SOCKET: "/s/pane.sock" } as NodeJS.ProcessEnv;
    expect(optsOf(["snapshot"], env).paneSocket).toBe("/s/pane.sock");
    expect(optsOf(["pane", "current"], env).paneSocket).toBe("/s/pane.sock");
    expect(optsOf(["--machine", "local", "ask"], env)).toMatchObject({ paneSocket: "/s/pane.sock", urlExplicit: false });
    expect(optsOf(["--machine", "box", "snapshot"], env)).toMatchObject({ machine: "box", paneSocket: "/s/pane.sock" });
    expect(parseArgs(["skill"], env, "linux")).toEqual({ kind: "skill" });
    expect(parseArgs(["help"], env, "linux")).toEqual({ kind: "help" });
  });
});

describe("parseArgs — skill", () => {
  it("skill -> { kind: skill }（接続先を持たない）", () => {
    expect(parseArgs(["skill"], noEnv)).toEqual({ kind: "skill" });
  });
  it.each([[["skill", "extra"]], [["skill", "--x"]], [["skill", "--url", "http://h:1"]]])("%j は使い方の誤り（AC6）", (argv) => {
    expect(() => parseArgs(argv, noEnv)).toThrow(CliUsageError);
  });
});

describe("parseArgs — report-metadata（20260927-sidebar-row-tokens の AC8）", () => {
  const url = { url: DEFAULT_URL, token: undefined, urlExplicit: false };

  it("workspace: --token NAME=VALUE と --clear-token を指定の順に並べ、seq・ttl-ms を数にする", () => {
    expect(
      parseArgs(
        ["workspace", "report-metadata", "w1", "--source", "ci", "--token", "build=green", "--clear-token", "old", "--token", "note=a=b", "--seq", "7", "--ttl-ms", "60000"],
        noEnv,
      ),
    ).toEqual({
      kind: "workspace-report-metadata",
      opts: url,
      workspaceId: "w1",
      report: {
        source: "ci",
        tokens: [
          { name: "build", value: "green" },
          { name: "old", value: null },
          { name: "note", value: "a=b" },
        ],
        seq: 7,
        ttlMs: 60000,
      },
    });
  });

  it("pane: seq・ttl-ms を省くとキーごと無い。空の値（NAME=）もそのまま送る（消去はサーバが決める）", () => {
    expect(parseArgs(["pane", "report-metadata", "p1", "--source", "hook", "--token", "summary="], noEnv)).toEqual({
      kind: "pane-report-metadata",
      opts: url,
      paneId: "p1",
      report: { source: "hook", tokens: [{ name: "summary", value: "" }] },
    });
  });

  it("= を含まない --token は接続の token（最後が勝つ）。独自トークンと混ぜられる（decisions D5）", () => {
    const cmd = parseArgs(["workspace", "report-metadata", "w1", "--token", "AUTH1", "--source", "s", "--token", "a=1", "--token", "AUTH2"], noEnv);
    expect(cmd).toMatchObject({ opts: { url: DEFAULT_URL, token: "AUTH2", urlExplicit: false }, report: { tokens: [{ name: "a", value: "1" }] } });
  });

  it("接続の token が無ければ環境変数（SODACTL_TOKEN）を使い、独自トークンを接続の token にしない", () => {
    const env = { SODACTL_TOKEN: "envtoken" } as NodeJS.ProcessEnv;
    expect(parseArgs(["workspace", "report-metadata", "w1", "--source", "s", "--token", "a=1"], env)).toMatchObject({ opts: { token: "envtoken" } });
  });

  it.each([
    [["workspace", "report-metadata", "w1", "--token", "a=1"], "missing required --source"],
    [["workspace", "report-metadata", "w1", "--source", "   ", "--token", "a=1"], "missing required --source"],
    [["workspace", "report-metadata", "w1", "--source", "s"], "missing token to set or clear"],
    [["workspace", "report-metadata", "w1", "--source", "s", "--token", "AUTH"], "missing token to set or clear"],
    [["pane", "report-metadata", "p1", "--source", "s", "--token", "=v"], "token name must not be empty"],
    [["pane", "report-metadata", "p1", "--source", "s", "--token", "a=1", "--seq", "-1"], "invalid value for --seq: -1"],
    [["pane", "report-metadata", "p1", "--source", "s", "--token", "a=1", "--seq", "1.5"], "invalid value for --seq: 1.5"],
    [["pane", "report-metadata", "p1", "--source", "s", "--token", "a=1", "--seq", "9007199254740993"], "invalid value for --seq: 9007199254740993"],
    [["pane", "report-metadata", "p1", "--source", "s", "--token", "a=1", "--ttl-ms", "1e3"], "invalid value for --ttl-ms: 1e3"],
    [["pane", "report-metadata", "--source", "s", "--token", "a=1"], "missing paneId"],
    [["pane", "report-metadata", "p1", "extra", "--source", "s", "--token", "a=1"], "unexpected argument: extra"],
    [["pane", "report-metadata", "p1", "--source", "s", "--token", "a=1", "--title", "x"], "unknown option: --title"],
  ])("%j は使い方の誤り: %s", (argv, message) => {
    expect(() => parseArgs(argv, noEnv)).toThrow(CliUsageError);
    expect(() => parseArgs(argv, noEnv)).toThrow(message);
  });

  it("--seq 0 と --ttl-ms 0 は CLI では通す（範囲の検査はサーバ。herdr の CLI と同じ）", () => {
    expect(parseArgs(["pane", "report-metadata", "p1", "--source", "s", "--token", "a=1", "--seq", "0", "--ttl-ms", "0"], noEnv)).toMatchObject({
      report: { seq: 0, ttlMs: 0 },
    });
  });
});

describe("parseArgs — display（20261007-soda-extensions）", () => {
  const action = (argv: string[], env: NodeJS.ProcessEnv = noEnv): unknown => {
    const cmd = parseArgs(["display", ...argv], env);
    if (cmd.kind !== "display") throw new Error(`unexpected: ${cmd.kind}`);
    return cmd.action;
  };
  const usage = (argv: string[], env: NodeJS.ProcessEnv = noEnv): string => {
    try {
      parseArgs(["display", ...argv], env);
    } catch (e) {
      expect(e).toBeInstanceOf(CliUsageError);
      return (e as Error).message;
    }
    throw new Error("expected a usage error");
  };

  it("set: 名前・--kind・中身の指定。--format を省いた標準入力は text", () => {
    expect(action(["set", "main", "--kind", "panel", "--html-file", "a.html"])).toMatchObject({
      kind: "set",
      name: "main",
      displayKind: "panel",
      source: { kind: "file", format: "html", path: "a.html" },
      wait: false,
    });
    expect(action(["set", "m", "--kind", "band", "--text", "hi"])).toMatchObject({ source: { kind: "text", text: "hi" } });
    expect(action(["set", "m", "--kind", "band", "--markdown-file", "a.md"])).toMatchObject({ source: { kind: "file", format: "markdown", path: "a.md" } });
    expect(action(["set", "m", "--kind", "band"])).toMatchObject({ source: { kind: "stdin", format: "text" } });
    expect(action(["set", "m", "--kind", "band", "--format", "html"])).toMatchObject({ source: { kind: "stdin", format: "html" } });
  });

  it("set: 中身の指定が 2 つ以上は誤り。--format は標準入力のときだけ。知らない形式は誤り", () => {
    expect(usage(["set", "m", "--kind", "panel", "--text", "a", "--html-file", "a.html"])).toMatch(/only one/);
    expect(usage(["set", "m", "--kind", "panel", "--markdown-file", "a", "--html-file", "a.html"])).toMatch(/only one/);
    expect(usage(["set", "m", "--kind", "panel", "--text", "a", "--format", "html"])).toMatch(/--format can only/);
    expect(usage(["set", "m", "--kind", "panel", "--format", "pdf"])).toMatch(/--format/);
    expect(usage(["set", "m", "--kind", "panel", "--text", "a", "--script-html-file", "a.html"])).toMatch(/only one/);
    expect(usage(["set", "m", "--kind", "panel", "--script-html-file", "a.html", "--format", "html"])).toMatch(/--format can only/);
  });

  it("set: --script-html-file と --format script-html（標準入力）", () => {
    expect(action(["set", "g", "--kind", "panel", "--script-html-file", "g.html"])).toMatchObject({ source: { kind: "file", format: "script-html", path: "g.html" } });
    expect(action(["set", "g", "--kind", "panel", "--format", "script-html"])).toMatchObject({ source: { kind: "stdin", format: "script-html" } });
  });

  it("send: 名前と --json か標準入力。JSON として読めない --json は誤り。名前・余分な引数の誤り", () => {
    expect(action(["send", "g", "--json", '{"a":1}'])).toEqual({ kind: "send", name: "g", json: '{"a":1}', pane: undefined });
    expect(action(["send", "g"])).toEqual({ kind: "send", name: "g", json: undefined, pane: undefined });
    expect(action(["send", "g", "--json", "[1]", "--pane", "abcd"])).toMatchObject({ json: "[1]", pane: "abcd" });
  });
  it("send: 誤り", () => {
    expect(usage(["send", "g", "--json", "{oops"])).toMatch(/not valid JSON/);
    expect(usage(["send", "--json", "1"])).toMatch(/missing name/);
    expect(usage(["send", "a b", "--json", "1"])).toMatch(/invalid display name/);
    expect(usage(["send", "g", "h", "--json", "1"])).toMatch(/unexpected argument/);
  });

  it("set: 名前・--kind の誤り", () => {
    expect(usage(["set", "--kind", "panel", "--text", "a"])).toMatch(/missing name/);
    expect(usage(["set", "a b", "--kind", "panel", "--text", "a"])).toMatch(/invalid display name/);
    expect(usage(["set", "m", "--text", "a"])).toMatch(/missing --kind/);
    expect(usage(["set", "m", "--kind", "side", "--text", "a"])).toMatch(/--kind/);
    expect(usage(["set", "m", "n", "--kind", "panel", "--text", "a"])).toMatch(/unexpected argument/);
  });

  it("set: --size は種類ごとの範囲、--ttl-ms は 1,000〜86,400,000", () => {
    expect(action(["set", "m", "--kind", "panel", "--text", "a", "--size", "160"])).toMatchObject({ size: 160 });
    expect(action(["set", "m", "--kind", "panel", "--text", "a", "--size", "800"])).toMatchObject({ size: 800 });
    expect(usage(["set", "m", "--kind", "panel", "--text", "a", "--size", "159"])).toMatch(/--size/);
    expect(usage(["set", "m", "--kind", "panel", "--text", "a", "--size", "801"])).toMatch(/--size/);
    expect(action(["set", "m", "--kind", "band", "--text", "a", "--size", "96"])).toMatchObject({ size: 96 });
    expect(usage(["set", "m", "--kind", "band", "--text", "a", "--size", "97"])).toMatch(/--size/);
    expect(usage(["set", "m", "--kind", "band", "--text", "a", "--size", "x"])).toMatch(/--size/);
    expect(usage(["set", "m", "--kind", "band", "--text", "a", "--size", "32.5"])).toMatch(/--size/);
    expect(action(["set", "m", "--kind", "band", "--text", "a", "--ttl-ms", "1000"])).toMatchObject({ ttlMs: 1000 });
    expect(usage(["set", "m", "--kind", "band", "--text", "a", "--ttl-ms", "999"])).toMatch(/--ttl-ms/);
  });

  it("set: --timeout は --wait と一緒のときだけ。--title / --text は = の形なら -- で始まる値も渡せる", () => {
    expect(action(["set", "m", "--kind", "band", "--text", "a", "--wait", "--timeout", "5000"])).toMatchObject({ wait: true, timeoutMs: 5000 });
    expect(usage(["set", "m", "--kind", "band", "--text", "a", "--timeout", "5000"])).toMatch(/--timeout can only/);
    expect(action(["set", "m", "--kind", "band", "--text=--x", "--title=--y"])).toMatchObject({ source: { kind: "text", text: "--x" }, title: "--y" });
  });

  it("close: 名前か --all のどちらか 1 つ", () => {
    expect(action(["close", "a"])).toMatchObject({ kind: "close", name: "a", all: false });
    expect(action(["close", "--all"])).toMatchObject({ kind: "close", name: undefined, all: true });
    expect(usage(["close"])).toMatch(/missing name/);
    expect(usage(["close", "a", "--all"])).toMatch(/--all/);
    expect(usage(["close", "a", "b"])).toMatch(/unexpected/);
  });

  it("list・wait・events", () => {
    expect(action(["list"])).toEqual({ kind: "list", pane: undefined });
    expect(action(["wait"])).toMatchObject({ kind: "wait", name: undefined, since: undefined });
    expect(action(["wait", "a", "--timeout", "2000"])).toMatchObject({ name: "a", timeoutMs: 2000 });
    expect(action(["events", "a", "b"])).toMatchObject({ kind: "events", names: ["a", "b"] });
    expect(action(["events"])).toMatchObject({ names: [] });
    expect(usage(["wait", "a", "b"])).toMatch(/unexpected/);
    expect(usage(["events", ...Array.from({ length: 9 }, (_, i) => `n${i}`)])).toMatch(/too many/);
  });

  it("--since と --epoch は組", () => {
    expect(action(["wait", "--since", "3", "--epoch", "e"])).toMatchObject({ since: 3, epoch: "e" });
    expect(action(["events", "--since", "0", "--epoch", "e"])).toMatchObject({ since: 0, epoch: "e" });
    expect(usage(["wait", "--since", "3"])).toMatch(/together/);
    expect(usage(["events", "--epoch", "e"])).toMatch(/together/);
    expect(usage(["wait", "--since", "-1", "--epoch", "e"])).toMatch(/--since/);
  });

  it("--features、知らない下位コマンド、--pane", () => {
    expect(action(["--features"])).toEqual({ kind: "features" });
    expect(usage(["--features", "x"])).toMatch(/unexpected/);
    expect(usage(["bogus"])).toMatch(/unknown subcommand/);
    expect(usage([])).toMatch(/unknown subcommand/);
    expect(action(["list", "--pane", "abcd"])).toEqual({ kind: "list", pane: "abcd" });
  });

  it("--machine には --pane が要る（--features と local は除く）", () => {
    const m = (argv: string[]): string => {
      try {
        parseArgs(["--machine", ...argv], noEnv);
      } catch (e) {
        return (e as Error).message;
      }
      return "ok";
    };
    expect(m(["Remote", "display", "list"])).toMatch(/needs --pane/);
    expect(m(["Remote", "display", "events"])).toMatch(/needs --pane/);
    expect(m(["Remote", "display", "list", "--pane", "abcd"])).toBe("ok");
    expect(m(["Remote", "display", "--features"])).toBe("ok");
    expect(m(["local", "display", "list"])).toBe("ok");
  });

  it("受け口のパスが pane の環境から入る", () => {
    const env = { SODA_PANE_ID: "p1", SODA_SERVER_URL: "http://127.0.0.1:1", SODA_PANE_SOCKET: "/s/pane.sock" } as NodeJS.ProcessEnv;
    const cmd = parseArgs(["display", "list"], env, "linux");
    expect(cmd.kind === "display" && cmd.opts.paneSocket).toBe("/s/pane.sock");
  });
});

describe("parseArgs — agent fork（20261009-agent-fork）", () => {
  const env = {} as NodeJS.ProcessEnv;
  it("対象だけ: 同じフォルダ・最初の知らせはある・最後まで待つ", () => {
    expect(parseArgs(["agent", "fork", "p1"], env)).toMatchObject({ kind: "agent-fork", paneId: "p1", worktree: undefined, note: true, wait: true, json: false });
  });
  it("--worktree・--no-note・--no-wait・--timeout・--json", () => {
    expect(parseArgs(["agent", "fork", "p1", "--worktree", "fork/x", "--no-note", "--no-wait", "--timeout", "5000", "--json"], env)).toMatchObject({
      worktree: "fork/x",
      note: false,
      wait: false,
      timeoutMs: 5000,
      json: true,
    });
  });
  it("使い方の誤り: 対象なし・--no-note だけ・余計な位置引数・会話の id やコマンドの引数は受けない", () => {
    expect(() => parseArgs(["agent", "fork"], env)).toThrow(CliUsageError);
    expect(() => parseArgs(["agent", "fork", "p1", "--no-note"], env)).toThrow(CliUsageError);
    expect(() => parseArgs(["agent", "fork", "p1", "p2"], env)).toThrow(CliUsageError);
    expect(() => parseArgs(["agent", "fork", "p1", "--session-id", "x"], env)).toThrow(CliUsageError);
    expect(() => parseArgs(["agent", "fork", "p1", "--timeout", "abc"], env)).toThrow(CliUsageError);
    expect(() => parseArgs(["agent", "fork", "p1", "--worktree", ""], env)).toThrow(CliUsageError);
  });
});

describe("parseArgs — agent usage（20261010-agent-usage）", () => {
  const env = {} as NodeJS.ProcessEnv;
  it("target は省ける（全部）。--json で JSON", () => {
    expect(parseArgs(["agent", "usage"], env)).toMatchObject({ kind: "agent-usage", paneId: undefined, json: false });
    expect(parseArgs(["agent", "usage", "p1", "--json"], env)).toMatchObject({ kind: "agent-usage", paneId: "p1", json: true });
  });
  it("target を 2 つ・知らない旗は使用誤り", () => {
    expect(() => parseArgs(["agent", "usage", "a", "b"], env)).toThrow();
    expect(() => parseArgs(["agent", "usage", "--path", "/x"], env)).toThrow();
  });
});
