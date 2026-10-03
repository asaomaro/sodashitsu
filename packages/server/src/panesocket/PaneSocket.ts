import { unlink } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import {
  PANE_SOCKET_MAX_CONNECTIONS,
  PANE_SOCKET_MAX_LINE_BYTES,
  PANE_SOCKET_REQUEST_WAIT_MS,
  PaneSocketRequest,
  type PaneSocketErrorCode,
  type PaneSocketResponse,
} from "@sodashitsu/protocol";
import { listenPrivateUnixSocket } from "../infra/privateUnixSocket.js";
import type { Logger } from "../log/Logger.js";
import type { PaneOpRegistry } from "./PaneOpRegistry.js";

/** 受け口の上限（既定は protocol の定数。テストが短く・小さく差し替える）。 */
export interface PaneSocketLimits {
  /** 要求 1 行の上限（改行を除くバイト数）。 */
  maxLineBytes: number;
  /** 同時に開いている接続の上限。 */
  maxConnections: number;
  /** 接続してから要求の 1 行が揃うまでの上限。返事を書き切るまでの上限にも使う（読まない相手に接続の枠を持たせ続けない）。 */
  requestWaitMs: number;
  /**
   * 要求を読まずに断った接続（`pane_socket_busy`・行の上限超過の `bad_request`）を、返事を書いた後、相手が閉じるまで開けておく上限。
   * すぐ捨てると、相手の要求の書き込みが EPIPE になり、届いていた返事を読めない。
   */
  refusedLingerMs: number;
  /** 断った後、相手が閉じるのを待っている接続の上限（超えたら古いものから捨てる。断る接続が際限なく溜まらない）。 */
  maxRefusedLingering: number;
}

/** 断った接続を相手が閉じるまで待つ既定の上限（相手は返事の 1 行を読んだらすぐ閉じる。イベントループが少し塞がっても読める長さ）。 */
const REFUSED_LINGER_MS = 1_000;
/** 断った後に待っている接続の既定の上限（同時接続の上限 `PANE_SOCKET_MAX_CONNECTIONS` と同じ大きさの、別の枠）。 */
const MAX_REFUSED_LINGERING = PANE_SOCKET_MAX_CONNECTIONS;

export interface PaneSocketDeps {
  registry: PaneOpRegistry;
  paneExists(paneId: string): boolean;
  /** 接続が終わった（返事を書いた・切れた・捨てた）ときに 1 回呼ぶ。ask の取り消しに使う。 */
  onConnectionGone(connId: string): void;
  logger: Logger;
  limits?: Partial<PaneSocketLimits>;
}

interface Conn {
  /** `pane-socket:<連番>`。 */
  id: string;
  sock: Socket;
  abort: AbortController;
  /** 改行が来るまでに受け取ったかたまり（バイトのまま持つ——上限はバイト数で、多バイト文字がかたまりの境目で割れても壊さない）。 */
  chunks: Buffer[];
  bytes: number;
  /** 要求の 1 行を受け取った・断った（以後のデータは読まない）。 */
  handled: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
  gone: boolean;
}

const NEWLINE = 0x0a;
/** 一時ディレクトリの名前の頭（`<状態ディレクトリ>/.p-XXXXXX`）。 */
const TMP_PREFIX = ".p-";

/**
 * pane の中のプログラム向けの、ログイン不要の受け口（`pane.sock`。20261003-sodactl-ask-socket の design「サーバ: 受け口」）。
 * 状態ディレクトリの Unix ドメイン socket（0600＝同じ利用者だけ。0600 になってから見える場所に置く）で、**1 接続 1 要求**:
 * 改行までを 1 行の JSON（`PaneSocketRequest`）として読み、返事（`PaneSocketResponse`）を 1 行書いて閉じる。2 行目以降は読まない。
 * 受けるのは `PaneOpRegistry` に登録した操作だけ（`/ws` の RPC は通さない）。
 *
 * 検査の順（design の正）: (1) 行の形 → `bad_request`、(2) 操作が登録にあるか → `unknown_op`、(3) 名乗った pane の実在 → `not_found`、
 * (4) 引数の schema → `invalid_params`、handler。操作を pane より先に見るのは、実在しない pane ＋知らない操作でも `unknown_op` を返して、
 * 呼び出し側（sodactl）が「受け口がその操作を知らない」と見分けられるようにするため。
 *
 * **相手が読み書きのどちらかを閉じたら、接続は終わったものとして扱う**（返事を待つ間に相手のプロセスが終わったことを知る手段が EOF だけのため）。
 * 呼び出し側は要求を書いた後、返事の行を読むまで接続を半分だけ閉じてはいけない（`end` ではなく `write` で送る）。
 * Windows では置かない（呼び出し側が判断する）。新しい TCP の待ち受けは作らない。
 */
