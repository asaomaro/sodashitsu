import { ConfigError, type RawServeArgs } from "./config.js";
import { SESSION_NAME_RULE, sessionNameProblem } from "./persist/namedSession.js";
import { parseMachineArgs, type MachineCommand } from "./machine/machineArgs.js";

export interface ParsedArgs {
  command: "tui" | "serve" | "token-reset" | "session-list" | "session-delete" | "session-stop" | "handoff" | "handoff-preflight" | "bridge" | "machine" | "help";
  /** `soda machine …`（20260927-multi-host-machines）。 */
  machine?: MachineCommand;
  serve: RawServeArgs;
  stateDir?: string | undefined;
  /** `--session`（serve・token reset・handoff。20260926-named-session・20260926-live-handoff）。serve では `serve.session` にも入る。 */
  session?: string | undefined;
  /** `soda session delete <name>`・`soda session stop <name>`（20260927-session-stop）の名前。 */
  sessionTarget?: string | undefined;
  /** `--json`（session だけ）。 */
  json?: boolean;
  /** 隠しコマンド `__handoff-preflight` の段（20260926-live-handoff。1 段目は引数なし・2 段目は `--stage 2 --probe <…>`）。 */
  preflightStage?: 1 | 2;
  preflightProbe?: string;
  /** `session` の出所（`--session`＝flag・`SODA_SESSION`＝env。20260926-named-session-ui）。無ければ既定の session。 */
  sessionSource?: "flag" | "env" | undefined;
  /** 引数なしの `soda`（端末版）の `--allow-nested`（pane の中からでも開く。20260927-cli-mode）。 */
  allowNested?: boolean;
}

/** 既定の session を選ぶ環境変数（herdr の `HERDR_SESSION`。20260926-named-session-ui）。 */
export const SESSION_ENV_VAR = "SODA_SESSION";

/** `handoff/preflight.ts` の `PREFLIGHT_COMMAND` と同じ（cliArgs は重い部品を読み込まないので、名前だけ持つ。テストで一致を確かめる）。 */
export const PREFLIGHT_COMMAND_NAME = "__handoff-preflight";

const USAGE =
  "使い方: soda [--session NAME] [--state-dir D] [--allow-nested] / soda serve [--host H] [--port P] [--cert F] [--key F] [--origin O]... [--state-dir D] [--session NAME] [--scrollback N] [--shell S] [--worktree-dir D] [--pane-history] / soda token reset [--state-dir D] [--session NAME] / soda session list [--state-dir D] [--json] / soda session delete NAME [--state-dir D] [--json] / soda session stop NAME [--state-dir D] [--json] / soda handoff [--state-dir D] [--session NAME] / soda bridge [--session NAME] [--state-dir D] / soda machine add|list|rename|enable|disable|remove …";

