import {
  AGENT_START_KINDS,
  GRAPH_HISTORY_PER_LINK,
  GRAPH_LINKS_MAX,
  LINK_LIMIT_MAX,
  LINK_LIMIT_MIN,
  LINK_LINES_MAX,
  LINK_LINES_MIN,
  type LinkKind,
  ASK_TIMEOUT_DEFAULT_MS,
  ASK_TIMEOUT_MAX_MS,
  ASK_TIMEOUT_MIN_MS,
  AGENT_REPORT_SOCKET_BASENAME,
  PANE_SOCKET_BASENAME,
} from "@sodashitsu/protocol";
import { posix } from "node:path";
import { AGENT_STATUSES, type AgentStatus } from "./agentStatus.js";
import { DEFAULT_CONTROL_SIZE, MAX_STREAM_DIMENSION } from "./sessionStream.js";

/**
 * `sodactl` の引数解釈（design.md「インターフェース/データ構造・コマンド一覧」）。`main.ts` から分けたのは
 * 単体テストのため（`packages/server/src/cliArgs.ts` と同じ流儀）。誤りはどれも `CliUsageError`
 * （終了コード 2・使い方つき）：未知のオプション・値の無いオプション・未知の（サブ）コマンド・
 * 必須の位置引数の欠落・余分な位置引数・`--direction`/`--ratio`/`--timeout` 等の値が不正。
 */

/**
 * 各コマンドの 1 行（`sodactl help` の一覧・使い方の誤りの案内・skill ファイルとの食い違いの検査〔`skill.test.ts`〕が同じものを見る。
 * 20260926-agent-skill-file で `main.ts` の `printHelp` の一覧をここへ一本化した）。
 */
export const USAGE_LINES: readonly string[] = [
  "sodactl login --url <URL> --token <TOKEN>",
  "sodactl workspace create [--cwd <path>] [--label <text>] [--url <URL>] [--token <TOKEN>]",
  "sodactl workspace close <workspaceId> [--url <URL>] [--token <TOKEN>]",
  "sodactl workspace rename <workspaceId> <label> [--url <URL>] [--token <TOKEN>]",
  "sodactl workspace report-metadata <workspaceId> --source <ID> [--token <NAME=VALUE>]... [--clear-token <NAME>]... [--seq <N>] [--ttl-ms <N>] [--url <URL>] [--token <TOKEN>]",
  "sodactl tab create [--workspace <id>] [--label <text>] [--url <URL>] [--token <TOKEN>]",
  "sodactl tab close <tabId> [--url <URL>] [--token <TOKEN>]",
  "sodactl pane split [<paneId>|--pane <paneId>|--current] --direction right|down [--ratio <0.05-0.95>] [--url <URL>] [--token <TOKEN>]",
  "sodactl pane current [--pane <paneId>|--current] [--url <URL>] [--token <TOKEN>]",
  "sodactl pane close <paneId> [--url <URL>] [--token <TOKEN>]",
  "sodactl pane input <paneId> <text> [--url <URL>] [--token <TOKEN>]",
  "sodactl pane run <paneId> <command> [--url <URL>] [--token <TOKEN>]",
  "sodactl pane read <paneId> [--follow] [--raw] [--timeout <ms>] [--url <URL>] [--token <TOKEN>]",
  "sodactl pane attach <paneId> [--takeover] [--url <URL>] [--token <TOKEN>]",
  "sodactl pane observe <paneId> [--url <URL>] [--token <TOKEN>]",
  "sodactl pane control <paneId> [--takeover] [--cols <N>] [--rows <N>] [--url <URL>] [--token <TOKEN>]",
  "sodactl pane report-metadata <paneId> --source <ID> [--token <NAME=VALUE>]... [--clear-token <NAME>]... [--seq <N>] [--ttl-ms <N>] [--url <URL>] [--token <TOKEN>]",
  "sodactl snapshot [--url <URL>] [--token <TOKEN>]",
  "sodactl watch [--json] [--url <URL>] [--token <TOKEN>]",
  "sodactl agent list [--url <URL>] [--token <TOKEN>]",
  "sodactl agent get <target> [--url <URL>] [--token <TOKEN>]",
  "sodactl agent wait <target> [--until working|blocked|idle|done|unknown]... [--timeout <ms>] [--url <URL>] [--token <TOKEN>]",
  "sodactl agent read <target> [--lines <N>] [--raw] [--timeout <ms>] [--url <URL>] [--token <TOKEN>]",
  "sodactl agent prompt <target> <text> [--wait] [--until working|blocked|idle|done|unknown]... [--timeout <ms>] [--url <URL>] [--token <TOKEN>]",
  "sodactl agent send-keys <target> <key>... [--url <URL>] [--token <TOKEN>]",
  "sodactl agent rename <target> <name>|--clear [--url <URL>] [--token <TOKEN>]",
  "sodactl agent start <name> --kind <KIND> --pane <paneId> [--timeout <ms>] [--url <URL>] [--token <TOKEN>] [-- <args>...]",
  "sodactl graph show [--json] [--url <URL>] [--token <TOKEN>]",
  "sodactl graph link add <from> <to> [--kind trigger|supervise|approval] [--on done|blocked] [--prompt <text>] [--output <N>|--no-output] [--when-busy wait|skip] [--mode notify|delegate] [--lines <N>] [--limit <N>] [--json] [--url <URL>] [--token <TOKEN>]",
  "sodactl graph link set <linkId> [--on done|blocked] [--prompt <text>] [--output <N>|--no-output] [--when-busy wait|skip] [--mode notify|delegate] [--lines <N>] [--limit <N>] [--json] [--url <URL>] [--token <TOKEN>]",
  "sodactl graph link rm <linkId> [--json] [--url <URL>] [--token <TOKEN>]",
  "sodactl graph link pause <linkId> [--json] [--url <URL>] [--token <TOKEN>]",
  "sodactl graph link resume <linkId> [--json] [--url <URL>] [--token <TOKEN>]",
  "sodactl graph pause [--json] [--url <URL>] [--token <TOKEN>]",
  "sodactl graph resume [--json] [--url <URL>] [--token <TOKEN>]",
  "sodactl graph node add <pane>... [--json] [--url <URL>] [--token <TOKEN>]",
  "sodactl graph node rm <pane> [--json] [--url <URL>] [--token <TOKEN>]",
  "sodactl graph node rekey <pane> <newPane> [--json] [--url <URL>] [--token <TOKEN>]",
  "sodactl graph history [<linkId>] [--limit <N>] [--json] [--url <URL>] [--token <TOKEN>]",
  "sodactl ask [--timeout <ms>] [--url <URL>] [--token <TOKEN>] < spec.json",
  "sodactl skill",
];

/** `sodactl --machine <名前|id> <コマンド> …`（20260927-multi-host-machines）の説明。前置きなので `USAGE_LINES`（コマンドの一覧）には入れない。 */
export const MACHINE_USAGE_LINE =
  "sodactl --machine <名前|id> <コマンド> …（手元の soda serve に登録したマシン〔soda machine〕へ送る。login・skill 以外）";

const USAGE = [
  ...USAGE_LINES,
  MACHINE_USAGE_LINE,
  "（<target> は pane ID か、agent rename で付けた名前）",
  "（report-metadata の --token は、値が = を含めば独自トークンの NAME=VALUE、含まなければ接続の token）",
  "（graph の <from> <to> <pane> は pane ID・agent rename の名前・<マシンの名前|id>:<pane ID>〔soda machine で登録した別のマシンの pane〕。-- で始まる文面は --prompt=<text>）",
].join("\n");

/** `--machine` の値の上限（文字数。サーバの `?machine=` の上限と同じ）。 */
export const MAX_MACHINE_SELECTOR_LENGTH = 256;

