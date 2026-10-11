import { spawn } from "node:child_process";
import { readFile, access } from "node:fs/promises";
import { dirname, join, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_START_EXECUTABLES } from "@sodashitsu/protocol";

/** cmdを経由せず、npmの標準shimは参照しているNodeエントリへ直接渡す。 */
export async function windowsAgentExecutable(
  executable: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ file: string; prefix: string[] }> {
  if (!Object.values(AGENT_START_EXECUTABLES).includes(executable))
    throw new Error("unsupported agent executable");
  const pathValue = Object.entries(env).find(([k]) => k.toUpperCase() === "PATH")?.[1] ?? "";
  for (const dir of pathValue.split(";").filter((d) => isAbsolute(d))) {
    for (const ext of [".exe", ".cmd", ".bat"]) {
      const file = join(dir, executable + ext);
      try {
        await access(file);
      } catch {
        continue;
      }
      if (ext === ".exe") return { file, prefix: [] };
      const shim = await readFile(file, "utf8");
      // npm/cmd-shimが生成する定型だけを認識。未知のbatchを解釈・実行しない。
      const m = /"%_prog%"\s+"%dp0%[\\/]([^"\r\n]+\.[cm]?js)"\s+%\*/i.exec(shim);
      if (!m)
        throw new Error(
          `unsupported Windows batch wrapper for ${executable}; install its native executable or standard npm shim`,
        );
      const script = resolve(dirname(file), m[1]!);
      await access(script);
      const localNode = join(dirname(file), "node.exe");
      try {
        await access(localNode);
        return { file: localNode, prefix: [script] };
      } catch {
        return { file: process.execPath, prefix: [script] };
      }
    }
  }
  throw new Error(`${executable} command was not found on PATH`);
}
export async function runWindowsAgent(encoded: string): Promise<number> {
  const value: unknown = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  if (!value || typeof value !== "object") throw new Error("invalid agent launch");
  const { executable, args } = value as { executable?: unknown; args?: unknown };
  if (
    typeof executable !== "string" ||
    !Array.isArray(args) ||
    args.some((a) => typeof a !== "string" || /[\u0000-\u001f\u007f]/.test(a))
  )
    throw new Error("invalid agent launch arguments");
  const target = await windowsAgentExecutable(executable);
  return new Promise((resolve, reject) => {
    const child = spawn(target.file, [...target.prefix, ...(args as string[])], {
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runWindowsAgent(process.argv[2] ?? "")
    .then((code) => {
      process.exitCode = code;
    })
    .catch((e) => {
      console.error("soda: agent launch failed:", e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    });
}