export class PaneSocket {
  private readonly limits: PaneSocketLimits;
  private readonly conns = new Set<Conn>();
  /**
   * 要求を読まずに断った接続（返事を書き、相手が閉じるのを待っている。古い順。`close()` が待たずに捨てる）。
   * 同時接続の枠（`conns`）には数えない——数えると、断る接続で枠が埋まり、断る理由が無くなった後も断り続ける。
   * 代わりに別の上限（`maxRefusedLingering`）を持ち、超えたら古いものから捨てる。
   */
  private readonly refused = new Set<Socket>();
  private server: Server | undefined;
  private listenPath: string | undefined;
  /** 進行中の `listen()`（終わると解決する。失敗でも reject しない）。途中で呼ばれた `close()` が待つ。 */
  private starting: Promise<void> | undefined;
  /**
   * `listen()` が済んでから（0600 で置き、一時ディレクトリを消した後）`close()` を始めるまで真。
   * 偽の間に繋がった接続（置いてから `listen()` が済むまでの間・`close()` を始めた後）は何も書かずに捨てる。
   */
  private accepting = false;
  /** 引き継ぎの間（`pause()` 〜 `resume()`）は新しい接続を `pane_socket_busy` で断る。 */
  private paused = false;
  private seq = 0;

  constructor(private readonly deps: PaneSocketDeps) {
    this.limits = {
      maxLineBytes: deps.limits?.maxLineBytes ?? PANE_SOCKET_MAX_LINE_BYTES,
      maxConnections: deps.limits?.maxConnections ?? PANE_SOCKET_MAX_CONNECTIONS,
      requestWaitMs: deps.limits?.requestWaitMs ?? PANE_SOCKET_REQUEST_WAIT_MS,
      refusedLingerMs: deps.limits?.refusedLingerMs ?? REFUSED_LINGER_MS,
      maxRefusedLingering: deps.limits?.maxRefusedLingering ?? MAX_REFUSED_LINGERING,
    };
  }

  /** いま開いている接続の数（要求を読まずに断った接続は数えない）。 */
  get connectionCount(): number {
    return this.conns.size;
  }

  /**
   * 状態ディレクトリの socket で待ち受ける（0700 の一時ディレクトリ → 0600 → rename。残っていた古いファイルは rename が置き換える）。
   * 失敗したら待ち受けを閉じて投げる（呼び出し側が warn で起動を続ける）。
   * 途中で `close()` が呼ばれたら、`close()` がこの完了を待ってから閉じる（待ち受けとファイルを残さない）。
   */
  async listen(path: string): Promise<void> {
    if (this.server || this.starting) throw new Error("pane socket is already listening");
    const placing = this.place(path);
    this.starting = placing.then(
      () => undefined,
      () => undefined,
    );
    try {
      await placing;
    } finally {
      this.starting = undefined;
    }
  }

  private async place(path: string): Promise<void> {
    const server = createServer((sock) => this.handleSocket(sock));
    server.on("error", (err) => this.deps.logger.warn("pane socket error", { path, error: String(err) }));
    await listenPrivateUnixSocket(server, path, { tmpPrefix: TMP_PREFIX });
    this.server = server;
    this.listenPath = path;
    this.accepting = true;
  }

  /**
   * 受け付けを止め、開いている接続を捨てる（引き継ぎの `closeClients`）。捨てる接続には何も書かない（待っていた操作は取り消される）。
   * 待ち受けは続け、以後の新しい接続は要求を読まずに `pane_socket_busy` で断る。
   */
  pause(): void {
    this.paused = true;
    this.dropAll();
  }

  /** 受け付けを戻す（引き継ぎを元に戻す `reopenClients`）。 */
  resume(): void {
    this.paused = false;
  }

