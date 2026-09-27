import { mkdir, readFile, stat, truncate } from "node:fs/promises";
import { hostname as osHostname } from "node:os";
import { join, resolve } from "node:path";
import { resolveServeOptions, type RawServeArgs } from "../config.js";
import { readLocalAuth } from "../auth/LocalLogin.js";
import { serveRecordMatches } from "../persist/namedSession.js";
import { readServeRecord } from "../persist/ServeRecordFile.js";
import { StateDirLock } from "../persist/StateDirLock.js";
import { paneServerUrl } from "../util/net.js";
import { openWs, postJson, type LocalEndpoint } from "./localHttp.js";
import {
  SERVE_OUT_FILE_NAME,
  spawnServe,
  type SpawnedServe,
  type SpawnServeRequest,
} from "./spawnDetached.js";
import type { TuiTarget } from "./tuiTarget.js";

/**
 * 引数なしの `soda`（20260927-cli-mode の design「findOrStart」・architecture「起動」）。手元の `soda serve` を見つけ、無ければ裏で起動し、繋げるようになるまで
 * 待って、端末版へ渡す `TuiTarget` を組み立てる。
 *
 * 1. `--session`・`--state-dir`・`SODA_SESSION` は `soda serve` と同じ規則で解く（`resolveServeOptions`）。
 * 2. 入れ子（`SODA_PANE_ID` がある＝soda の pane の中）は、`--allow-nested` が無ければ断る（herdr の `HERDR_ENV` と同じ）。
 * 3. ロックの持ち主と `serve.json` の一致を見る（`serveRecordMatches`）。持ち主が別のホストなら断る。
 * 4. 持ち主が居なければ `soda serve` を裏で起動する（`spawnDetached.ts`）。子が「使用中」で終わった（同時に起動した別の `soda` がロックを取った）なら 3. からやり直す（最大 3 回）。
 * 5. 準備完了を待つ: `local-auth.json` の pid が持ち主と一致し、`/api/local-login` が通り、`/ws` が 503 でなくなるまで、50ms 間隔で最大 15 秒。
 * 起動した場合は `serve.out` から初回の token（と失敗の理由）を読み、token を含むのでファイルを空にする。
 */

/** 断るとき（終了コード 1）。`hint` は日本語の案内。 */
export class LaunchError extends Error {
  readonly exitCode = 1;
  constructor(
    message: string,
    readonly hint: string,
  ) {
    super(message);
    this.name = "LaunchError";
  }
}

export interface FindOrStartOptions {
  /** `--session`・`--state-dir`（`cliArgs.ts` の `serve`。`SODA_SESSION` は `applySessionEnv` が入れ済み）。 */
  serve: RawServeArgs;
  allowNested: boolean;
  env: NodeJS.ProcessEnv;
  cwd: string;
  platform: NodeJS.Platform;
  /** 子の `soda serve` の起動に使う Node・その引数・入口（`process.execPath`・`process.execArgv`・`process.argv[1]`。handoff の execve と同じ組）。 */
  execPath: string;
  execArgv: readonly string[];
  mainPath: string;
}

export interface FindOrStartDeps {
  spawnServe?: (req: SpawnServeRequest) => Promise<SpawnedServe>;
  hostname?: string;
  intervalMs?: number;
  timeoutMs?: number;
  /** 子が「使用中」で終わったときのやり直しを含めた、起動の試みの上限（既定 3）。 */
  maxStartAttempts?: number;
}

/** 入れ子の目印（pane の環境。`session/paneEnv.ts`）。 */
export const NESTED_ENV_VAR = "SODA_PANE_ID";

type Ready =
  | { kind: "ready"; endpoint: LocalEndpoint; cookie: string }
  | { kind: "child-exited" }
  | { kind: "gone" }
  | { kind: "timeout" };

