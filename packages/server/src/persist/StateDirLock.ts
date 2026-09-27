import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Logger } from "../log/Logger.js";

/** 状態ディレクトリの排他のロックのファイル名（中身は持ち主の pid とホスト名。D103）。 */
export const STATE_DIR_LOCK_FILE = "soda.lock";

/** 同じ状態ディレクトリを、生きている別の soda（または同じプロセスの別の実体・確かめられない別のホスト）が使っている。 */
export class StateDirInUseError extends Error {
  constructor(
    readonly pid: number,
    readonly lockPath: string,
    /** 持ち主が別のホスト（別の pid 名前空間）のときだけ、そのホスト名（pid の生死を確かめられないので使用中とみなした）。 */
    readonly otherHost?: string | undefined,
  ) {
    super(`state dir is locked by pid ${pid}${otherHost !== undefined ? ` on ${otherHost}` : ""} (${lockPath})`);
    this.name = "StateDirInUseError";
  }
}

export interface StateDirLockOptions {
  /** ロックに書く pid（既定 `process.pid`。テストで別のプロセスを模す）。 */
  pid?: number;
  /** ロックに書くホスト名（既定 `os.hostname()`。テストで別のホスト・コンテナを模す）。 */
  hostname?: string;
  /** その pid のプロセスが生きているか（既定 `isPidAlive`。テストで差し替える）。 */
  isAlive?: (pid: number) => boolean;
  /** 中身（pid）を読めないロックを読み直すまでの待ち（ms。作った直後で pid をまだ書いていない相手を待つ）。 */
  rereadDelayMs?: number;
  /** 放すときの失敗を書く先（放す失敗は投げない。下記 `release`）。 */
  logger?: Pick<Logger, "warn"> | undefined;
}

/** ロックの中身（1 行目が pid、2 行目がホスト名。D103 の最初の形は pid だけで、2 行目が無ければ `host` は `undefined`）。 */
interface LockHolder {
  pid: number;
  host: string | undefined;
}

/**
 * pid のプロセスが生きているか（`process.kill(pid, 0)`。シグナルは送らない）。`EPERM`（他のユーザーのプロセス）は
 * 生きているとみなす。Windows でも `kill(pid, 0)` で存在を確かめられる。
 */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * このプロセスで持っているロック（resolve したパス）。ロックの pid が自分の pid と同じとき、このプロセスの別の実体
 * （テスト等で同じ状態ディレクトリに 2 つ組み立てた）が持っているのか、前に同じ pid で動いて落ちたプロセスの残りか
 * （コンテナで毎回 pid 1 等で起動する）を見分ける。後者を「生きている」とすると、一度落ちたら二度と起動できない。
 */
const heldInThisProcess = new Set<string>();

/**
 * 状態ディレクトリの排他のロック（`<状態ディレクトリ>/soda.lock`。D103）。同じ `--state-dir` の soda を 2 つ動かすと
 * （ポートを変えれば bind は両方成功する——docs の手元用 7780 と LAN 用 8443 等）、全シェルを二重に起動し、
 * `session.json`・`auth.json` を互いに上書きし合うので、2 つ目を止める。
 * - `acquire()`：`wx`（無ければ作る・あれば失敗）で作り、自分の pid とホスト名を書く。既にあれば中身を見て、使用中なら
 *   `StateDirInUseError`。使用中でなければ（落ちたプロセスの残り）消してから取り直す。使用中とみなすのは：
 *   - **ホスト名が自分と違う**：別のマシン（共有のディレクトリ）か別のコンテナ（ボリュームの共有）で、pid の生死を
 *     こちらからは確かめられない（pid 名前空間が違う。どちらも pid 1 のこともある）。落ちて残ったものなら、案内のとおり
 *     ロックのファイルを消してもらう（コンテナを作り直すとホスト名が変わるので、そのときはこの手順が要る）。
 *   - 自分と同じ pid：このプロセスが持っているとき（テスト等で同じ状態ディレクトリに 2 つ組み立てた）だけ。持っていなければ、
 *     前に同じホスト・同じ pid で動いて落ちたプロセスの残り（同じコンテナを再起動すると毎回 pid 1 等になる）。
 *   - それ以外：その pid のプロセスが生きている（`isPidAlive`）。
 *   ホスト名の無い（pid だけの）古い形のロックは、ホスト名が同じものとして扱う。
 * - `release()`：自分の pid とホスト名が書かれているときだけ消す（古いと見なした別の起動が取り直した後なら、その人のロックを
 *   消さない）。**失敗しても投げない**（Windows でウイルス対策・インデクサが開いていて `EPERM`/`EBUSY` 等。`logger` に warn を
 *   書くだけ）——投げると `listen()` の失敗の元の原因（bind の失敗の案内・終了コード 2）を隠し、正常な終了を終了コード 1 に
 *   してしまう。残ったロックは次の起動が pid を見て取り直す。
 * - 扱わないこと：pid が別のプロセスに再利用されていると生きているとみなす（案内でロックのファイルを消すよう伝える）。
 *   古いロックを 2 つの起動が同時に取り直す競合（起動がミリ秒単位で重なったときだけ）は扱わない。
 */