export const DEFAULT_URL = "http://127.0.0.1:7780";

/**
 * 独自トークンの報告の引数（20260927-sidebar-row-tokens）。`tokens` は指定の順（同じ名前は後が勝つ——サーバが見る）。`value: null` は消去。
 * 値の整え方・名前と source の規則・上限はサーバだけが見る（CLI で重ねない。architecture.md「コンポーネント」）。
 */
export interface MetadataReportArgs {
  source: string;
  tokens: { name: string; value: string | null }[];
  seq?: number;
  ttlMs?: number;
}

export class CliUsageError extends Error {
  readonly hint: string;
  constructor(message: string, hint: string = USAGE) {
    super(message);
    this.name = "CliUsageError";
    this.hint = hint;
  }
}

/**
 * pane の中で動いている sodactl の呼び出し元（20260926-agent-skill-file）。サーバが pane の環境に入れた `SODA_PANE_ID`・`SODA_SERVER_URL` から作る。
 * 自分の pane への操作の歯止め（`selfGuard.ts`）が使う。
 */
export interface CallerPane {
  paneId: string;
  serverUrl: string;
}

export interface GlobalOpts {
  url: string;
  token: string | undefined;
  /** pane の中（`SODA_PANE_ID` と `SODA_SERVER_URL` がどちらも空でない）ときだけある。`--machine` のときは無い（ローカルの pane の id はリモートで意味を持たない）。 */
  caller?: CallerPane;
  /** `--machine <名前|id>`（20260927-multi-host-machines）。手元の `soda serve` の `/ws?machine=` で、そのマシンへ送る。 */
  machine?: string;
  /**
   * 接続先を利用者が明示した（`--url` か、空でない `SODACTL_URL`）。20261003-sodactl-ask-socket。`url` は 1 つの文字列にまとまっていて、
   * 明示したものか `SODA_SERVER_URL`・既定から決まったものかが後から分からないので、印を別に持つ（明示したときは受け口を使わない）。
   */
  urlExplicit: boolean;
  /**
   * その pane のサーバのログイン不要の受け口（`pane.sock`）のパス（20261003-sodactl-ask-socket）。環境から決める（`paneSocketPathFromEnv`）。
   * 無ければ受け口は使わない。実際に使うか（pane の中か・`urlExplicit`・`--machine`）はここでは見ない。
   */
  paneSocket?: string;
}

/**
 * 受け口（`pane.sock`）のパスを環境から決める（20261003-sodactl-ask-socket）。
 * 1. `SODA_PANE_SOCKET`（空でなければ）——サーバが pane の環境に入れた値。
 * 2. 無ければ、`SODA_AGENT_REPORT_SOCKET` が絶対パスで、末尾がちょうど `/agent-report.sock` のとき、同じディレクトリの `pane.sock`
 *    （2 つのファイル名は protocol の `AGENT_REPORT_SOCKET_BASENAME`・`PANE_SOCKET_BASENAME`。サーバと同じ定数）——
 *    `SODA_PANE_SOCKET` を入れる前のサーバが起動した pane（更新時の引き継ぎを跨いで生きている pane）でも、新しいサーバの受け口に届く。
 *    別の名前（利用者が差し替えた等）・末尾のスラッシュ・相対パス（どのディレクトリの受け口かが sodactl の cwd で変わる）からは推測しない。
 * 3. どちらも無ければ undefined。
 *
 * Windows では常に undefined（受け口は Unix ドメイン socket のファイルで、Windows のサーバは開かない。`SODA_AGENT_REPORT_SOCKET` も named pipe で、
 * ディレクトリを持たない）。パスの計算は `path.posix`（ここへ届くのは Windows 以外だけ。実行中の OS の流儀に依らせない——Windows のホストで
 * 単体テストを走らせても同じ結果になる）。
 */
export function paneSocketPathFromEnv(env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): string | undefined {
  if (platform === "win32") return undefined;
  const explicit = env["SODA_PANE_SOCKET"];
  // 絶対パスだけを使う（相対だと、どの受け口かが sodactl の cwd で変わる。サーバは絶対パスを入れる）。
  if (explicit) return posix.isAbsolute(explicit) ? explicit : undefined;
  const report = env["SODA_AGENT_REPORT_SOCKET"];
  if (report && posix.isAbsolute(report) && report.endsWith(`/${AGENT_REPORT_SOCKET_BASENAME}`)) {
    return posix.join(posix.dirname(report), PANE_SOCKET_BASENAME);
  }
  return undefined;
}

/**
 * pane の対象の指定（20260927-caller-pane-default。herdr の `[<pane_id>|--pane ID|--current]`）。ID への解決は実行時（`paneTarget.ts`）——
 * 呼び出し元の pane は同じサーバかを確かめてから、フォーカスの pane は接続後の snapshot で決まるため。
 * - `id`: 位置引数か `--pane` で明示した pane。
 * - `caller`: 呼び出し元の pane（`SODA_PANE_ID`）。`explicit` は `--current` で明示したか（`--machine` での扱いが違う）。
 * - `focused`: サーバのフォーカスの pane（pane の外・`--machine` で対象を省いたとき）。
 */
export type PaneTarget =
  | { kind: "id"; paneId: string }
  | { kind: "caller"; paneId: string; explicit: boolean }
  | { kind: "focused" };

/**
 * `graph link add|set` の線の設定（20260927-agent-graph の 05）。省いた項目は、add なら既定値（client-core の `defaults`）、set なら今の値のまま。
 * `output: null` は `--no-output`（受け渡さない）。どの項目がどの種類の線に使えるかは、add は引数の解析で、set は線の種類を知った実行時に見る。
 */
export interface GraphLinkConfigArgs {
  on?: "done" | "blocked";
  prompt?: string;
  output?: number | null;
  whenBusy?: "wait" | "skip";
  mode?: "notify" | "delegate";
  lines?: number;
  limit?: number;
}

/**
 * `sodactl graph …` の操作。ノード・線の端（`from`・`to`・`pane`）は利用者が書いたまま（pane ID・エージェントの名前・`<マシン>:<pane ID>`）で、
 * ノードの鍵（`local:p3`・`<machineId>:p7`）への解決は接続した後（名前は snapshot と `machine.list` で引く。`commands/graph.ts`）。
 */
export type GraphAction =
  | { kind: "show" }
  | { kind: "link-add"; from: string; to: string; linkKind: LinkKind; config: GraphLinkConfigArgs }
  | { kind: "link-set"; linkId: string; config: GraphLinkConfigArgs }
  | { kind: "link-rm"; linkId: string }
  | { kind: "link-pause"; linkId: string }
  | { kind: "link-resume"; linkId: string }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "node-add"; panes: string[] }
  | { kind: "node-rm"; pane: string }
  | { kind: "node-rekey"; pane: string; newPane: string }
  | { kind: "history"; linkId: string | undefined; limit: number | undefined };