  /** 受け付けを止め、接続を捨て、socket のファイルを消す。何度呼んでもよい。 */
  async close(): Promise<void> {
    this.accepting = false;
    // `listen()` の途中なら、置き終わるのを待ってから閉じる（待たずに戻ると、後から待ち受けと `pane.sock` が残る）。
    while (this.starting) await this.starting;
    this.accepting = false;
    // 接続が残っていると `server.close()` が終わらないので、先に捨てる。
    this.dropAll();
    for (const sock of [...this.refused]) sock.destroy();
    this.refused.clear();
    const server = this.server;
    this.server = undefined;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    // 待ち受けたのは rename の前のパスなので、`pane.sock` のファイルは自分で消す。
    const listenPath = this.listenPath;
    this.listenPath = undefined;
    if (listenPath !== undefined) await unlink(listenPath).catch(() => undefined);
  }

  private handleSocket(sock: Socket): void {
    sock.on("error", () => undefined); // 相手が途中で切っても、受け口は止めない
    if (!this.accepting) {
      sock.destroy();
      return;
    }
    if (this.paused || this.conns.size >= this.limits.maxConnections) {
      this.deps.logger.info("pane socket: refused a connection", { code: "pane_socket_busy" });
      this.refuse(sock, this.failure("pane_socket_busy", "the pane socket is not accepting requests right now"));
      return;
    }
    const conn: Conn = {
      id: `pane-socket:${++this.seq}`,
      sock,
      abort: new AbortController(),
      chunks: [],
      bytes: 0,
      handled: false,
      timer: undefined,
      gone: false,
    };
    this.conns.add(conn);
    this.armTimer(conn); // 行が揃わないまま居座る接続を切る
    sock.on("close", () => this.finish(conn));
    sock.on("data", (chunk: Buffer) => this.handleData(conn, chunk));
  }

  /**
   * 要求を読まずに断る（`pane_socket_busy`・行の上限超過の `bad_request`）: 返事を 1 行書いて書き込み側だけ閉じ、届く要求は読み捨てながら、
   * 相手が閉じるか `refusedLingerMs` が過ぎるまで待ってから捨てる。
   * 返事を書いてすぐ捨てると、相手の要求の書き込みがこちらの close より後になったとき EPIPE になり、相手は届いていた返事を読めない
   * （`connection_closed` に見える＝「操作は始まっていない」と分からない）。
   */
  private refuse(sock: Socket, res: PaneSocketResponse): void {
    // 待っている接続が上限なら、古いものから捨てる（返事は書いてある。新しい相手に返事を届けるほうを優先する）。
    for (const old of this.refused) {
      if (this.refused.size < this.limits.maxRefusedLingering) break;
      this.refused.delete(old);
      old.destroy();
    }
    this.refused.add(sock);
    const timer = setTimeout(() => sock.destroy(), this.limits.refusedLingerMs);
    timer.unref();
    sock.on("close", () => {
      clearTimeout(timer);
      this.refused.delete(sock);
    });
    sock.on("end", () => sock.destroy()); // 相手が閉じた（返事を読んだ・諦めた）
    sock.resume(); // 相手が書いた要求は読み捨てる（読まないと相手の切断に気づけない）
    sock.end(`${JSON.stringify(res)}\n`);
  }

  private handleData(conn: Conn, chunk: Buffer): void {
    if (conn.handled || conn.gone) return; // 2 行目以降・返事の後のデータは読まない
    const nl = chunk.indexOf(NEWLINE);
    // 改行の前までの長さで上限を見る（改行を含む大きな 1 つのかたまりでも、改行の無い長い流れでも）。
    if (conn.bytes + (nl < 0 ? chunk.length : nl) > this.limits.maxLineBytes) {
      conn.handled = true;
      // 相手はまだ行の残りを書いているかもしれない。同時接続の枠は空け、断った接続として相手が閉じるのを待つ（`refuse`）。
      const res = this.failure("bad_request", `the request line exceeds ${this.limits.maxLineBytes} bytes`);
      this.deps.logger.info("pane socket: request", { connId: conn.id, code: "bad_request" });
      this.finish(conn);
      this.refuse(conn.sock, res);
      return;
    }
    if (nl < 0) {
      conn.chunks.push(chunk);
      conn.bytes += chunk.length;
      return;
    }
    conn.handled = true;
    this.clearTimer(conn); // 行は揃った。ここから先は操作の時間（操作ごとの上限に任せる）
    const line = Buffer.concat([...conn.chunks, chunk.subarray(0, nl)]).toString("utf8");
    conn.chunks = [];
    void this.handleLine(conn, line);
  }