/**
 * CLI の引数を解釈する（`soda serve [...]` / `soda token reset [--state-dir D] [--session NAME]` / `soda session list|delete|stop` /
 * `soda handoff [--state-dir D] [--session NAME]`（20260926-live-handoff）・隠しコマンド `__handoff-preflight`）。`main.ts` から分けたのは単体テストのため
 * （`main.ts` は読み込むと起動する）。誤りはどれも `ConfigError`（終了コード 2・使い方つき）：
 * - 未知のオプション・値の無いオプション。
 * - 未知のコマンド・サブコマンド（`soda token rest` 等。以前は help を出して終了コード 0 だった。D103 の独立点検 #6）。
 *   `help`・`--help`・`-h` だけが help。コマンドが無い・先頭がオプションなら端末版（`tui`。20260927-cli-mode）。
 * - `soda serve` の余分な語、`soda token reset` での `soda serve` のオプション（`--host` 等。`--state-dir` と `--session` だけ使える）。
 * - `--json` は `soda session` だけ、`--session` は `soda serve`・`soda token reset`・`soda handoff` だけ（20260926-named-session）。名前の規則は
 *   ここでは見ない（状態ディレクトリを決める `resolveSessionStateDir` が見る）。
 * オプションとサブコマンドの語の順は問わない（`soda token --state-dir D reset` も `reset` を拾う）。**以前は `reset` も
 * オプションとして読み `unknown option: reset` で終わり、`soda token reset` が一度も動かなかった**（D103）。
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const serve: RawServeArgs = { origin: [] };
  if (command === "help" || command === "--help" || command === "-h") return { command: "help", serve };
  // 引数なし・先頭がオプション（`soda --session work`）は端末版（20260927-cli-mode の design「findOrStart」1.）。
  if (command === undefined || command.startsWith("-")) return parseTuiArgs(argv, serve);
  // 更新時の引き継ぎの前の確認（20260926-live-handoff の preflight）。動いているサーバが子として起動する隠しコマンドで、ヘルプに出さない。
  if (command === PREFLIGHT_COMMAND_NAME) {
    if (rest.length === 0) return { command: "handoff-preflight", serve, preflightStage: 1 };
    if (rest.length === 4 && rest[0] === "--stage" && rest[1] === "2" && rest[2] === "--probe") {
      return { command: "handoff-preflight", serve, preflightStage: 2, preflightProbe: rest[3]! };
    }
    throw new ConfigError(`invalid arguments for ${PREFLIGHT_COMMAND_NAME}`, USAGE);
  }
  // 保存した SSH のマシン（20260927-multi-host-machines）。専用の解釈（`machine/machineArgs.ts`）で、ほかのコマンドのオプションを混ぜない。
  if (command === "machine") {
    const parsed = parseMachineArgs(rest);
    return { command: "machine", serve, stateDir: parsed.stateDir, machine: parsed };
  }
  if (command === "bridge") return parseBridgeArgs(rest, serve);
  if (command !== "serve" && command !== "token" && command !== "session" && command !== "handoff") throw new ConfigError(`unknown command: ${command}`, USAGE);
  let stateDir: string | undefined;
  let session: string | undefined;
  let json = false;
  const words: string[] = [];
  const serveOnlyOptions: string[] = [];

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (!arg.startsWith("-")) {
      words.push(arg);
      continue;
    }
    const next = (): string => {
      const v = rest[++i];
      if (v === undefined) throw new ConfigError(`missing value for ${arg}`, `${arg} には値が要ります。`);
      return v;
    };
    if (arg !== "--state-dir" && arg !== "--session" && arg !== "--json") serveOnlyOptions.push(arg);
    switch (arg) {
      case "--host":
        serve.host = next();
        break;
      case "--port":
        serve.port = next();
        break;
      case "--cert":
        serve.cert = next();
        break;
      case "--key":
        serve.key = next();
        break;
      case "--origin":
        serve.origin!.push(next());
        break;
      case "--state-dir":
        stateDir = next();
        serve.stateDir = stateDir;
        break;
      case "--session":
        session = next();
        serve.session = session;
        serve.sessionSource = "flag";
        break;
      case "--json":
        json = true;
        break;
      case "--scrollback":
        serve.scrollback = next();
        break;
      case "--shell":
        serve.shell = next();
        break;
      case "--worktree-dir":
        serve.worktreeDir = next();
        break;
      case "--pane-history":
        // 値を取らない（20260926-screen-history-replay）。画面履歴の保存と再生を有効にする（既定は無効）。
        serve.paneHistory = true;
        break;
      default:
        throw new ConfigError(`unknown option: ${arg}`, USAGE);
    }
  }

  if (command !== "session" && json) throw new ConfigError(`--json is not an option of soda ${command === "token" ? "token reset" : command}`, USAGE);
  if (command === "serve") {
    if (words.length > 0) throw new ConfigError(`unexpected argument for soda serve: ${words[0]}`, USAGE);
    return { command: "serve", serve, stateDir, session, ...(session !== undefined ? { sessionSource: "flag" as const } : {}) };
  }
  if (command === "session") return parseSessionCommand(words, serveOnlyOptions, session, stateDir, json, serve);
  if (command === "handoff") {
    // `soda handoff [--state-dir D] [--session NAME]`（20260926-live-handoff）。`soda serve` の他の指定は取らない。
    const bad = serveOnlyOptions[0];
    if (bad !== undefined) throw new ConfigError(`${bad} is not an option of soda handoff`, `soda handoff で使えるオプションは --state-dir と --session だけです。${USAGE}`);
    if (words.length > 0) throw new ConfigError(`unexpected argument: ${words[0]}`, USAGE);
    return { command: "handoff", serve, stateDir, session, ...(session !== undefined ? { sessionSource: "flag" as const } : {}) };
  }
  if (words.length === 0) throw new ConfigError("missing subcommand: soda token <reset>", USAGE);
  if (words[0] !== "reset" || words.length > 1) throw new ConfigError(`unknown subcommand: soda token ${words.join(" ")}`, USAGE);
  if (serveOnlyOptions.length > 0) {
    throw new ConfigError(
      `${serveOnlyOptions[0]} is not an option of soda token reset`,
      `soda token reset で使えるオプションは --session と --state-dir だけです（${serveOnlyOptions[0]} は soda serve のオプション）。`,
    );
  }
  return { command: "token-reset", serve, stateDir, session, ...(session !== undefined ? { sessionSource: "flag" as const } : {}) };
}

/**
 * `soda serve`・`soda token reset`・`soda handoff`・引数なしの `soda` で `--session` が無ければ、環境変数 `SODA_SESSION` の値を session の名前にする（herdr の `HERDR_SESSION`。
 * 20260926-named-session-ui の design「SODA_SESSION」）。`main.ts` だけが呼ぶ——サーバを組み立てる `composeServer` は環境変数の session を
 * 見ない（テスト・smoke が開発者のシェルの値で別の状態ディレクトリを使わないため）。
 * - 無い・空は何もしない（herdr は空を誤りにするが、`export SODA_SESSION=` で外せるようにした。decisions D3）。
 * - `default` は既定の session（`resolveSessionStateDir` が既定にする）。
 * - 規則外は `ConfigError`（終了コード 2。何も作らず・読まない）で、値の出所が `SODA_SESSION` であることを示す。
 * - `soda session list`・`delete`・`stop` は名前を明示して受け取るので見ない（`stop` は pane の中の `SODA_SESSION` でその pane ごと止めないため。20260927-session-stop の decisions D3）。
 */
