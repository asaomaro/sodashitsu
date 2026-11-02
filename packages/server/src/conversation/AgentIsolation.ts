import { access, mkdir, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, delimiter, relative, isAbsolute } from "node:path";
import { RpcError } from "@sodashitsu/protocol";
import { writeFileAtomic } from "../persist/atomicFile.js";
import { openVerified, readRange } from "../agent/safeFile.js";
async function credential(file: string): Promise<string | null> {
  const opened = await openVerified(file).catch(() => null);
  if (!opened) return null;
  try {
    return opened.st.size <= 512 * 1024
      ? (await readRange(opened.fd, 0, opened.st.size)).toString("utf8")
      : null;
  } finally {
    await opened.fd.close();
  }
}
/** Keep the OS home variable intact. A private mount hides global hooks/plugins/configuration. */
export async function isolatedAntigravity(
  dir: string,
  env: NodeJS.ProcessEnv,
): Promise<{ file: string; prefix: string[] }> {
  if (process.platform !== "linux")
    throw new RpcError(
      "agent_prompt_failed",
      "Antigravityの自動分析にはLinuxのbubblewrapが必要です",
    );
  const wrapper = "/usr/bin/bwrap";
  try {
    await access(wrapper, constants.X_OK);
  } catch {
    throw new RpcError(
      "agent_prompt_failed",
      "Antigravityの設定を隔離するためbubblewrapを導入してください",
    );
  }
  let binary: string | undefined;
  for (const path of (env.PATH ?? "").split(delimiter)) {
    if (!isAbsolute(path)) continue;
    const file = join(path, "agy");
    try {
      await access(file, constants.X_OK);
      binary = await realpath(file);
      break;
    } catch {}
  }
  if (!binary) throw new RpcError("agent_prompt_failed", "agy コマンドを起動できません");
  const home = homedir(),
    privateHome = join(dir, "home"),
    config = join(privateHome, ".gemini", "antigravity-cli");
  await mkdir(config, { recursive: true, mode: 0o700 });
  for (const name of ["antigravity-oauth-token", "installation_id"]) {
    const value = await credential(join(home, ".gemini", "antigravity-cli", name));
    if (value !== null) await writeFileAtomic(join(config, name), value);
  }
  const saved = await credential(join(home, ".gemini", "antigravity-cli", "settings.json"));
  if (saved) {
    let parsed: any;
    try {
      parsed = JSON.parse(saved);
    } catch {}
    const settings: any = {};
    for (const key of [
      "model",
      "effort",
      "modelProvider",
      "gcp",
      "customModelsConfig",
      "dataCollectionEnabled",
      "telemetryEnabled",
    ])
      if (parsed?.[key] !== undefined) settings[key] = parsed[key];
    await writeFileAtomic(join(config, "settings.json"), JSON.stringify(settings));
  }
  const mounts = [
    "--ro-bind",
    "/",
    "/",
    "--bind",
    privateHome,
    home,
    "--bind",
    dir,
    dir,
    "--proc",
    "/proc",
    "--dev",
    "/dev",
    "--die-with-parent",
  ];
  const rel = relative(home, binary);
  if (!rel.startsWith("..") && !isAbsolute(rel)) {
    const target = join(privateHome, rel);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await writeFileAtomic(target, "");
    mounts.push("--ro-bind", binary, binary);
  }
  return { file: wrapper, prefix: [...mounts, "--", binary] };
}
