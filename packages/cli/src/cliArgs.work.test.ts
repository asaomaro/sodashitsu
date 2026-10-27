import { expect, it } from "vitest";
import { parseArgs } from "./cliArgs.js";
it("parses a bound remote workflow without interpreting the target command", () => {
  expect(parseArgs(["work", "bind", "remote", "12345678", "--kind", "codex"])).toMatchObject({ kind: "work", action: "bind", args: ["remote", "12345678"] });
  expect(parseArgs(["work", "exec", "--timeout", "5000", "--", 'echo "$x" & echo 日本語'])).toMatchObject({ kind: "work", action: "exec", args: ['echo "$x" & echo 日本語'], values: { "--timeout": "5000" } });
  expect(parseArgs(["work", "memory", "write", "MEMORY.md", "--version", "a".repeat(64)])).toMatchObject({ kind: "work", action: "memory", args: ["write", "MEMORY.md"] });
});
it.each([
  ["bind", "remote"], ["bind", "r", "w", "--kind", "unknown"], ["exec", "--", "x", "y"], ["exec", "echo"],
  ["exec", "--timeout", "0", "--", "true"], ["file", "delete"], ["memory", "delete"], ["skills", "extra"], ["skill"], ["handoff", "--", "unexpected"],
])("rejects malformed work arguments %j", (...args) => { expect(() => parseArgs(["work", ...args])).toThrow(); });
it("keeps terminal placement outside the native agent argument list",()=>{
 expect(parseArgs(["work","agent","--terminal-here","claude","--resume"])).toMatchObject({kind:"work-agent",terminalHere:true,args:["--resume"]});
 expect(parseArgs(["work","agent","codex"])).not.toHaveProperty("terminalHere");
 expect(()=>parseArgs(["work","agent","--terminal-here","--terminal-here","claude"])).toThrow();
});