export async function findOrStart(
  opts: FindOrStartOptions,
  deps: FindOrStartDeps = {},
): Promise<TuiTarget> {
  if (!opts.allowNested && (opts.env[NESTED_ENV_VAR] ?? "") !== "") {
    throw new LaunchError(
      "refusing to open soda inside a soda pane",
      "この端末は soda の pane の中です（SODA_PANE_ID）。入れ子にすると同じ画面を二重に開くことになります。それでも開くなら --allow-nested を付けてください。",
    );
  }
  const options = resolveServeOptions(opts.serve, opts.env, opts.platform);
  const stateDir = options.stateDir;
  const outPath = join(stateDir, SERVE_OUT_FILE_NAME);
  const host = deps.hostname ?? osHostname();
  const maxAttempts = deps.maxStartAttempts ?? 3;
  const spawn = deps.spawnServe ?? ((req: SpawnServeRequest) => spawnServe(req));
  let started: SpawnedServe | undefined;
  let stopHint: string | undefined;
  let attempts = 0;
  /** 同時起動のやり直しの前に `serve.out` で見た token の行（勝った側の子の出力。捨てずに最後に見せる）。 */
  let carriedNotice = "";

  for (;;) {
    const holder = await new StateDirLock(stateDir).inspect();
    if (holder?.otherHost !== undefined) {
      throw new LaunchError(
        `the state dir ${stateDir} is in use by soda on another host (${holder.otherHost}, pid ${holder.pid})`,
        "別のホスト（または別のコンテナ）の soda がこの状態ディレクトリを使っています。--state-dir に別のディレクトリを指定するか、--session <名前> で別の session にしてください。",
      );
    }
    if (holder === undefined && started === undefined) {
      attempts++;
      if (attempts > maxAttempts) {
        throw new LaunchError(
          "could not start soda serve",
          `${maxAttempts} 回起動を試みましたが、サーバが動き続けませんでした。${join(stateDir, "server.log")} を確かめてください。`,
        );
      }
      await mkdir(stateDir, { recursive: true });
      started = await spawn({
        execPath: opts.execPath,
        args: [
          ...opts.execArgv,
          opts.mainPath,
          "serve",
          "--state-dir",
          resolve(opts.cwd, options.sessionRoot),
          ...(options.sessionName !== undefined ? ["--session", options.sessionName] : []),
        ],
        cwd: opts.cwd,
        env: opts.env,
        outPath,
        platform: opts.platform,
      });
      stopHint = started.notice;
    }
    const ready = await waitReady(stateDir, host, started, deps);
    if (ready.kind === "gone") continue; // 見ていたサーバが止まった。もう一度探す（無ければ起動する）
    if (ready.kind === "child-exited") {
      // 同時に起動した別の `soda` がロックを取った（こちらの子は使用中で終わった）なら、そのサーバへ繋ぎ直す（試行の回数を問わない——起動はしないので）。
      // `serve.out` は 2 つの子が共有する。勝った側の子の初回の token の行もここにあるので、**読むだけで空にしない**（勝った側の `soda` が読む前に消さない）。
      // 読めた token の行は持ち越して、繋げたときに見せる（どちらかの `soda` で必ず一度は見える）。
      const other = await new StateDirLock(stateDir).inspect();
      if (other !== undefined) {
        started = undefined;
        carriedNotice = tokenNotice(await readServeOut(outPath)) ?? carriedNotice;
        continue;
      }
      const out = (await takeServeOut(outPath)).trim();
      throw new LaunchError(
        "soda serve exited before it became ready",
        out !== ""
          ? out
          : `サーバの出力はありませんでした。${join(stateDir, "server.log")} を確かめてください。`,
      );
    }
    if (ready.kind === "timeout") {
      // 末尾を見せるが、token の行は伏せる（エラーの案内に秘密を混ぜない）。token そのものは下の知らせとして一度だけ見せ、ファイルは空にする
      // （サーバは止めないので、token はこの後どこにも出ない——ここで見せなければ失われる）。
      const out = await takeServeOut(outPath);
      const tail = redactTokens(out).trim().split(/\r?\n/).slice(-20).join("\n");
      const notice = tokenNotice(`${carriedNotice}\n${out}`);
      throw new LaunchError(
        `soda serve did not become ready within ${Math.round((deps.timeoutMs ?? 15_000) / 1000)} seconds`,
        [
          tail !== "" ? `サーバの出力（末尾）:\n${tail}\n` : "",
          notice !== undefined ? `${notice}\n` : "",
          `サーバは止めていません。${join(stateDir, "server.log")} を確かめ、少し待ってからもう一度 soda を実行してください。`,
        ].join(""),
      );
    }
    const startupNotice =
      started !== undefined || carriedNotice !== ""
        ? tokenNotice(`${carriedNotice}\n${await takeServeOut(outPath)}`)
        : undefined;
    let cached: string | undefined = ready.cookie;
    const endpoint = ready.endpoint;
    return {
      baseUrl: endpoint.baseUrl,
      origin: endpoint.origin,
      ...(endpoint.certSha256 !== undefined ? { certSha256: endpoint.certSha256 } : {}),
      stateDir,
      ...(options.sessionName !== undefined ? { session: options.sessionName } : {}),
      ...(startupNotice !== undefined ? { startupNotice } : {}),
      ...(stopHint !== undefined ? { stopHint } : {}),
      // 最初の 1 回は準備完了の確かめで得た cookie を使う（セッションを余分に作らない）。以後（4401 の再ログイン）は秘密を読み直してログインし、
      // 断られたら秘密をもう一度読み直して 1 回だけやり直す（design「エラー処理」）。
      login: async (): Promise<string> => {
        if (cached !== undefined) {
          const c = cached;
          cached = undefined;
          return c;
        }
        for (let i = 0; i < 2; i++) {
          const auth = await readLocalAuth(stateDir);
          if (auth === undefined) continue;
          const res = await postJson(endpoint, "/api/local-login", { secret: auth.secret });
          if (res.status === 204 && res.cookie !== undefined) return res.cookie;
        }
        throw new Error("local login was refused (the server may have stopped)");
      },
    };
  }
}

