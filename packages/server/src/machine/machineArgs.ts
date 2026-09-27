import { ConfigError } from "../configError.js";

/**
 * `soda machine …` の引数（20260927-multi-host-machines の design「soda machine」）。誤りは `ConfigError`（終了コード 2・使い方つき）。
 * 規則（宛先・名前・session・id の形）は実行する側（`machineCommands.ts`）が見る——ここは語の並びだけ。
 */
export const MACHINE_USAGE = [
  "soda machine add <ssh-target> --label <name> [--remote-session <name>] [--state-dir DIR]",
  "soda machine list [--json] [--state-dir DIR]",
  "soda machine rename <id> --label <name> [--state-dir DIR]",
  "soda machine enable <id> [--state-dir DIR]",
  "soda machine disable <id> [--state-dir DIR]",
  "soda machine remove <id> [--state-dir DIR]",
].join("\n");

export type MachineCommand =
  | {
      sub: "add";
      target: string;
      label: string;
      session: string | undefined;
      stateDir: string | undefined;
    }
  | { sub: "list"; json: boolean; stateDir: string | undefined }
  | { sub: "rename"; id: string; label: string; stateDir: string | undefined }
  | { sub: "enable" | "disable" | "remove"; id: string; stateDir: string | undefined };

export function parseMachineArgs(rest: readonly string[]): MachineCommand {
  const [sub, ...args] = rest;
  const words: string[] = [];
  const values = new Map<string, string>();
  let json = false;
  const allowed: Record<string, readonly string[]> = {
    add: ["--label", "--remote-session", "--state-dir"],
    list: ["--json", "--state-dir"],
    rename: ["--label", "--state-dir"],
    enable: ["--state-dir"],
    disable: ["--state-dir"],
    remove: ["--state-dir"],
  };
  if (sub === undefined)
    throw new ConfigError(
      "missing subcommand: soda machine <add|list|rename|enable|disable|remove>",
      MACHINE_USAGE,
    );
  const opts = allowed[sub];
  if (opts === undefined)
    throw new ConfigError(`unknown subcommand: soda machine ${sub}`, MACHINE_USAGE);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    // `--` の後は位置引数（`-` で始まる名前を渡したいとき）。宛先は `-` で始められない（規則で断る）。
    if (arg === "--") {
      words.push(...args.slice(i + 1));
      break;
    }
    if (!arg.startsWith("-")) {
      words.push(arg);
      continue;
    }
    if (!opts.includes(arg))
      throw new ConfigError(`unknown option for soda machine ${sub}: ${arg}`, MACHINE_USAGE);
    if (arg === "--json") {
      json = true;
      continue;
    }
    const v = args[++i];
    if (v === undefined)
      throw new ConfigError(`missing value for ${arg}`, `${arg} には値が要ります。`);
    if (values.has(arg)) throw new ConfigError(`${arg} can only be specified once`, MACHINE_USAGE);
    values.set(arg, v);
  }
  const stateDir = values.get("--state-dir");
  const want = (n: number, what: string): void => {
    if (words.length < n)
      throw new ConfigError(`missing ${what}: soda machine ${sub}`, MACHINE_USAGE);
    if (words.length > n) throw new ConfigError(`unexpected argument: ${words[n]}`, MACHINE_USAGE);
  };
  switch (sub) {
    case "add": {
      want(1, "<ssh-target>");
      const label = values.get("--label");
      if (label === undefined)
        throw new ConfigError(
          "--label is required: soda machine add <ssh-target> --label <name>",
          MACHINE_USAGE,
        );
      return { sub, target: words[0]!, label, session: values.get("--remote-session"), stateDir };
    }
    case "list":
      want(0, "");
      return { sub, json, stateDir };
    case "rename": {
      want(1, "<id>");
      const label = values.get("--label");
      if (label === undefined)
        throw new ConfigError(
          "--label is required: soda machine rename <id> --label <name>",
          MACHINE_USAGE,
        );
      return { sub, id: words[0]!, label, stateDir };
    }
    default:
      want(1, "<id>");
      return { sub: sub as "enable" | "disable" | "remove", id: words[0]!, stateDir };
  }
}
