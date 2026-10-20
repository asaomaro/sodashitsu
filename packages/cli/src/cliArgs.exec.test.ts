import { expect, it } from "vitest";
import { parseArgs } from "./cliArgs.js";
it("routes an exec command and cwd without interpreting shell metacharacters locally", () => {
  expect(parseArgs(["--machine", "remote", "exec", "--cwd", "C:\\git\\project", "--timeout", "45000", "--", 'echo "$x" & echo 日本語'])).toMatchObject({
    kind: "exec", opts: { machine: "remote" }, cwd: "C:\\git\\project", timeoutMs: 45000, command: 'echo "$x" & echo 日本語',
  });
});
it.each([
  [], ["--cwd", "/tmp"], ["--", "echo test"], ["--cwd", "/tmp", "--timeout", "0", "--", "true"],
  ["--cwd", "/tmp", "--timeout", "300001", "--", "true"], ["--cwd", "/tmp", "--", "one", "two"],
].map(args => ({args})))("rejects missing/ambiguous parameters $args", ({args}) => {
  expect(() => parseArgs(["exec", ...args])).toThrow();
});