export function applySessionEnv(parsed: ParsedArgs, env: NodeJS.ProcessEnv): ParsedArgs {
  // 引数なしの `soda`（端末版）も `soda serve` と同じ規則で session を決める（見つける・起動する先を揃える。20260927-cli-mode）。
  if (parsed.command !== "serve" && parsed.command !== "token-reset" && parsed.command !== "handoff" && parsed.command !== "tui") return parsed;
  if (parsed.session !== undefined) return parsed;
  const value = env[SESSION_ENV_VAR];
  if (value === undefined || value === "") return parsed;
  const problem = sessionNameProblem(value); // `default` は規則に合う（既定の session の別名）
  if (problem !== undefined) {
    throw new ConfigError(
      `invalid ${SESSION_ENV_VAR}: ${JSON.stringify(value)} (${problem})`,
      `環境変数 ${SESSION_ENV_VAR} の値が session の名前の規則に合いません。${SESSION_NAME_RULE}${SESSION_ENV_VAR} を外すか空にするか、--session で名前を指定してください。`,
    );
  }
  return {
    ...parsed,
    session: value,
    sessionSource: "env",
    serve: { ...parsed.serve, session: value, sessionSource: "env" },
  };
}

/**
 * `soda session list` / `soda session delete <name>`（20260926-named-session）/ `soda session stop <name>`（20260927-session-stop。名前は必須で `SODA_SESSION` は見ない——
 * pane の中の `SODA_SESSION` でその pane ごと止めないため。decisions D3）。使えるオプションは --state-dir と --json だけ。
 */