export type Command =
  | { kind: "help" }
  | { kind: "skill" }
  | { kind: "login"; opts: GlobalOpts }
  | { kind: "workspace-create"; opts: GlobalOpts; cwd: string | undefined; label: string | undefined }
  | { kind: "workspace-close"; opts: GlobalOpts; workspaceId: string }
  | { kind: "workspace-rename"; opts: GlobalOpts; workspaceId: string; label: string }
  // 20261002-sodactl-ask。呼び出し元の pane の質問のフォームを、その pane を見ているブラウザに出す（定義は標準入力）。
  | { kind: "ask"; opts: GlobalOpts; timeoutMs: number }
  // 20260927-sidebar-row-tokens（herdr の workspace/pane report-metadata のトークンの部分）。
  | { kind: "workspace-report-metadata"; opts: GlobalOpts; workspaceId: string; report: MetadataReportArgs }
  | { kind: "pane-report-metadata"; opts: GlobalOpts; paneId: string; report: MetadataReportArgs }
  | { kind: "tab-create"; opts: GlobalOpts; workspaceId: string | undefined; label: string | undefined }
  | { kind: "tab-close"; opts: GlobalOpts; tabId: string }
  | { kind: "pane-split"; opts: GlobalOpts; target: PaneTarget; direction: "right" | "down"; ratio: number | undefined }
  // 20260927-caller-pane-default（herdr の pane current）。
  | { kind: "pane-current"; opts: GlobalOpts; target: PaneTarget }
  | { kind: "pane-close"; opts: GlobalOpts; paneId: string }
  | { kind: "pane-input"; opts: GlobalOpts; paneId: string; text: string }
  | { kind: "pane-run"; opts: GlobalOpts; paneId: string; command: string }
  | { kind: "pane-read"; opts: GlobalOpts; paneId: string; follow: boolean; raw: boolean; timeoutMs: number }
  | { kind: "pane-attach"; opts: GlobalOpts; paneId: string; takeover: boolean }
  // 20260926-pane-observe-control（herdr の terminal session observe/control）。
  | { kind: "pane-observe"; opts: GlobalOpts; paneId: string }
  | { kind: "pane-control"; opts: GlobalOpts; paneId: string; takeover: boolean; cols: number; rows: number }
  | { kind: "snapshot"; opts: GlobalOpts }
  | { kind: "watch"; opts: GlobalOpts; json: boolean }
  | { kind: "agent-list"; opts: GlobalOpts }
  // agent-* の paneId は pane ID かエージェントの名前（`agentTarget.ts` の `resolveAgentTarget` で解決する。20260926-agent-start-rename）。
  | { kind: "agent-get"; opts: GlobalOpts; paneId: string }
  | { kind: "agent-wait"; opts: GlobalOpts; paneId: string; until: AgentStatus[]; timeoutMs: number | undefined }
  | { kind: "agent-read"; opts: GlobalOpts; paneId: string; lines: number; raw: boolean; timeoutMs: number }
  | {
      kind: "agent-prompt";
      opts: GlobalOpts;
      paneId: string;
      text: string;
      wait: boolean;
      until: AgentStatus[];
      timeoutMs: number | undefined;
    }
  | { kind: "agent-send-keys"; opts: GlobalOpts; paneId: string; keys: string[] }
  /** `name: null` は `--clear`（名前を外す）。 */
  | { kind: "agent-rename"; opts: GlobalOpts; paneId: string; name: string | null }
  /** `args` は `--` の後の全部（エージェントへの引数。20260926-agent-start）。 */
  | {
      kind: "agent-start";
      opts: GlobalOpts;
      name: string;
      agentKind: string;
      paneId: string;
      timeoutMs: number | undefined;
      args: string[];
    }
  // 20260927-agent-graph の 05。`json` は表でなく JSON で出す。
  | { kind: "graph"; opts: GlobalOpts; json: boolean; action: GraphAction };

const DEFAULT_READ_TIMEOUT_MS = 5000;
/** herdr の `agent read` の既定（recent の 80 行）。 */
const DEFAULT_AGENT_READ_LINES = 80;

interface FlagSpec {
  /** 値を取らない真偽フラグ（`--follow` 等）。 */
  bools?: readonly string[];
  /** 値を1つ取るフラグ（`--label <text>` 等）。 */
  values?: readonly string[];
  /** 値を1つ取り、繰り返し指定できるフラグ（`--until <status>` 等）。 */
  multi?: readonly string[];
  /**
   * `values` のうち `--flag=値` の形も受けるもの（`graph link add|set` の `--prompt`。`--` で始まる文面を渡すため。g05 点検）。
   * 最初の `=` で分け、後ろは `=` を含めてそのまま値にする。
   */
  inline?: readonly string[];
}

interface ParsedFlags {
  positionals: string[];
  values: Map<string, string>;
  bools: Set<string>;
  multi: Map<string, string[]>;
  /** `multi` のフラグを、異なるフラグをまたいで現れた順に（`report-metadata` の `--token`・`--clear-token` の後が勝つ順）。 */
  sequence: [flag: string, value: string][];
}

/**
 * 残りの語（サブコマンド名を除いた後）を、位置引数とフラグに分ける。`spec` に無いフラグは
 * `CliUsageError`（未知のオプション）。値フラグの直後に値が無い（末尾、または次も `--` で始まる）のも
 * `CliUsageError`。`--url`/`--token` は全コマンド共通なので、呼び出し側が `spec` に含める。
 */
function parseFlags(rest: readonly string[], spec: FlagSpec): ParsedFlags {
  const bools = new Set(spec.bools ?? []);
  const values = new Set(spec.values ?? []);
  const multi = new Set(spec.multi ?? []);
  const inline = new Set(spec.inline ?? []);
  const positionals: string[] = [];
  const outValues = new Map<string, string>();
  const outBools = new Set<string>();
  const outMulti = new Map<string, string[]>();
  const sequence: [string, string][] = [];

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    if (bools.has(arg)) {
      outBools.add(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq > 0 && inline.has(arg.slice(0, eq))) {
      outValues.set(arg.slice(0, eq), arg.slice(eq + 1));
      continue;
    }
    if (values.has(arg) || multi.has(arg)) {
      const v = rest[++i];
      if (v === undefined || v.startsWith("--")) {
        const more = inline.has(arg) ? `（-- で始まる値は ${arg}=<値> の形で渡してください）` : "";
        throw new CliUsageError(`missing value for ${arg}`, `${arg} には値が要ります。${more}`);
      }
      if (multi.has(arg)) {
        outMulti.set(arg, [...(outMulti.get(arg) ?? []), v]);
        sequence.push([arg, v]);
      } else outValues.set(arg, v);
      continue;
    }
    throw new CliUsageError(`unknown option: ${arg}`, USAGE);
  }
  return { positionals, values: outValues, bools: outBools, multi: outMulti, sequence };
}

/**
 * `--url`/`--token` を取り出す（全コマンド共通）。接続先は `--url` → `SODACTL_URL` → `SODA_SERVER_URL`（サーバが pane の環境に入れる、その pane の
 * サーバの URL）→ 既定の順（20260926-agent-skill-file）。利用者が明示した設定を、サーバの推定より上にする。
 * `paneSocket` はここでは入れない（引数に依らず環境と OS だけで決まるので、`parseArgs` が最後に 1 か所で足す）。
 */
function globalOptsFrom(values: Map<string, string>, env: NodeJS.ProcessEnv): GlobalOpts {
  const paneId = env["SODA_PANE_ID"];
  const serverUrl = env["SODA_SERVER_URL"];
  const opts: GlobalOpts = {
    url: values.get("--url") ?? env["SODACTL_URL"] ?? (serverUrl ? serverUrl : DEFAULT_URL),
    token: values.get("--token") ?? env["SODACTL_TOKEN"],
    urlExplicit: values.has("--url") || Boolean(env["SODACTL_URL"]),
  };
  if (paneId && serverUrl) opts.caller = { paneId, serverUrl };
  return opts;
}

function parsePositiveInt(raw: string, flag: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new CliUsageError(`invalid value for ${flag}: ${raw}`, `${flag} には正の整数を指定してください。`);
  }
  return n;
}

function parseRatio(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0.05 || n > 0.95) {
    throw new CliUsageError(`invalid value for --ratio: ${raw}`, "--ratio には 0.05〜0.95 の数値を指定してください。");
  }
  return n;
}

function requirePositional(positionals: readonly string[], index: number, name: string, usage: string): string {
  const v = positionals[index];
  if (v === undefined) throw new CliUsageError(`missing ${name}`, usage);
  return v;
}

