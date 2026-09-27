import { describe, expect, it } from "vitest";
import { applySessionEnv, parseArgs } from "./cliArgs.js";
import { ConfigError } from "./config.js";

/** 投げた ConfigError の message（投げなければ失敗）。 */
function configErrorOf(argv: string[]): ConfigError {
  try {
    parseArgs(argv);
  } catch (err) {
    if (err instanceof ConfigError) return err;
    throw err;
  }
  throw new Error(`no ConfigError for ${argv.join(" ")}`);
}

describe("parseArgs（CLI の引数）", () => {
  it("serve のオプションを読む（--origin は複数）", () => {
    const parsed = parseArgs(["serve", "--host", "0.0.0.0", "--port", "8443", "--origin", "https://a", "--origin", "https://b", "--state-dir", "/s"]);
    expect(parsed.command).toBe("serve");
    expect(parsed.serve).toMatchObject({ host: "0.0.0.0", port: "8443", origin: ["https://a", "https://b"], stateDir: "/s" });
  });

  it("--worktree-dir を読む（20260924-worktree-dir-config）", () => {
    expect(parseArgs(["serve", "--worktree-dir", "/custom/worktrees"])).toMatchObject({
      command: "serve",
      serve: { worktreeDir: "/custom/worktrees" },
    });
  });

  it("--pane-history は値を取らずに有効にする。無ければ指定なし（20260926-screen-history-replay の AC11）", () => {
    expect(parseArgs(["serve", "--pane-history", "--port", "7781"])).toMatchObject({ command: "serve", serve: { paneHistory: true, port: "7781" } });
    expect(parseArgs(["serve"]).serve.paneHistory).toBeUndefined();
  });

  it("--pane-history は wtm serve だけのオプション（wtm token reset では ConfigError）", () => {
    expect(configErrorOf(["token", "reset", "--pane-history"]).message).toBe("--pane-history is not an option of wtm token reset");
    expect(configErrorOf(["session", "list", "--pane-history"]).message).toBe("--pane-history is not an option of wtm session");
  });

  it("使い方の表示に --pane-history がある（AC11）", () => {
    expect(configErrorOf(["serve", "--no-such-option"]).hint).toContain("[--pane-history]");
  });

  it("--worktree-dir に値が続かなければ ConfigError（20260924-worktree-dir-config）", () => {
    // message で next() の「missing value」経路を通ったことを確かめる（switch 分岐が無いだけでも
    // ConfigError にはなる「unknown option」と区別するため。taskcheck T2 round1 指摘）。
    expect(configErrorOf(["serve", "--worktree-dir"]).message).toBe("missing value for --worktree-dir");
  });

  it("token reset はサブコマンドの語を読み飛ばしてから --state-dir を読む（以前は unknown option: reset で一度も動かなかった。D103）", () => {
    expect(parseArgs(["token", "reset"])).toMatchObject({ command: "token-reset", stateDir: undefined });
    expect(parseArgs(["token", "reset", "--state-dir", "/s"])).toMatchObject({ command: "token-reset", stateDir: "/s" });
  });

  it("オプションとサブコマンドの語の順は問わない（wtm token --state-dir D reset。独立点検 #6）", () => {
    expect(parseArgs(["token", "--state-dir", "/s", "reset"])).toMatchObject({ command: "token-reset", stateDir: "/s" });
  });

  it("未知のコマンド・サブコマンドは help ではなく ConfigError（終了コード 2・使い方つき。独立点検 #6）", () => {
    for (const argv of [["token", "rest"], ["token", "reset", "now"], ["token"], ["tokne", "reset"], ["serve", "extra"]]) {
      const err = configErrorOf(argv);
      expect(err.hint, argv.join(" ")).toContain("使い方");
    }
    expect(configErrorOf(["token", "rest"]).message).toContain("unknown subcommand: wtm token rest");
    expect(configErrorOf(["tokne", "reset"]).message).toContain("unknown command: tokne");
  });

  it("token reset に wtm serve のオプションを渡すと ConfigError（使えるのは --state-dir だけ。独立点検 #6）", () => {
    const err = configErrorOf(["token", "reset", "--host", "0.0.0.0"]);
    expect(err.message).toContain("--host is not an option of wtm token reset");
    expect(err.hint).toContain("--state-dir だけ");
    expect(configErrorOf(["token", "--port", "1", "reset", "--state-dir", "/s"]).message).toContain("--port");
  });

  it("--session を serve と token reset で読む（20260926-named-session）", () => {
    expect(parseArgs(["serve", "--session", "work", "--port", "7781"])).toMatchObject({
      command: "serve",
      session: "work",
      serve: { session: "work", port: "7781" },
    });
    expect(parseArgs(["token", "reset", "--session", "work", "--state-dir", "/s"])).toMatchObject({
      command: "token-reset",
      session: "work",
      stateDir: "/s",
    });
    expect(parseArgs(["serve"]).session).toBeUndefined();
    expect(configErrorOf(["serve", "--session"]).message).toBe("missing value for --session");
  });

  it("wtm session list / delete <name> を読む。--state-dir と --json だけ使える（20260926-named-session）", () => {
    expect(parseArgs(["session", "list"])).toMatchObject({ command: "session-list", stateDir: undefined, json: false });
    expect(parseArgs(["session", "list", "--json", "--state-dir", "/s"])).toMatchObject({ command: "session-list", stateDir: "/s", json: true });
    expect(parseArgs(["session", "delete", "work"])).toMatchObject({ command: "session-delete", sessionTarget: "work", json: false });
    expect(parseArgs(["session", "--json", "delete", "work"])).toMatchObject({ command: "session-delete", sessionTarget: "work", json: true });
    expect(configErrorOf(["session"]).message).toContain("missing subcommand: wtm session");
    expect(configErrorOf(["session", "delete"]).message).toContain("missing session name: wtm session delete <name>");
    expect(configErrorOf(["session", "delete", "a", "b"]).message).toContain("unknown subcommand");
    expect(configErrorOf(["session", "list", "x"]).message).toContain("unknown subcommand");
    expect(configErrorOf(["session", "attach", "work"]).message).toContain("unknown subcommand: wtm session attach work");
    expect(configErrorOf(["session", "list", "--port", "1"]).message).toContain("--port is not an option of wtm session");
    expect(configErrorOf(["session", "delete", "work", "--session", "x"]).message).toContain("--session is not an option of wtm session");
  });

  it("wtm session stop <name> を読む。名前は必須で WTM_SESSION は見ない（20260927-session-stop）", () => {
    expect(parseArgs(["session", "stop", "work"])).toMatchObject({ command: "session-stop", sessionTarget: "work", json: false });
    expect(parseArgs(["session", "stop", "default", "--json", "--state-dir", "/s"])).toMatchObject({
      command: "session-stop",
      sessionTarget: "default",
      stateDir: "/s",
      json: true,
    });
    const missing = configErrorOf(["session", "stop"]);
    expect(missing.message).toContain("missing session name: wtm session stop <name>");
    expect(missing.hint).toContain("default");
    expect(configErrorOf(["session", "stop", "a", "b"]).message).toContain("unknown subcommand");
    expect(configErrorOf(["session", "stop", "work", "--session", "x"]).message).toContain("--session is not an option of wtm session");
    expect(configErrorOf(["session", "stop", "work", "--port", "1"]).message).toContain("--port is not an option of wtm session");
    const parsed = parseArgs(["session", "stop", "work"]);
    expect(applySessionEnv(parsed, { WTM_SESSION: "other" })).toEqual(parsed);
    expect(configErrorOf(["session"]).message).toContain("<list|delete|stop>");
  });

  it("--json は session 以外では ConfigError（20260926-named-session）", () => {
    expect(configErrorOf(["serve", "--json"]).message).toContain("--json is not an option of wtm serve");
    expect(configErrorOf(["token", "reset", "--json"]).message).toContain("--json is not an option of wtm token reset");
  });

  it("未知のオプション・値の無いオプションは ConfigError。コマンドが無い・help・--help・-h だけが help", () => {
    expect(() => parseArgs(["serve", "--nope"])).toThrow(ConfigError);
    expect(() => parseArgs(["token", "reset", "--state-dir"])).toThrow(ConfigError);
    for (const argv of [[], ["help"], ["--help"], ["-h"]]) expect(parseArgs(argv).command).toBe("help");
  });
});