function parseSessionCommand(
  words: readonly string[],
  serveOnlyOptions: readonly string[],
  session: string | undefined,
  stateDir: string | undefined,
  json: boolean,
  serve: RawServeArgs,
): ParsedArgs {
  const bad = serveOnlyOptions[0] ?? (session !== undefined ? "--session" : undefined);
  if (bad !== undefined) {
    throw new ConfigError(`${bad} is not an option of soda session`, `soda session で使えるオプションは --state-dir と --json だけです。${USAGE}`);
  }
  const [sub, ...args] = words;
  if (sub === "list" && args.length === 0) return { command: "session-list", serve, stateDir, json };
  if (sub === "delete" && args.length === 1) return { command: "session-delete", serve, stateDir, json, sessionTarget: args[0] };
  if (sub === "stop" && args.length === 1) return { command: "session-stop", serve, stateDir, json, sessionTarget: args[0] };
  if (sub === undefined) throw new ConfigError("missing subcommand: soda session <list|delete|stop>", USAGE);
  if ((sub === "delete" || sub === "stop") && args.length === 0)
    throw new ConfigError(`missing session name: soda session ${sub} <name>`, `${sub === "stop" ? "既定の session を止めるなら名前に default を指定してください。" : ""}${USAGE}`);
  throw new ConfigError(`unknown subcommand: soda session ${words.join(" ")}`, USAGE);
}

/**
 * `soda bridge [--session NAME] [--state-dir D]`（20260927-multi-host-machines）。手元の `soda serve` が ssh の先で起動する。`SODA_SESSION` は見ない
 * （`applySessionEnv` の対象外。decisions D5）。名前の規則は `resolveSessionStateDir` が見る。
 */
function parseBridgeArgs(rest: readonly string[], serve: RawServeArgs): ParsedArgs {
  let stateDir: string | undefined;
  let session: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    const next = (): string => {
      const v = rest[++i];
      if (v === undefined) throw new ConfigError(`missing value for ${arg}`, `${arg} には値が要ります。`);
      return v;
    };
    if (arg === "--state-dir") stateDir = next();
    else if (arg === "--session") session = next();
    else throw new ConfigError(arg.startsWith("-") ? `unknown option: ${arg}` : `unexpected argument: ${arg}`, "使い方: soda bridge [--session NAME] [--state-dir D]");
  }
  return { command: "bridge", serve, stateDir, session };
}

/**
 * 引数なしの `soda`（端末版。20260927-cli-mode）。手元の `soda serve` を見つけて（無ければ裏で起動して）繋ぐ。使えるオプションは `--session`・`--state-dir`・
 * `--allow-nested` だけ（`soda serve` のほかのオプションは受けない——既に動いているサーバには効かないので、紛らわしい）。名前の規則は `resolveSessionStateDir` が見る。
 */
function parseTuiArgs(argv: readonly string[], serve: RawServeArgs): ParsedArgs {
  let stateDir: string | undefined;
  let session: string | undefined;
  let allowNested = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new ConfigError(`missing value for ${arg}`, `${arg} には値が要ります。`);
      return v;
    };
    if (arg === "--state-dir") {
      stateDir = next();
      serve.stateDir = stateDir;
    } else if (arg === "--session") {
      session = next();
      serve.session = session;
      serve.sessionSource = "flag";
    } else if (arg === "--allow-nested") allowNested = true;
    else throw new ConfigError(arg.startsWith("-") ? `unknown option: ${arg}` : `unexpected argument: ${arg}`, USAGE);
  }
  return {
    command: "tui",
    serve,
    stateDir,
    session,
    ...(session !== undefined ? { sessionSource: "flag" as const } : {}),
    ...(allowNested ? { allowNested: true } : {}),
  };
}