function rejectExtra(positionals: readonly string[], expected: number, usage: string): void {
  if (positionals.length > expected) throw new CliUsageError(`unexpected argument: ${positionals[expected]}`, usage);
}

/**
 * `process.argv.slice(2)` を渡す。`env` は既定 `process.env`、`platform` は既定 `process.platform`（どちらもテストで差し替える）。
 * 接続先を持つコマンド（`opts` がある）には、受け口のパス（`GlobalOpts.paneSocket`）をここで足す（20261003-sodactl-ask-socket）。
 */
export function parseArgs(argv: readonly string[], env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): Command {
  const cmd = parseCommand(argv, env);
  const paneSocket = paneSocketPathFromEnv(env, platform);
  if (paneSocket === undefined || !("opts" in cmd)) return cmd;
  return { ...cmd, opts: { ...cmd.opts, paneSocket } } as Command;
}

function parseCommand(argv: readonly string[], env: NodeJS.ProcessEnv): Command {
  // `--machine <名前|id>` は前置き（herdr の `herdr --machine … <command>`）。20260927-multi-host-machines。
  if (argv[0] === "--machine") return parseMachinePrefixed(argv, env);
  const [word0, word1, ...rest0] = argv;
  if (word0 === undefined || word0 === "help" || word0 === "--help" || word0 === "-h") return { kind: "help" };

  const URL_TOKEN: FlagSpec = { values: ["--url", "--token"] };

  switch (word0) {
    // 20260926-agent-skill-file。skill ファイルを出すだけ（サーバへつながない）。引数・オプションは取らない。
    case "skill": {
      const { positionals } = parseFlags(argv.slice(1), {});
      rejectExtra(positionals, 0, "sodactl skill");
      return { kind: "skill" };
    }
    case "login": {
      const { positionals, values } = parseFlags(argv.slice(1), URL_TOKEN);
      rejectExtra(positionals, 0, USAGE);
      const opts = globalOptsFrom(values, env);
      if (!opts.token) throw new CliUsageError("missing --token", "sodactl login --url <URL> --token <TOKEN>");
      return { kind: "login", opts };
    }
    case "snapshot": {
      const { positionals, values } = parseFlags(argv.slice(1), URL_TOKEN);
      rejectExtra(positionals, 0, USAGE);
      return { kind: "snapshot", opts: globalOptsFrom(values, env) };
    }
    case "watch": {
      const { positionals, values, bools } = parseFlags(argv.slice(1), { ...URL_TOKEN, bools: ["--json"] });
      rejectExtra(positionals, 0, USAGE);
      return { kind: "watch", opts: globalOptsFrom(values, env), json: bools.has("--json") };
    }
    // 20261002-sodactl-ask。引数は `--timeout` だけ（定義は標準入力）。対象は呼び出し元の pane に決まっているので、`--pane`・位置引数は取らない。
    case "ask": {
      const { positionals, values } = parseFlags(argv.slice(1), { values: ["--url", "--token", "--timeout"] });
      rejectExtra(positionals, 0, ASK_USAGE);
      const raw = values.get("--timeout");
      const timeoutMs = raw === undefined ? ASK_TIMEOUT_DEFAULT_MS : parseAskTimeout(raw);
      return { kind: "ask", opts: globalOptsFrom(values, env), timeoutMs };
    }
    case "workspace":
      return parseWorkspace(word1, rest0, env);
    case "tab":
      return parseTab(word1, rest0, env);
    case "pane":
      return parsePane(word1, rest0, env);
    case "agent":
      return parseAgent(word1, rest0, env);
    case "graph":
      return parseGraph(word1, rest0, env);
    default:
      throw new CliUsageError(`unknown command: ${word0}`, USAGE);
  }
}

function parseWorkspace(sub: string | undefined, rest: readonly string[], env: NodeJS.ProcessEnv): Command {
  const URL_TOKEN: FlagSpec = { values: ["--url", "--token"] };
  if (sub === "create") {
    const { positionals, values } = parseFlags(rest, { ...URL_TOKEN, values: [...URL_TOKEN.values!, "--cwd", "--label"] });
    rejectExtra(positionals, 0, USAGE);
    return { kind: "workspace-create", opts: globalOptsFrom(values, env), cwd: values.get("--cwd"), label: values.get("--label") };
  }
  if (sub === "close") {
    const { positionals, values } = parseFlags(rest, URL_TOKEN);
    const workspaceId = requirePositional(positionals, 0, "workspaceId", USAGE);
    rejectExtra(positionals, 1, USAGE);
    return { kind: "workspace-close", opts: globalOptsFrom(values, env), workspaceId };
  }
  if (sub === "rename") {
    const { positionals, values } = parseFlags(rest, URL_TOKEN);
    const workspaceId = requirePositional(positionals, 0, "workspaceId", USAGE);
    const label = requirePositional(positionals, 1, "label", USAGE);
    rejectExtra(positionals, 2, USAGE);
    return { kind: "workspace-rename", opts: globalOptsFrom(values, env), workspaceId, label };
  }
  if (sub === "report-metadata") {
    const { targetId, opts, report } = parseReportMetadata(rest, env, "workspaceId", "sodactl workspace report-metadata");
    return { kind: "workspace-report-metadata", opts, workspaceId: targetId, report };
  }
  throw new CliUsageError(`unknown subcommand: sodactl workspace ${sub ?? ""}`.trimEnd(), USAGE);
}

function parseTab(sub: string | undefined, rest: readonly string[], env: NodeJS.ProcessEnv): Command {
  const URL_TOKEN: FlagSpec = { values: ["--url", "--token"] };
  if (sub === "create") {
    const { positionals, values } = parseFlags(rest, { values: [...URL_TOKEN.values!, "--workspace", "--label"] });
    rejectExtra(positionals, 0, USAGE);
    return { kind: "tab-create", opts: globalOptsFrom(values, env), workspaceId: values.get("--workspace"), label: values.get("--label") };
  }
  if (sub === "close") {
    const { positionals, values } = parseFlags(rest, URL_TOKEN);
    const tabId = requirePositional(positionals, 0, "tabId", USAGE);
    rejectExtra(positionals, 1, USAGE);
    return { kind: "tab-close", opts: globalOptsFrom(values, env), tabId };
  }
  throw new CliUsageError(`unknown subcommand: sodactl tab ${sub ?? ""}`.trimEnd(), USAGE);
}

const PANE_SPLIT_USAGE = "sodactl pane split [<paneId>|--pane <paneId>|--current] --direction right|down [--ratio N]";
const PANE_CURRENT_USAGE = "sodactl pane current [--pane <paneId>|--current]";

/**
 * 対象の指定（位置引数・`--pane`・`--current`・省略）を `PaneTarget` にする（20260927-caller-pane-default の design「引数の解釈」の表）。
 * 2 つ以上は使い方の誤り（herdr は後に書いたものが勝つが、取り違えを防ぐ）。`--current` は `SODA_PANE_ID` が要る（herdr の `--current requires HERDR_PANE_ID`）。
 * 省略は、pane の中（`SODA_PANE_ID` が空でない）なら呼び出し元、外ならフォーカスの pane。
 */
function parsePaneTarget(
  positional: string | undefined,
  values: Map<string, string>,
  bools: Set<string>,
  env: NodeJS.ProcessEnv,
  usage: string,
): PaneTarget {
  const flagPane = values.get("--pane");
  const current = bools.has("--current");
  const given = [positional !== undefined, flagPane !== undefined, current].filter(Boolean).length;
  if (given > 1) throw new CliUsageError("use only one of <paneId>, --pane and --current", usage);
  if (positional !== undefined) return { kind: "id", paneId: positional };
  if (flagPane !== undefined) return { kind: "id", paneId: flagPane };
  const envPane = env["SODA_PANE_ID"];
  if (current) {
    if (!envPane) throw new CliUsageError("--current requires SODA_PANE_ID (run inside a soda pane)", usage);
    return { kind: "caller", paneId: envPane, explicit: true };
  }
  return envPane ? { kind: "caller", paneId: envPane, explicit: false } : { kind: "focused" };
}