/** 20260926-named-session-ui（AC13・AC14）。 */
describe("applySessionEnv（WTM_SESSION）", () => {
  const env = (v: string | undefined): NodeJS.ProcessEnv => (v === undefined ? {} : { WTM_SESSION: v });

  it("wtm serve に --session が無ければ WTM_SESSION を session にし、出所を env にする", () => {
    const parsed = applySessionEnv(parseArgs(["serve", "--port", "9000"]), env("work"));
    expect(parsed).toMatchObject({ command: "serve", session: "work", sessionSource: "env", serve: { session: "work", sessionSource: "env", port: "9000" } });
  });

  it("wtm token reset も同じ", () => {
    expect(applySessionEnv(parseArgs(["token", "reset"]), env("work"))).toMatchObject({ command: "token-reset", session: "work", sessionSource: "env" });
  });

  it("--session は WTM_SESSION より優先する（出所は flag）", () => {
    const parsed = applySessionEnv(parseArgs(["serve", "--session", "other"]), env("work"));
    expect(parsed).toMatchObject({ session: "other", sessionSource: "flag", serve: { session: "other", sessionSource: "flag" } });
    // 規則外の WTM_SESSION も --session があれば見ない
    expect(applySessionEnv(parseArgs(["token", "reset", "--session", "other"]), env("a/b")).session).toBe("other");
  });

  it("無い・空なら何もしない（既定の session）", () => {
    for (const v of [undefined, ""]) {
      const parsed = applySessionEnv(parseArgs(["serve"]), env(v));
      expect(parsed.session).toBeUndefined();
      expect(parsed.sessionSource).toBeUndefined();
      expect(parsed.serve.session).toBeUndefined();
    }
  });

  it("default は既定の session（名前として渡し、状態ディレクトリの解決が既定にする）", () => {
    expect(applySessionEnv(parseArgs(["serve"]), env("default"))).toMatchObject({ session: "default", serve: { session: "default" } });
  });

  it.each(["a/b", "..", ".", "-x", "x.", "con", "x".repeat(65), "日本語"])("規則外の値 %j は ConfigError で、案内に WTM_SESSION が出る", (v) => {
    let err: unknown;
    try {
      applySessionEnv(parseArgs(["serve"]), env(v));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).message).toContain("WTM_SESSION");
    expect((err as ConfigError).hint).toContain("WTM_SESSION");
    expect(() => applySessionEnv(parseArgs(["token", "reset"]), env(v))).toThrow(ConfigError);
  });

  it("wtm session list・delete・help は WTM_SESSION を見ない（規則外でも投げない）", () => {
    for (const argv of [["session", "list"], ["session", "delete", "work"], ["help"]]) {
      const parsed = parseArgs(argv);
      expect(applySessionEnv(parsed, env("a/b"))).toBe(parsed);
      expect(applySessionEnv(parsed, env("work"))).toBe(parsed);
    }
  });

  it("parseArgs の --session は出所を flag にする", () => {
    expect(parseArgs(["serve", "--session", "w"])).toMatchObject({ sessionSource: "flag", serve: { sessionSource: "flag" } });
    expect(parseArgs(["token", "reset", "--session", "w"]).sessionSource).toBe("flag");
    expect(parseArgs(["serve"]).sessionSource).toBeUndefined();
  });
});