/** 準備完了を待つ（上の 5.）。 */
async function waitReady(
  stateDir: string,
  host: string,
  started: SpawnedServe | undefined,
  deps: FindOrStartDeps,
): Promise<Ready> {
  const interval = deps.intervalMs ?? 50;
  const deadline = Date.now() + (deps.timeoutMs ?? 15_000);
  let login: { secret: string; cookie: string } | undefined;
  /** ローカルログインが断られた回数（401・403）。1 回目は `local-auth.json` を読み直してすぐやり直し、2 回目で諦める（回数の制限に掛けない）。 */
  let refusals = 0;
  for (;;) {
    if (started?.hasExited() === true) return { kind: "child-exited" };
    const holder = await new StateDirLock(stateDir).inspect();
    if (holder === undefined) {
      if (started === undefined) return { kind: "gone" };
    } else {
      const record = await readServeRecord(stateDir);
      const auth = await readLocalAuth(stateDir);
      if (
        serveRecordMatches(record, holder.pid, host) &&
        auth !== undefined &&
        auth.pid === holder.pid
      ) {
        const baseUrl = paneServerUrl(record.https ? "https" : "http", record.host, record.port);
        if (baseUrl === undefined) {
          throw new LaunchError(
            `cannot build a URL for the server (host ${record.host})`,
            "--host にゾーン付きの IPv6 等を指定したサーバには、引数なしの soda では繋げません。",
          );
        }
        const endpoint: LocalEndpoint = {
          baseUrl,
          origin: baseUrl,
          ...(record.certSha256 !== undefined ? { certSha256: record.certSha256 } : {}),
        };
        if (record.https && record.certSha256 === undefined) {
          throw new LaunchError(
            "the server uses TLS but serve.json has no certificate fingerprint",
            "古い版の soda serve が動いています。止めてから（soda session stop 等）もう一度 soda を実行してください。",
          );
        }
        try {
          if (login === undefined || login.secret !== auth.secret) {
            const res = await postJson(endpoint, "/api/local-login", { secret: auth.secret });
            if (res.status === 429) {
              throw new LaunchError(
                "local login is rate limited",
                "ログインの失敗が続いたため、サーバが一時的に受け付けていません。1 分ほど待ってからやり直してください。",
              );
            }
            if (res.status === 204 && res.cookie !== undefined)
              login = { secret: auth.secret, cookie: res.cookie };
            else if (res.status === 401 || res.status === 403) {
              refusals++;
              if (refusals >= 2) {
                throw new LaunchError(
                  `local login was refused (HTTP ${res.status})`,
                  res.status === 403
                    ? "サーバがこの接続を同じマシンからのものと認めませんでした（中継・ポート転送の先のサーバには、引数なしの soda では繋げません）。"
                    : "local-auth.json の秘密をサーバが受け付けませんでした。サーバが作り直している途中かもしれません。少し待ってからもう一度 soda を実行してください。",
                );
              }
              continue; // 秘密を読み直して（ループの先頭で）すぐ 1 回だけやり直す
            }
          }
          if (login !== undefined) {
            const probe = await openWs(endpoint, login.cookie);
            if (probe.kind === "open") {
              probe.ws.close();
              return { kind: "ready", endpoint, cookie: login.cookie };
            }
            if (probe.kind === "status" && probe.status === 401) login = undefined; // cookie が効かない（作り直された等）。ログインからやり直す
            if (probe.kind === "error") rethrowIfCertMismatch(probe.error);
          }
        } catch (err) {
          if (err instanceof LaunchError) throw err;
          rethrowIfCertMismatch(err);
          // 繋がらない（まだ待ち受けていない・止まる途中）は待って見直す。
        }
      }
    }
    if (Date.now() >= deadline) return { kind: "timeout" };
    await new Promise((r) => setTimeout(r, interval));
  }
}