function parsePane(sub: string | undefined, rest: readonly string[], env: NodeJS.ProcessEnv): Command {
  const URL_TOKEN: FlagSpec = { values: ["--url", "--token"] };
  if (sub === "split") {
    const { positionals, values, bools } = parseFlags(rest, { values: [...URL_TOKEN.values!, "--direction", "--ratio", "--pane"], bools: ["--current"] });
    rejectExtra(positionals, 1, PANE_SPLIT_USAGE);
    const target = parsePaneTarget(positionals[0], values, bools, env, PANE_SPLIT_USAGE);
    const direction = values.get("--direction");
    if (direction !== "right" && direction !== "down") {
      throw new CliUsageError("missing or invalid --direction (right|down)", PANE_SPLIT_USAGE);
    }
    const ratioRaw = values.get("--ratio");
    return { kind: "pane-split", opts: globalOptsFrom(values, env), target, direction, ratio: ratioRaw === undefined ? undefined : parseRatio(ratioRaw) };
  }
  if (sub === "current") {
    const { positionals, values, bools } = parseFlags(rest, { values: [...URL_TOKEN.values!, "--pane"], bools: ["--current"] });
    rejectExtra(positionals, 0, PANE_CURRENT_USAGE);
    return { kind: "pane-current", opts: globalOptsFrom(values, env), target: parsePaneTarget(undefined, values, bools, env, PANE_CURRENT_USAGE) };
  }
  if (sub === "close") {
    const { positionals, values } = parseFlags(rest, URL_TOKEN);
    const paneId = requirePositional(positionals, 0, "paneId", USAGE);
    rejectExtra(positionals, 1, USAGE);
    return { kind: "pane-close", opts: globalOptsFrom(values, env), paneId };
  }
  // `input`/`run` の第2位置引数（text/command）は自由文字列。**`--` で始まる文字列そのものを送りたい場合は
  // この単純なパーサでは未知のオプションとして拒否される**（`--` による位置引数との区切りは実装していない。
  // 既知の制約——taskcheck T3 の指摘で見つかった。値を丸ごと1つの引数として渡す限り〔シェルのクォート内〕は
  // 問題なく、実運用でまず困らない範囲と判断した）。
  if (sub === "input") {
    const { positionals, values } = parseFlags(rest, URL_TOKEN);
    const paneId = requirePositional(positionals, 0, "paneId", USAGE);
    const text = requirePositional(positionals, 1, "text", USAGE);
    rejectExtra(positionals, 2, USAGE);
    return { kind: "pane-input", opts: globalOptsFrom(values, env), paneId, text };
  }
  if (sub === "run") {
    const { positionals, values } = parseFlags(rest, URL_TOKEN);
    const paneId = requirePositional(positionals, 0, "paneId", USAGE);
    const command = requirePositional(positionals, 1, "command", USAGE);
    rejectExtra(positionals, 2, USAGE);
    return { kind: "pane-run", opts: globalOptsFrom(values, env), paneId, command };
  }
  if (sub === "read") {
    const { positionals, values, bools } = parseFlags(rest, { values: [...URL_TOKEN.values!, "--timeout"], bools: ["--follow", "--raw"] });
    const paneId = requirePositional(positionals, 0, "paneId", USAGE);
    rejectExtra(positionals, 1, USAGE);
    const timeoutRaw = values.get("--timeout");
    return {
      kind: "pane-read",
      opts: globalOptsFrom(values, env),
      paneId,
      follow: bools.has("--follow"),
      raw: bools.has("--raw"),
      timeoutMs: timeoutRaw === undefined ? DEFAULT_READ_TIMEOUT_MS : parsePositiveInt(timeoutRaw, "--timeout"),
    };
  }
  // 20260926-pane-direct-connect（herdr の terminal attach）。
  if (sub === "attach") {
    const { positionals, values, bools } = parseFlags(rest, { values: URL_TOKEN.values!, bools: ["--takeover"] });
    const paneId = requirePositional(positionals, 0, "paneId", USAGE);
    rejectExtra(positionals, 1, USAGE);
    return { kind: "pane-attach", opts: globalOptsFrom(values, env), paneId, takeover: bools.has("--takeover") };
  }
  // 20260926-pane-observe-control（herdr の terminal session observe/control）。observe は大きさを持たない（decisions D2）。
  if (sub === "observe") {
    const { positionals, values } = parseFlags(rest, URL_TOKEN);
    const paneId = requirePositional(positionals, 0, "paneId", USAGE);
    rejectExtra(positionals, 1, USAGE);
    return { kind: "pane-observe", opts: globalOptsFrom(values, env), paneId };
  }
  if (sub === "control") {
    const { positionals, values, bools } = parseFlags(rest, { values: [...URL_TOKEN.values!, "--cols", "--rows"], bools: ["--takeover"] });
    const paneId = requirePositional(positionals, 0, "paneId", USAGE);
    rejectExtra(positionals, 1, USAGE);
    const colsRaw = values.get("--cols");
    const rowsRaw = values.get("--rows");
    return {
      kind: "pane-control",
      opts: globalOptsFrom(values, env),
      paneId,
      takeover: bools.has("--takeover"),
      cols: colsRaw === undefined ? DEFAULT_CONTROL_SIZE.cols : parseStreamDimension(colsRaw, "--cols"),
      rows: rowsRaw === undefined ? DEFAULT_CONTROL_SIZE.rows : parseStreamDimension(rowsRaw, "--rows"),
    };
  }
  if (sub === "report-metadata") {
    const { targetId, opts, report } = parseReportMetadata(rest, env, "paneId", "sodactl pane report-metadata");
    return { kind: "pane-report-metadata", opts, paneId: targetId, report };
  }
  throw new CliUsageError(`unknown subcommand: sodactl pane ${sub ?? ""}`.trimEnd(), USAGE);
}

/** `report-metadata` の `--seq`・`--ttl-ms`（0 以上の安全な整数。範囲の検査〔ttl は 1〜86400000〕はサーバ。herdr の CLI も u64 として読むだけ）。 */
function parseNonNegativeInt(raw: string, flag: string, usage: string): number {
  const n = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n)) {
    throw new CliUsageError(`invalid value for ${flag}: ${raw}`, usage);
  }
  return n;
}

/**
 * `workspace|pane report-metadata <id> --source ID [--token NAME=VALUE]... [--clear-token NAME]... [--seq N] [--ttl-ms N]`（20260927-sidebar-row-tokens）。
 * **`--token` は値で見分ける**（decisions D5）: `=` を含めば独自トークンの `NAME=VALUE`（最初の `=` で分ける。herdr の `parse_token_assignment`）、含まなければ
 * 接続の token（全コマンド共通の `--token <TOKEN>`。接続の token は base64url で `=` を含まない）。接続の token が複数なら最後が勝つ。
 */
