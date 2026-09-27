import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CliUsageError } from "./cliArgs.js";
import { printJson, printLine, reportAndExit } from "./output.js";
import { UnauthenticatedError } from "./withSession.js";
import { AuthError, RpcFailure } from "./wsClient.js";

describe("printJson / printLine", () => {
  it("printJson は改行付きの JSON を1行 stdout へ書く", () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    printJson({ a: 1 });
    expect(spy).toHaveBeenCalledWith('{"a":1}\n');
    spy.mockRestore();
  });

  it("printLine は改行を重複させない", () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    printLine("hello");
    printLine("world\n");
    expect(spy).toHaveBeenNthCalledWith(1, "hello\n");
    expect(spy).toHaveBeenNthCalledWith(2, "world\n");
    spy.mockRestore();
  });
});

describe("reportAndExit — 終了コードとエラーの分類（design「終了コードと出力」「エラー処理/異常系」）", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("CliUsageError は exit 2・message と hint を stderr へ（JSON エラーは書かない）", () => {
    const writeSpy = vi.mocked(process.stderr.write);
    reportAndExit(new CliUsageError("bad arg", "usage: ..."));
    expect(errSpy).toHaveBeenNthCalledWith(1, "sodactl: bad arg");
    expect(errSpy).toHaveBeenNthCalledWith(2, "usage: ...");
    expect(exitSpy).toHaveBeenCalledWith(2);
    // `process.exit` はテストでは実プロセスを終えない（実運用では `process.exit` の型が `never` で、
    // 呼び出し後は実際に戻らない。`packages/server/src/main.ts` の `ConfigError` 分岐と同じ流儀）ため、
    // この分岐の後に JSON エラーの書き込みへ「落ちて」いないことを明示的に確認する。
    expect(writeSpy).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledTimes(1);
  });

  it("UnauthenticatedError は exit 1・code=unauthenticated", () => {
    const writeSpy = vi.mocked(process.stderr.write);
    reportAndExit(new UnauthenticatedError("no token"));
    expect(writeSpy).toHaveBeenCalledWith(JSON.stringify({ error: { code: "unauthenticated", message: "no token" } }) + "\n");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("AuthError は exit 1・code=invalid_token", () => {
    const writeSpy = vi.mocked(process.stderr.write);
    reportAndExit(new AuthError("bad token"));
    expect(writeSpy).toHaveBeenCalledWith(JSON.stringify({ error: { code: "invalid_token", message: "bad token" } }) + "\n");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("RpcFailure は exit 1・code はそのまま引き継ぐ（not_found 等）", () => {
    const writeSpy = vi.mocked(process.stderr.write);
    reportAndExit(new RpcFailure("not_found", "pane not found: p1"));
    expect(writeSpy).toHaveBeenCalledWith(JSON.stringify({ error: { code: "not_found", message: "pane not found: p1" } }) + "\n");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("statusCode=403 を持つ Error は code=forbidden（AC9 の直接の証跡）", () => {
    const writeSpy = vi.mocked(process.stderr.write);
    const err = Object.assign(new Error("unexpected response from server: HTTP 403"), { statusCode: 403 });
    reportAndExit(err);
    expect(writeSpy).toHaveBeenCalledWith(JSON.stringify({ error: { code: "forbidden", message: err.message } }) + "\n");
  });

  it("その他の Error は code=internal", () => {
    const writeSpy = vi.mocked(process.stderr.write);
    reportAndExit(new Error("ECONNREFUSED"));
    expect(writeSpy).toHaveBeenCalledWith(JSON.stringify({ error: { code: "internal", message: "ECONNREFUSED" } }) + "\n");
  });

  it("Error インスタンスでない値も internal として扱う（落ちない）", () => {
    const writeSpy = vi.mocked(process.stderr.write);
    reportAndExit("just a string");
    expect(writeSpy).toHaveBeenCalledWith(JSON.stringify({ error: { code: "internal", message: "just a string" } }) + "\n");
  });
});