function rethrowIfCertMismatch(err: unknown): void {
  if (err instanceof Error && err.message.includes("does not match serve.json")) {
    throw new LaunchError(
      err.message,
      "サーバの証明書が serve.json の指紋と違うため、繋ぎません（別のサーバが同じポートで待ち受けている可能性があります）。",
    );
  }
}

/**
 * `serve.out` を読む。WMI の経路（Windows の `cmd.exe` の `>>`）は追記の印（O_APPEND）で開かないので、空にした後の子の書き込みは元の位置に続き、
 * 手前が NUL で埋まる——読むときに NUL を落とす。
 */
async function readServeOut(outPath: string): Promise<string> {
  const text = await readFile(outPath, "utf8").catch(() => "");
  return text.replace(/\0+/g, "");
}

/**
 * `serve.out` を読んで空にする（初回の token を含むので残さない。子は追記で開いているので、以後の出力は先頭から続く）。読んだ後・空にする前に子が書いた分を
 * 失わないよう、大きさが読んだ分と同じときだけ空にし、増えていたら読み直す（それでも読んでから空にするまでの一瞬に書かれた分は失われうる。起動の表示は準備完了の
 * 前に出終わっているので、ここで失われるのはその後の出力＝`server.log` にも残るもの）。
 */
async function takeServeOut(outPath: string): Promise<string> {
  for (let i = 0; i < 3; i++) {
    const raw = await readFile(outPath).catch(() => undefined);
    if (raw === undefined) return "";
    const size = (await stat(outPath).catch(() => undefined))?.size;
    if (size !== undefined && size !== raw.length) continue; // 読んでいる間に書かれた。読み直す
    await truncate(outPath, 0).catch(() => undefined);
    return raw.toString("utf8").replace(/\0+/g, "");
  }
  const text = await readServeOut(outPath);
  await truncate(outPath, 0).catch(() => undefined);
  return text;
}

/** token を含む行の token を伏せる（エラーの案内に出す末尾用）。 */
export function redactTokens(out: string): string {
  return out
    .replace(/#token=[^\s]+/g, "#token=<redacted>")
    .replace(/(token（今回作成[^）]*）: ?)\S+/g, "$1<redacted>");
}

/** 起動の表示（`startupBanner.ts` の `startupLines`・`lastChanceTokenLines`）から、token を含む行と「今だけ表示」の注記だけを取り出す。無ければ undefined。 */
export function tokenNotice(out: string): string | undefined {
  const lines = out
    .split(/\r?\n/)
    .filter((l) => /#token=|token（今回作成|今だけ表示します/.test(l));
  return lines.length > 0 ? lines.join("\n") : undefined;
}