function parseReportMetadata(
  rest: readonly string[],
  env: NodeJS.ProcessEnv,
  idName: string,
  command: string,
): { targetId: string; opts: GlobalOpts; report: MetadataReportArgs } {
  const usage = `${command} <${idName}> --source <ID> [--token <NAME=VALUE>]... [--clear-token <NAME>]... [--seq <N>] [--ttl-ms <N>]`;
  const { positionals, values, sequence } = parseFlags(rest, { values: ["--url", "--source", "--seq", "--ttl-ms"], multi: ["--token", "--clear-token"] });
  const targetId = requirePositional(positionals, 0, idName, usage);
  rejectExtra(positionals, 1, usage);
  const tokens: MetadataReportArgs["tokens"] = [];
  let authToken: string | undefined;
  for (const [flag, value] of sequence) {
    if (flag === "--clear-token") {
      tokens.push({ name: value, value: null });
      continue;
    }
    const eq = value.indexOf("=");
    if (eq < 0) {
      authToken = value;
      continue;
    }
    if (eq === 0) throw new CliUsageError("token name must not be empty", usage);
    tokens.push({ name: value.slice(0, eq), value: value.slice(eq + 1) });
  }
  const source = values.get("--source");
  if (source === undefined || source.trim() === "") throw new CliUsageError("missing required --source", usage);
  if (tokens.length === 0) throw new CliUsageError("missing token to set or clear", usage);
  const report: MetadataReportArgs = { source, tokens };
  const seq = values.get("--seq");
  if (seq !== undefined) report.seq = parseNonNegativeInt(seq, "--seq", usage);
  const ttl = values.get("--ttl-ms");
  if (ttl !== undefined) report.ttlMs = parseNonNegativeInt(ttl, "--ttl-ms", usage);
  const opts = globalOptsFrom(values, env);
  if (authToken !== undefined) opts.token = authToken;
  return { targetId, opts, report };
}

/** `pane control` の `--cols/--rows`（1〜1000。decisions D6）。 */
function parseStreamDimension(raw: string, flag: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_STREAM_DIMENSION) {
    throw new CliUsageError(`invalid value for ${flag}: ${raw}`, `${flag} は 1〜${MAX_STREAM_DIMENSION} の整数にしてください。`);
  }
  return n;
}

const ASK_USAGE = "sodactl ask [--timeout <ms>] < spec.json";

function parseAskTimeout(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < ASK_TIMEOUT_MIN_MS || n > ASK_TIMEOUT_MAX_MS) {
    throw new CliUsageError(`invalid value for --timeout: ${raw}`, `--timeout は ${ASK_TIMEOUT_MIN_MS}〜${ASK_TIMEOUT_MAX_MS}（ミリ秒）の整数にしてください。省略すると ${ASK_TIMEOUT_DEFAULT_MS}。`);
  }
  return n;
}

/** Node のタイマーの上限（2^31-1ms）。超えると 1ms に丸められて即座に時間切れになる。 */
const MAX_TIMER_MS = 2_147_483_647;

function parseTimerMs(raw: string): number {
  const n = parsePositiveInt(raw, "--timeout");
  if (n > MAX_TIMER_MS) {
    throw new CliUsageError(`invalid value for --timeout: ${raw}`, `--timeout は ${MAX_TIMER_MS} 以下にしてください（省略すると無期限）。`);
  }
  return n;
}

function parseAgentStatus(raw: string): AgentStatus {
  const found = AGENT_STATUSES.find((s) => s === raw);
  if (found === undefined) {
    throw new CliUsageError(`invalid value for --until: ${raw}`, `--until には ${AGENT_STATUSES.join("|")} のどれかを指定してください。`);
  }
  return found;
}

function parseAgent(sub: string | undefined, rest: readonly string[], env: NodeJS.ProcessEnv): Command {
  const URL_TOKEN: FlagSpec = { values: ["--url", "--token"] };
  if (sub === "list") {
    const { positionals, values } = parseFlags(rest, URL_TOKEN);
    rejectExtra(positionals, 0, USAGE);
    return { kind: "agent-list", opts: globalOptsFrom(values, env) };
  }
  if (sub === "get") {
    const { positionals, values } = parseFlags(rest, URL_TOKEN);
    const paneId = requirePositional(positionals, 0, "target", USAGE);
    rejectExtra(positionals, 1, USAGE);
    return { kind: "agent-get", opts: globalOptsFrom(values, env), paneId };
  }
  if (sub === "wait") {
    const { positionals, values, multi } = parseFlags(rest, { values: [...URL_TOKEN.values!, "--timeout"], multi: ["--until"] });
    const paneId = requirePositional(positionals, 0, "target", USAGE);
    rejectExtra(positionals, 1, USAGE);
    const timeoutRaw = values.get("--timeout");
    return {
      kind: "agent-wait",
      opts: globalOptsFrom(values, env),
      paneId,
      until: (multi.get("--until") ?? []).map(parseAgentStatus),
      timeoutMs: timeoutRaw === undefined ? undefined : parseTimerMs(timeoutRaw),
    };
  }
  if (sub === "read") {
    const { positionals, values, bools } = parseFlags(rest, { values: [...URL_TOKEN.values!, "--lines", "--timeout"], bools: ["--raw"] });
    const paneId = requirePositional(positionals, 0, "target", USAGE);
    rejectExtra(positionals, 1, USAGE);
    const linesRaw = values.get("--lines");
    const timeoutRaw = values.get("--timeout");
    return {
      kind: "agent-read",
      opts: globalOptsFrom(values, env),
      paneId,
      lines: linesRaw === undefined ? DEFAULT_AGENT_READ_LINES : parsePositiveInt(linesRaw, "--lines"),
      raw: bools.has("--raw"),
      timeoutMs: timeoutRaw === undefined ? DEFAULT_READ_TIMEOUT_MS : parsePositiveInt(timeoutRaw, "--timeout"),
    };
  }
  // 20260926-agent-prompt-send-keys。`<text>` が `--` で始まると未知のオプションとして拒否される（`pane input` と同じ既知の制約）。
  if (sub === "prompt") {
    const { positionals, values, bools, multi } = parseFlags(rest, {
      values: [...URL_TOKEN.values!, "--timeout"],
      bools: ["--wait"],
      multi: ["--until"],
    });
    const paneId = requirePositional(positionals, 0, "target", USAGE);
    const text = requirePositional(positionals, 1, "text", USAGE);
    rejectExtra(positionals, 2, USAGE);
    const wait = bools.has("--wait");
    const timeoutRaw = values.get("--timeout");
    const untilRaw = multi.get("--until") ?? [];
    // herdr と同じく、--until・--timeout は --wait と一緒のときだけ（clap の `requires("wait")`）。
    if (!wait && (timeoutRaw !== undefined || untilRaw.length > 0)) {
      throw new CliUsageError("--until and --timeout require --wait", "--until・--timeout は --wait と一緒に指定してください。");
    }
    return {
      kind: "agent-prompt",
      opts: globalOptsFrom(values, env),
      paneId,
      text,
      wait,
      until: untilRaw.map(parseAgentStatus),
      timeoutMs: timeoutRaw === undefined ? undefined : parseTimerMs(timeoutRaw),
    };
  }
  if (sub === "send-keys") {
    const { positionals, values } = parseFlags(rest, URL_TOKEN);
    const paneId = requirePositional(positionals, 0, "target", USAGE);
    const keys = positionals.slice(1);
    if (keys.length === 0) throw new CliUsageError("missing key", USAGE);
    return { kind: "agent-send-keys", opts: globalOptsFrom(values, env), paneId, keys };
  }
  // 20260926-agent-start-rename。`<target> <name>` か `<target> --clear` のどちらか（herdr の `agent rename <target> <name>|--clear`）。
  if (sub === "rename") {
    const { positionals, values, bools } = parseFlags(rest, { values: URL_TOKEN.values!, bools: ["--clear"] });
    const paneId = requirePositional(positionals, 0, "target", USAGE);
    const clear = bools.has("--clear");
    if (clear) {
      rejectExtra(positionals, 1, USAGE);
      return { kind: "agent-rename", opts: globalOptsFrom(values, env), paneId, name: null };
    }
    const name = requirePositional(positionals, 1, "name (or --clear)", USAGE);
    rejectExtra(positionals, 2, USAGE);
    return { kind: "agent-rename", opts: globalOptsFrom(values, env), paneId, name };
  }
  if (sub === "start") return parseAgentStart(rest, env);
  throw new CliUsageError(`unknown subcommand: sodactl agent ${sub ?? ""}`.trimEnd(), USAGE);
}

