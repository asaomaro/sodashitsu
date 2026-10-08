import type { ExtensionInfo, ExtensionListResult } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { CliUsageError } from "../cliArgs.js";
import { RpcFailure } from "../wsClient.js";
import { resolveExtRef } from "./ext.js";

const info = (key: string, id: string): ExtensionInfo => ({
  key,
  id,
  scope: key.startsWith("user:") ? "user" : "project",
  configPath: "/c",
  allow: [],
  onUnresponsive: "pass",
  state: "running",
  enabledInConfig: true,
  disabledByUser: false,
  failures: 0,
  displays: 0,
});
const list = (...e: ExtensionInfo[]): ExtensionListResult => ({ extensions: e, problems: [], userConfigPath: "/c" });

describe("resolveExtRef", () => {
  it("key の完全一致が先。id が 1 つに決まればそれ", () => {
    const l = list(info("user:a", "a"), info("project:x:b", "b"));
    expect(resolveExtRef(l, "user:a")).toBe("user:a");
    expect(resolveExtRef(l, "a")).toBe("user:a");
    expect(resolveExtRef(l, "b")).toBe("project:x:b");
  });
  it("同じ id が 2 つのとき、id は使い方の誤り（候補の key を並べる）で、key は通る", () => {
    const l = list(info("user:a", "a"), info("project:h:a", "a"));
    expect(() => resolveExtRef(l, "a")).toThrow(CliUsageError);
    try {
      resolveExtRef(l, "a");
    } catch (e) {
      expect(String((e as CliUsageError).message + ((e as CliUsageError).hint))).toContain("project:h:a");
    }
    expect(resolveExtRef(l, "project:h:a")).toBe("project:h:a");
  });
  it("無ければ not_found", () => {
    expect(() => resolveExtRef(list(), "zzz")).toThrow(RpcFailure);
    try {
      resolveExtRef(list(), "zzz");
    } catch (e) {
      expect((e as RpcFailure).code).toBe("not_found");
    }
  });
});