  private async handleLine(conn: Conn, line: string): Promise<void> {
    const log: { op?: string; paneId?: string } = {};
    let res: PaneSocketResponse;
    try {
      res = await this.dispatch(conn, line, log);
    } catch (err) {
      // `dispatch` の中で投げるのは依存（`paneExists`）の想定外の例外だけ。詳細は呼び出し側へ漏らさない。
      this.deps.logger.warn("pane socket: request failed", {
        ...log,
        connId: conn.id,
        error: String(err instanceof Error ? (err.stack ?? err.message) : err),
      });
      res = this.failure("internal", "internal error");
    }
    this.reply(conn, res, log);
  }

  /** 検査の順は「形 → 操作 → pane → 引数 → handler」（クラスのコメント）。 */
  private async dispatch(conn: Conn, line: string, log: { op?: string; paneId?: string }): Promise<PaneSocketResponse> {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      return this.failure("bad_request", "the request is not a JSON line");
    }
    const parsed = PaneSocketRequest.safeParse(raw);
    if (!parsed.success) {
      return this.failure("bad_request", 'expected {"v":1,"op":"<name>","paneId":"<id>","params":{...}}');
    }
    const req = parsed.data;
    log.op = req.op;
    log.paneId = req.paneId;
    if (!this.deps.registry.has(req.op)) return this.failure("unknown_op", `unknown op: ${req.op}`);
    if (!this.deps.paneExists(req.paneId)) return this.failure("not_found", `pane not found: ${req.paneId}`);
    return this.deps.registry.invoke(
      req.op,
      { paneId: req.paneId, connId: conn.id, signal: conn.abort.signal },
      req.params ?? {},
    );
  }

  private failure(code: PaneSocketErrorCode, message: string): PaneSocketResponse {
    return { ok: false, error: { code, message } };
  }

  /** 返事を 1 行書いて閉じる。接続がもう終わっていれば何もしない（待っている間に相手が切った・受け口が捨てた）。 */
  private reply(conn: Conn, res: PaneSocketResponse, log: { op?: string; paneId?: string }): void {
    if (conn.gone || conn.sock.destroyed) return;
    let out = res;
    let text: string;
    try {
      text = JSON.stringify(out);
    } catch {
      // 結果が JSON にできない（操作の実装の誤り）。
      out = this.failure("internal", "internal error");
      text = JSON.stringify(out);
    }
    // 引数・結果の中身は書かない（操作の名前・pane・接続・結果の code だけ）。
    this.deps.logger.info("pane socket: request", {
      ...log,
      connId: conn.id,
      code: out.ok ? "ok" : out.error.code,
    });
    // 書き切ったらこちらから閉じる（相手が閉じるのを待たない＝接続の枠をすぐ空ける。相手は要求の行を書き終えているので、書き込みで失敗しない）。
    // 相手が読まずに書き切れないときは、行を待つのと同じ上限で切る。
    this.armTimer(conn);
    conn.sock.end(`${text}\n`, () => conn.sock.destroy());
  }

  private armTimer(conn: Conn): void {
    this.clearTimer(conn);
    conn.timer = setTimeout(() => conn.sock.destroy(), this.limits.requestWaitMs);
    conn.timer.unref();
  }

  private clearTimer(conn: Conn): void {
    if (conn.timer !== undefined) clearTimeout(conn.timer);
    conn.timer = undefined;
  }

  /** 開いている接続を、何も書かずに捨てる。 */
  private dropAll(): void {
    for (const conn of [...this.conns]) {
      conn.sock.destroy();
      this.finish(conn); // socket の `close` を待たずに後始末する（呼び出しから戻った時点で、待っていた操作は取り消されている）
    }
  }

  /** 接続が終わった（どの終わり方でも 1 回だけ）: `signal` を abort し、`onConnectionGone` を呼ぶ。 */
  private finish(conn: Conn): void {
    if (conn.gone) return;
    conn.gone = true;
    this.clearTimer(conn);
    this.conns.delete(conn);
    conn.chunks = [];
    conn.abort.abort();
    try {
      this.deps.onConnectionGone(conn.id);
    } catch (err) {
      this.deps.logger.warn("pane socket: onConnectionGone failed", {
        connId: conn.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