const AGENT_START_USAGE =
  "sodactl agent start <name> --kind <KIND> --pane <paneId> [--timeout <ms>] [--url <URL>] [--token <TOKEN>] [-- <args>...]";

/** 20260926-agent-start（herdr の `agent start`）。最初の `--` より後はすべてエージェントへの引数で、オプションとして読まない。 */
function parseAgentStart(rest: readonly string[], env: NodeJS.ProcessEnv): Command {
  const separator = rest.indexOf("--");
  const head = separator === -1 ? rest : rest.slice(0, separator);
  const args = separator === -1 ? [] : rest.slice(separator + 1);
  const { positionals, values } = parseFlags(head, { values: ["--url", "--token", "--kind", "--pane", "--timeout"] });
  const name = requirePositional(positionals, 0, "name", AGENT_START_USAGE);
  rejectExtra(positionals, 1, AGENT_START_USAGE);
  const agentKind = values.get("--kind");
  if (agentKind === undefined) throw new CliUsageError("missing required --kind", AGENT_START_USAGE);
  if (!AGENT_START_KINDS.includes(agentKind)) {
    throw new CliUsageError(`unsupported interactive agent kind: ${agentKind}`, `--kind には ${AGENT_START_KINDS.join("|")} のどれかを指定してください。`);
  }
  const paneId = values.get("--pane");
  if (paneId === undefined) throw new CliUsageError("missing required --pane", AGENT_START_USAGE);
  const timeoutRaw = values.get("--timeout");
  if (timeoutRaw !== undefined && !/^[0-9]+$/.test(timeoutRaw)) {
    throw new CliUsageError(`invalid value for --timeout: ${timeoutRaw}`, "--timeout には整数（ms）を指定してください。");
  }
  return {
    kind: "agent-start",
    opts: globalOptsFrom(values, env),
    name,
    agentKind,
    paneId,
    timeoutMs: timeoutRaw === undefined ? undefined : Number(timeoutRaw),
    args,
  };
}

const GRAPH_USAGE = USAGE_LINES.filter((l) => l.startsWith("sodactl graph ")).join("\n");
const LINK_ID_RE = /^l[1-9][0-9]*$/;
/** 線の設定のフラグ（`link add`・`link set` で共通）。 */
const LINK_CONFIG_VALUES = ["--on", "--prompt", "--output", "--when-busy", "--mode", "--lines", "--limit"] as const;
/** トリガの線だけの項目・承認の代理の線だけの項目（`--limit` はどの線にも使える）。 */
export const TRIGGER_ONLY_FLAGS = ["--on", "--prompt", "--output", "--no-output", "--when-busy"] as const;
export const APPROVAL_ONLY_FLAGS = ["--mode", "--lines"] as const;

function parseIntRange(raw: string, flag: string, min: number, max: number): number {
  const n = Number(raw);
  if (!/^[0-9]+$/.test(raw) || !Number.isInteger(n) || n < min || n > max) {
    throw new CliUsageError(`invalid value for ${flag}: ${raw}`, `${flag} には ${min}〜${max} の整数を指定してください。`);
  }
  return n;
}

function parseChoice<T extends string>(raw: string, flag: string, choices: readonly T[]): T {
  const found = choices.find((c) => c === raw);
  if (found === undefined) throw new CliUsageError(`invalid value for ${flag}: ${raw}`, `${flag} には ${choices.join("|")} のどれかを指定してください。`);
  return found;
}

function parseLinkId(raw: string): string {
  if (!LINK_ID_RE.test(raw)) throw new CliUsageError(`invalid link id: ${raw}`, "線の id は l1・l2… の形です（sodactl graph show で見られます）。");
  return raw;
}

/** 線の設定のフラグを読む。書かれたフラグの名前（種類との食い違いの検査に使う）も返す。 */
function parseLinkConfig(values: Map<string, string>, bools: Set<string>): { config: GraphLinkConfigArgs; given: string[] } {
  const config: GraphLinkConfigArgs = {};
  const given = [...LINK_CONFIG_VALUES.filter((f) => values.has(f)), ...(bools.has("--no-output") ? ["--no-output"] : [])];
  const on = values.get("--on");
  if (on !== undefined) config.on = parseChoice(on, "--on", ["done", "blocked"] as const);
  const prompt = values.get("--prompt");
  if (prompt !== undefined) config.prompt = prompt;
  const output = values.get("--output");
  if (output !== undefined && bools.has("--no-output")) throw new CliUsageError("use only one of --output and --no-output", GRAPH_USAGE);
  if (output !== undefined) config.output = parseIntRange(output, "--output", LINK_LINES_MIN, LINK_LINES_MAX);
  if (bools.has("--no-output")) config.output = null;
  const whenBusy = values.get("--when-busy");
  if (whenBusy !== undefined) config.whenBusy = parseChoice(whenBusy, "--when-busy", ["wait", "skip"] as const);
  const mode = values.get("--mode");
  if (mode !== undefined) config.mode = parseChoice(mode, "--mode", ["notify", "delegate"] as const);
  const lines = values.get("--lines");
  if (lines !== undefined) config.lines = parseIntRange(lines, "--lines", LINK_LINES_MIN, LINK_LINES_MAX);
  const limit = values.get("--limit");
  if (limit !== undefined) config.limit = parseIntRange(limit, "--limit", LINK_LIMIT_MIN, LINK_LIMIT_MAX);
  return { config, given };
}

/** 線の種類に使えない設定のフラグを断る（`link set` は線の種類を知った実行時に同じ関数で見る）。 */
export function assertLinkConfigFits(kind: LinkKind, given: readonly string[]): void {
  const wrong = given.filter(
    (f) =>
      (kind !== "trigger" && (TRIGGER_ONLY_FLAGS as readonly string[]).includes(f)) ||
      (kind !== "approval" && (APPROVAL_ONLY_FLAGS as readonly string[]).includes(f)),
  );
  if (wrong.length > 0) {
    throw new CliUsageError(
      `${wrong.join(", ")} cannot be used with a ${kind} link`,
      "トリガの線: --on・--prompt・--output・--no-output・--when-busy。承認の代理の線: --mode・--lines。--limit はどの線にも使えます。",
    );
  }
}

/** `link set` の設定のフラグのうち書かれたもの（`GraphLinkConfigArgs` から戻す。実行時の種類の検査用）。 */
export function givenLinkConfigFlags(config: GraphLinkConfigArgs): string[] {
  const out: string[] = [];
  if (config.on !== undefined) out.push("--on");
  if (config.prompt !== undefined) out.push("--prompt");
  if (config.output !== undefined) out.push(config.output === null ? "--no-output" : "--output");
  if (config.whenBusy !== undefined) out.push("--when-busy");
  if (config.mode !== undefined) out.push("--mode");
  if (config.lines !== undefined) out.push("--lines");
  if (config.limit !== undefined) out.push("--limit");
  return out;
}

/**
 * `sodactl graph …`（20260927-agent-graph の 05。AC15）。`link` と `node` は 3 語のコマンド。どのコマンドも `--json`（表の代わりに JSON）を取る。
 */
