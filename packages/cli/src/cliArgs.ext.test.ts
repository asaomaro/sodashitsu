import { describe, expect, it } from "vitest";
import { CliUsageError, EXT_USAGE, USAGE_LINES, parseArgs } from "./cliArgs.js";

/** `sodactl ext`（20261007-ext-host の T12）。 */
const ENV = { SODA_SERVER_URL: "http://127.0.0.1:7780" } as NodeJS.ProcessEnv;

describe("sodactl ext の引数", () => {
  it("list・reload・log <ref>・restart <ref>", () => {
    expect(parseArgs(["ext", "list"], ENV)).toMatchObject({ kind: "ext", action: { kind: "list" } });
    expect(parseArgs(["ext", "reload"], ENV)).toMatchObject({ kind: "ext", action: { kind: "reload" } });
    expect(parseArgs(["ext", "log", "user:hello"], ENV)).toMatchObject({ kind: "ext", action: { kind: "log", ref: "user:hello" } });
    expect(parseArgs(["ext", "restart", "hello", "--url", "http://x:1", "--token", "t"], ENV)).toMatchObject({
      kind: "ext",
      action: { kind: "restart", ref: "hello" },
      opts: { url: "http://x:1" },
    });
  });
  it("--machine と組み合わせられる", () => {
    expect(parseArgs(["--machine", "box", "ext", "list"], ENV)).toMatchObject({ kind: "ext", opts: { machine: "box" } });
  });
  it("使い方の誤り: サブコマンドが無い・知らない・id が無い・余計な引数", () => {
    for (const argv of [["ext"], ["ext", "approve", "x"], ["ext", "log"], ["ext", "restart"], ["ext", "list", "extra"], ["ext", "log", "a", "b"]]) {
      expect(() => parseArgs(argv, ENV), argv.join(" ")).toThrow(CliUsageError);
    }
  });
  it("USAGE_LINES に approve・deny・revoke・enable・disable が無い（承認は画面でする）", () => {
    const ext = USAGE_LINES.filter((l) => l.startsWith("sodactl ext"));
    expect(ext).toHaveLength(4);
    for (const w of ["approve", "deny", "revoke", "enable", "disable"]) {
      expect(ext.join("\n")).not.toContain(w);
      expect(() => parseArgs(["ext", w], ENV)).toThrow(CliUsageError);
    }
    expect(EXT_USAGE).toBe(ext.join("\n"));
  });
});