export class StateDirLock {
  readonly path: string;
  private readonly pid: number;
  private readonly hostname: string;
  private readonly isAlive: (pid: number) => boolean;
  private readonly rereadDelayMs: number;
  private readonly logger: Pick<Logger, "warn"> | undefined;
  private held = false;

  constructor(stateDir: string, opts: StateDirLockOptions = {}) {
    this.path = resolve(join(stateDir, STATE_DIR_LOCK_FILE));
    this.pid = opts.pid ?? process.pid;
    this.hostname = opts.hostname ?? hostname();
    this.isAlive = opts.isAlive ?? isPidAlive;
    this.rereadDelayMs = opts.rereadDelayMs ?? 100;
    this.logger = opts.logger;
  }

  /** 持っているか（テスト・診断用）。 */
  get isHeld(): boolean {
    return this.held;
  }

  async acquire(): Promise<void> {
    if (this.held) return;
    await mkdir(dirname(this.path), { recursive: true });
    // 古いロックを消してから作り直す間に別の起動が作ることがあるので、数回だけやり直す。
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await this.tryCreate()) {
        this.held = true;
        heldInThisProcess.add(this.path);
        return;
      }
      const holder = await this.readHolder();
      if (holder !== undefined && this.isInUse(holder)) {
        throw new StateDirInUseError(holder.pid, this.path, this.isOtherHost(holder) ? holder.host : undefined);
      }
      // 持ち主が生きていない（落ちたプロセスの残り）か、中身を読めない（pid を書く前に落ちた）ロック。
      await unlink(this.path).catch(ignoreMissing);
    }
    throw new Error(`could not acquire ${this.path}`);
  }

  /**
   * 読み取り専用で、ロックの持ち主が使用中か（`soda session list`。20260926-named-session）。使用中なら持ち主、そうでなければ
   * `undefined`（ロックが無い・中身を読めない・持ち主が生きていない）。ファイルもディレクトリも作らない・消さない。
   */
  async inspect(): Promise<{ pid: number; otherHost?: string } | undefined> {
    const holder = await this.readHolderOnce();
    if (holder === undefined || !this.isInUse(holder)) return undefined;
    return this.isOtherHost(holder) ? { pid: holder.pid, otherHost: holder.host! } : { pid: holder.pid };
  }

  /** 放す。失敗しても投げない（上記）。 */
  async release(): Promise<void> {
    if (!this.held) return;
    this.held = false;
    heldInThisProcess.delete(this.path);
    try {
      const holder = parseHolder(await readFile(this.path, "utf8"));
      if (holder === undefined || holder.pid !== this.pid || this.isOtherHost(holder)) return;
      await unlink(this.path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      this.logger?.warn("state dir lock release failed (the next start takes it over by checking the pid)", {
        lockPath: this.path,
        error: String(err),
      });
    }
  }

  private async tryCreate(): Promise<boolean> {
    let handle;
    try {
      handle = await open(this.path, "wx", 0o600);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw err;
    }
    try {
      await handle.writeFile(`${this.pid}\n${this.hostname}\n`, "utf8");
    } catch (err) {
      await handle.close().catch(() => undefined);
      await unlink(this.path).catch(ignoreMissing);
      throw err;
    }
    await handle.close();
    return true;
  }

  /** ロックの持ち主。読めない・中身が pid でなければ、少し待って一度だけ読み直す（作った直後の相手を待つ）。 */
  private async readHolder(): Promise<LockHolder | undefined> {
    const first = await this.readHolderOnce();
    if (first !== undefined) return first;
    await new Promise((r) => setTimeout(r, this.rereadDelayMs));
    return this.readHolderOnce();
  }

  private async readHolderOnce(): Promise<LockHolder | undefined> {
    const content = await readFile(this.path, "utf8").catch(() => undefined);
    return content === undefined ? undefined : parseHolder(content);
  }

  /** 持ち主が別のホスト（pid の生死をこちらから確かめられない）か。pid だけの古い形は同じホストとみなす。 */
  private isOtherHost(holder: LockHolder): boolean {
    return holder.host !== undefined && holder.host !== this.hostname;
  }

  private isInUse(holder: LockHolder): boolean {
    if (this.isOtherHost(holder)) return true;
    // 自分と同じ pid：このプロセスで持っているなら使用中、持っていなければ前に同じ pid で動いたプロセスの残り。
    if (holder.pid === this.pid) return heldInThisProcess.has(this.path);
    return this.isAlive(holder.pid);
  }
}

function parseHolder(content: string): LockHolder | undefined {
  const [pidLine = "", hostLine = ""] = content.split(/\r?\n/);
  const trimmed = pidLine.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const pid = Number(trimmed);
  if (!Number.isSafeInteger(pid) || pid <= 0) return undefined;
  const host = hostLine.trim();
  return { pid, host: host === "" ? undefined : host };
}

function ignoreMissing(err: unknown): void {
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
}
