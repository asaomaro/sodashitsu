import { describe, expect, it } from "vitest";
import { CliUsageError, MACHINE_USAGE_LINE, parseArgs } from "./cliArgs.js";

/** `wtmctl --machine <名前|id> <コマンド>`（20260927-multi-host-machines の T10）。 */
const ENV_IN_PANE = { WTM_PANE_ID: "p3", WTM_SERVER_URL: "http://127.0.0.1:7780" };

describe("wtmctl --machine（T10）", () => {
  it("前置きの値を opts.machine に入れ、pane の中でも自分の pane の歯止め（caller）を外す", () => {
    const cmd = parseArgs(["--machine", "Build box", "agent", "list"], ENV_IN_PANE);
    expect(cmd).toMatchObject({
      kind: "agent-list",
      opts: { machine: "Build box", url: "http://127.0.0.1:7780" },
    });
    expect("opts" in cmd && cmd.opts.caller).toBeUndefined();
    expect(
      parseArgs(["--machine", "a".repeat(32), "pane", "close", "p3"], ENV_IN_PANE),
    ).toMatchObject({ kind: "pane-close", paneId: "p3", opts: { machine: "a".repeat(32) } });
  });

  it("--machine local は手元そのものなので歯止めを外さない（machine も付けない）", () => {
    const cmd = parseArgs(["--machine", "local", "pane", "close", "p3"], ENV_IN_PANE);
    expect("opts" in cmd && cmd.opts.caller).toEqual({
      paneId: "p3",
      serverUrl: "http://127.0.0.1:7780",
    });
    expect("opts" in cmd && cmd.opts.machine).toBeUndefined();
  });

  it("--machine が無ければ今までどおり（machine なし・pane の中なら caller あり）", () => {
    const cmd = parseArgs(["agent", "list"], ENV_IN_PANE);
    expect("opts" in cmd && cmd.opts.machine).toBeUndefined();
    expect("opts" in cmd && cmd.opts.caller).toEqual({
      paneId: "p3",
      serverUrl: "http://127.0.0.1:7780",
    });
  });

  it("pane の対象: --current は使い方の誤り、省略はそのマシンのフォーカスの pane（20260927-caller-pane-default の AC10）", () => {
    expect(() =>
      parseArgs(
        ["--machine", "m", "pane", "split", "--current", "--direction", "right"],
        ENV_IN_PANE,
      ),
    ).toThrow(/--current cannot be used with --machine/);
    expect(() =>
      parseArgs(["--machine", "m", "pane", "current", "--current"], ENV_IN_PANE),
    ).toThrow(CliUsageError);
    // pane の外でも理由は --machine（「pane の中で打て」と誤誘導しない。taskcheck T1 の指摘）。
    expect(() => parseArgs(["--machine", "m", "pane", "current", "--current"], {})).toThrow(
      /--current cannot be used with --machine/,
    );
    expect(
      parseArgs(["--machine", "m", "pane", "split", "--direction", "right"], ENV_IN_PANE),
    ).toMatchObject({
      kind: "pane-split",
      target: { kind: "focused" },
      opts: { machine: "m" },
    });
    expect(parseArgs(["--machine", "m", "pane", "current"], ENV_IN_PANE)).toMatchObject({
      target: { kind: "focused" },
      opts: { machine: "m" },
    });
    // 明示の ID はそのまま（そのマシンの ID として送る）。
    expect(
      parseArgs(["--machine", "m", "pane", "current", "--pane", "p3"], ENV_IN_PANE),
    ).toMatchObject({ target: { kind: "id", paneId: "p3" } });
  });

  it("--machine local は pane の中と同じく呼び出し元の pane を使う（AC11）", () => {
    expect(
      parseArgs(["--machine", "local", "pane", "split", "--direction", "right"], ENV_IN_PANE),
    ).toMatchObject({
      target: { kind: "caller", paneId: "p3", explicit: false },
      opts: { caller: { paneId: "p3" } },
    });
    expect(
      parseArgs(["--machine", "local", "pane", "current", "--current"], ENV_IN_PANE),
    ).toMatchObject({ target: { kind: "caller", explicit: true } });
  });

  it("値が無い・長すぎる・コマンドが無い・help/skill/login/--machine の重ねは使い方の誤り", () => {
    for (const argv of [
      ["--machine"],
      ["--machine", "--url"],
      ["--machine", "x".repeat(257)],
      ["--machine", "m"],
      ["--machine", "m", "help"],
      ["--machine", "m", "skill"],
      ["--machine", "m", "login", "--token", "t"],
      ["--machine", "m", "--machine", "n", "snapshot"],
    ])
      expect(() => parseArgs(argv, {}), argv.join(" ")).toThrow(CliUsageError);
    expect(parseArgs(["--machine", "x".repeat(256), "snapshot"], {})).toMatchObject({
      opts: { machine: "x".repeat(256) },
    });
    expect(MACHINE_USAGE_LINE).toMatch(/--machine/);
  });
});