function parseGraph(sub: string | undefined, rest: readonly string[], env: NodeJS.ProcessEnv): Command {
  const BASE: FlagSpec = { values: ["--url", "--token"], bools: ["--json"] };
  const done = (parsed: ParsedFlags, action: GraphAction): Command => ({
    kind: "graph",
    opts: globalOptsFrom(parsed.values, env),
    json: parsed.bools.has("--json"),
    action,
  });
  if (sub === "show" || sub === "pause" || sub === "resume") {
    const parsed = parseFlags(rest, BASE);
    rejectExtra(parsed.positionals, 0, GRAPH_USAGE);
    return done(parsed, { kind: sub });
  }
  if (sub === "history") {
    const parsed = parseFlags(rest, { ...BASE, values: [...BASE.values!, "--limit"] });
    rejectExtra(parsed.positionals, 1, GRAPH_USAGE);
    const linkId = parsed.positionals[0];
    const limit = parsed.values.get("--limit");
    return done(parsed, {
      kind: "history",
      linkId: linkId === undefined ? undefined : parseLinkId(linkId),
      limit: limit === undefined ? undefined : parseIntRange(limit, "--limit", 1, GRAPH_HISTORY_PER_LINK * GRAPH_LINKS_MAX),
    });
  }
  if (sub === "link") return parseGraphLink(rest[0], rest.slice(1), BASE, done);
  if (sub === "node") return parseGraphNode(rest[0], rest.slice(1), BASE, done);
  throw new CliUsageError(`unknown subcommand: sodactl graph ${sub ?? ""}`.trimEnd(), GRAPH_USAGE);
}

type GraphDone = (parsed: ParsedFlags, action: GraphAction) => Command;

function parseGraphLink(sub: string | undefined, rest: readonly string[], base: FlagSpec, done: GraphDone): Command {
  const configSpec: FlagSpec = {
    values: [...base.values!, ...LINK_CONFIG_VALUES],
    bools: [...base.bools!, "--no-output"],
    inline: ["--prompt"],
  };
  if (sub === "add") {
    const parsed = parseFlags(rest, { ...configSpec, values: [...configSpec.values!, "--kind"] });
    const from = requirePositional(parsed.positionals, 0, "from", GRAPH_USAGE);
    const to = requirePositional(parsed.positionals, 1, "to", GRAPH_USAGE);
    rejectExtra(parsed.positionals, 2, GRAPH_USAGE);
    const kindRaw = parsed.values.get("--kind");
    const linkKind = kindRaw === undefined ? "trigger" : parseChoice(kindRaw, "--kind", ["trigger", "supervise", "approval"] as const);
    const { config, given } = parseLinkConfig(parsed.values, parsed.bools);
    assertLinkConfigFits(linkKind, given);
    return done(parsed, { kind: "link-add", from, to, linkKind, config });
  }
  if (sub === "set") {
    const parsed = parseFlags(rest, configSpec);
    const linkId = parseLinkId(requirePositional(parsed.positionals, 0, "linkId", GRAPH_USAGE));
    rejectExtra(parsed.positionals, 1, GRAPH_USAGE);
    const { config, given } = parseLinkConfig(parsed.values, parsed.bools);
    if (given.length === 0) throw new CliUsageError("nothing to change (give at least one of --on, --prompt, --output, --no-output, --when-busy, --mode, --lines, --limit)", GRAPH_USAGE);
    return done(parsed, { kind: "link-set", linkId, config });
  }
  if (sub === "rm" || sub === "pause" || sub === "resume") {
    const parsed = parseFlags(rest, base);
    const linkId = parseLinkId(requirePositional(parsed.positionals, 0, "linkId", GRAPH_USAGE));
    rejectExtra(parsed.positionals, 1, GRAPH_USAGE);
    return done(parsed, { kind: `link-${sub}`, linkId });
  }
  throw new CliUsageError(`unknown subcommand: sodactl graph link ${sub ?? ""}`.trimEnd(), GRAPH_USAGE);
}

function parseGraphNode(sub: string | undefined, rest: readonly string[], base: FlagSpec, done: GraphDone): Command {
  const parsed = parseFlags(rest, base);
  if (sub === "add") {
    requirePositional(parsed.positionals, 0, "pane", GRAPH_USAGE);
    return done(parsed, { kind: "node-add", panes: parsed.positionals });
  }
  if (sub === "rm") {
    const pane = requirePositional(parsed.positionals, 0, "pane", GRAPH_USAGE);
    rejectExtra(parsed.positionals, 1, GRAPH_USAGE);
    return done(parsed, { kind: "node-rm", pane });
  }
  if (sub === "rekey") {
    const pane = requirePositional(parsed.positionals, 0, "pane", GRAPH_USAGE);
    const newPane = requirePositional(parsed.positionals, 1, "newPane", GRAPH_USAGE);
    rejectExtra(parsed.positionals, 2, GRAPH_USAGE);
    return done(parsed, { kind: "node-rekey", pane, newPane });
  }
  throw new CliUsageError(`unknown subcommand: sodactl graph node ${sub ?? ""}`.trimEnd(), GRAPH_USAGE);
}

function parseMachinePrefixed(argv: readonly string[], env: NodeJS.ProcessEnv): Command {
  const selector = argv[1];
  if (selector === undefined || selector.startsWith("--")) {
    throw new CliUsageError("missing value for --machine", `${MACHINE_USAGE_LINE}\n（-- で始まる名前のマシンは id で指定してください。id は soda machine list）`);
  }
  if (selector.length === 0 || selector.length > MAX_MACHINE_SELECTOR_LENGTH) {
    throw new CliUsageError(`invalid value for --machine (1-${MAX_MACHINE_SELECTOR_LENGTH} characters)`, MACHINE_USAGE_LINE);
  }
  const rest = argv.slice(2);
  const sub = rest[0];
  if (sub === undefined || sub === "help" || sub === "--help" || sub === "-h" || sub === "skill" || sub === "login" || sub === "--machine") {
    throw new CliUsageError(`--machine cannot be used with ${sub === undefined ? "no command" : sub}`, MACHINE_USAGE_LINE);
  }
  // 別のマシンへの --current は、pane の外でも「--machine とは使えない」を理由にする（内側の解釈の「SODA_PANE_ID が要る」は誤誘導になる。
  // --current を受けるのは pane のコマンドだけで、`agent start` の `--` の後のようにエージェントへの引数としては現れない）。
  if (selector !== "local" && sub === "pane" && rest.includes("--current")) {
    throw new CliUsageError("--current cannot be used with --machine (the calling pane belongs to this machine)", MACHINE_USAGE_LINE);
  }
  const cmd = parseCommand(rest, env);
  if (!("opts" in cmd)) throw new CliUsageError(`--machine cannot be used with ${sub}`, MACHINE_USAGE_LINE);
  // `ask` の対象は呼び出し元の pane（手元の SODA_PANE_ID）で、別のマシンの pane ではない。
  if (cmd.kind === "ask" && selector !== "local")
    throw new CliUsageError("--machine cannot be used with ask (the question is shown for the calling pane of this machine)", MACHINE_USAGE_LINE);
  // `local` は手元のサーバそのもの（サーバは `?machine=local` を行き先なしと同じに扱う）——自分の pane の歯止めを外さない。
  if (selector === "local") return cmd;
  const { caller: _caller, ...opts } = cmd.opts;
  void _caller;
  // 呼び出し元の pane（手元の SODA_PANE_ID）はそのマシンの pane を指さない（herdr の `caller_pane_id` が --machine では None。20260927-caller-pane-default）。
  // --current は誤り、対象の省略はそのマシンのフォーカスの pane。
  if ("target" in cmd && cmd.target.kind === "caller") {
    // 上の `rest.includes("--current")` で先に断るので通常は届かない（explicit は --current からしか作られない）。解釈の順が変わったときの防御。
    if (cmd.target.explicit) {
      throw new CliUsageError("--current cannot be used with --machine (the calling pane belongs to this machine)", MACHINE_USAGE_LINE);
    }
    return { ...cmd, target: { kind: "focused" }, opts: { ...opts, machine: selector } } as Command;
  }
  return { ...cmd, opts: { ...opts, machine: selector } } as Command;
}
