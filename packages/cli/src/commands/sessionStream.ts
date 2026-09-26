import type { ServerEvent } from "@wtm/protocol";
import { TerminalQueryFilter } from "../attachOutput.js";
import type { Command } from "../cliArgs.js";
import type { SessionStore } from "../session.js";
import {
  FrameWriter,
  LineSplitter,
  MAX_CONTROL_LINE_BYTES,
  OUTPUT_HIGH_WATERMARK_BYTES,
  parseControlLine,
  type ClosedReason,
  type LineEvent,
} from "../sessionStream.js";
import { withSession } from "../withSession.js";
import { RpcFailure, type WtmClient } from "../wsClient.js";

/**
 * `wtmctl pane observe <paneId>`（20260926-pane-observe-control。herdr の terminal session observe）。
 * 既存の `pane.subscribe` の SNAPSHOT（`full: true`）と OUTPUT（`full: false`）を、1 行 1 記録の NDJSON（`terminal.frame`）で stdout へ書き、
 * pane の終わり・接続断で `terminal.closed` を書いて終わる。サーバへ送るのは購読だけ（所有者・大きさ・入力には触れない）。
 */

type PaneObserveCmd = Extract<Command, { kind: "pane-observe" }>;

/** stdout・stderr・stdin・シグナル（テストで差し替える）。 */
export interface StreamIo {
  /** stdout へ 1 行を書く。 */
  writeOut(line: string): void;
  /** stdout の書き出し待ちのバイト数。 */
  outPending(): number;
  /** stdout の書き出し待ちが捌けた。解除する関数を返す。 */
  onOutDrain(cb: () => void): () => void;
  /** stdout に書けなくなった（読み手が閉じた EPIPE 等）。解除する関数を返す。 */
  onOutError(cb: () => void): () => void;
  /** stderr へ 1 行を書く。 */
  warn(line: string): void;
  /** stderr の書き出し待ちのバイト数。 */
  errPending(): number;
  onIn(cb: (chunk: Uint8Array) => void): () => void;
  /** stdin が終わった（'end'・'error'）。 */
  onInEnd(cb: () => void): () => void;
  /** stdin を止める（プロセスが終われるように・受信を止めている間）。 */
  stopIn(): void;
  /** 止めた stdin を再開する。 */
  resumeIn(): void;
  /** それまでに書いた stdout が書き出される（または書けなくなる）まで待つ。 */
  flushOut(): Promise<void>;
  /** SIGINT・SIGTERM・SIGHUP。 */
  onSignal(cb: () => void): () => void;
}

export function processStreamIo(): StreamIo {
  const { stdin, stdout, stderr } = process;
  // 読み手が先に閉じた後の書き込みの失敗（EPIPE）は非同期の 'error' で出る。受け手が無いとプロセスが落ちるので、終わった後に出たぶんも常に受ける。
  stdout.on("error", () => undefined);
  return {
    writeOut: (line) => {
      stdout.write(line);
    },
    outPending: () => stdout.writableLength,
    onOutDrain: (cb) => {
      stdout.on("drain", cb);
      return () => stdout.off("drain", cb);
    },
    onOutError: (cb) => {
      stdout.on("error", cb);
      return () => stdout.off("error", cb);
    },
    warn: (line) => {
      stderr.write(line);
    },
    errPending: () => stderr.writableLength,
    onIn: (cb) => {
      const handler = (chunk: Buffer): void =>
        cb(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
      stdin.on("data", handler);
      return () => stdin.off("data", handler);
    },
    onInEnd: (cb) => {
      stdin.on("end", cb);
      stdin.on("error", cb);
      return () => {
        stdin.off("end", cb);
        stdin.off("error", cb);
      };
    },
    stopIn: () => {
      stdin.pause();
    },
    resumeIn: () => {
      stdin.resume();
    },
    // 空の書き込みのコールバックは、それより前に積んだぶんが書き出された後（失敗なら err 付き）に呼ばれる。
    flushOut: () => new Promise<void>((resolve) => stdout.write("", () => resolve())),
    onSignal: (cb) => {
      process.on("SIGINT", cb);
      process.on("SIGTERM", cb);
      process.on("SIGHUP", cb);
      return () => {
        process.off("SIGINT", cb);
        process.off("SIGTERM", cb);
        process.off("SIGHUP", cb);
      };
    },
  };
}

/** stderr の書き出し待ちがこれを超えている間は、不正な行の警告を書かない。 */
export const MAX_WARN_PENDING_BYTES = 64 * 1024;

/** 失敗で終わる前に stdout の書き出しを待つ上限（読み手が止まっていても終われるように）。 */
export const FLUSH_TIMEOUT_MS = 5_000;

/** 終わり方ごとの、呼び出し側へ投げるエラー（無ければ正常終了）。 */
function failureFor(reason: ClosedReason, paneId: string, detail: string): RpcFailure | null {
  switch (reason) {
    case "pane_closed":
    case "released":
      return null;
    case "taken_over":
      return new RpcFailure(
        "attach_taken_over",
        `pane ${paneId} was taken over by another attached client`,
      );
    case "connection_closed":
      return new RpcFailure(
        "connection_closed",
        `server closed the connection: ${detail || "(no reason given)"}`,
      );
    case "output_closed":
      return new RpcFailure("output_closed", "stdout was closed by the reader");
  }
}

/**
 * pane 1 つ分のフレームのストリーム（observe と control の共通部分。design「共通のストリーム」）。
 * SNAPSHOT/OUTPUT → フレーム・問い合わせの除去・大きさの追従・読み手が遅いときの受信の一時停止・終わり方（最初の 1 回だけ）。
 */
export class PaneStream {
  private readonly frames = new FrameWriter();
  private queries = new TerminalQueryFilter();
  private decoder = new TextDecoder();
  private width = 0;
  private height = 0;
  private snapshotSeen = false;
  private paused = false;
  private pauseAllowed = false;
  private ended = false;
  /** control の解放中（pane の終了・奪取・切断も `released` として終える）。 */
  private releasing = false;
  private readonly disposers: (() => void)[] = [];
  private resolveDone!: () => void;
  private rejectDone!: (err: Error) => void;
  /** 終わったら resolve（正常）か reject（`RpcFailure`）。 */
  readonly done: Promise<void>;
  /**
   * 受信を止めた・再開した（control が stdin を合わせて止めるため。止めている間は奪取の知らせも読めないので、その間に入力を送り続けない）。
   */
  onFlowChange: ((paused: boolean) => void) | null = null;

  constructor(
    private readonly client: WtmClient,
    private readonly paneId: string,
    private readonly io: StreamIo,
  ) {
    this.done = new Promise<void>((resolve, reject) => {
      this.resolveDone = resolve;
      this.rejectDone = reject;
    });
    this.done.catch(() => undefined); // 待ち始める前に終わっても未処理の reject にしない（後で await する）
  }

  get isEnded(): boolean {
    return this.ended;
  }

  /** 出力・切断・stdout の購読を始める（hello の後）。 */
  start(): void {
    this.client.onSnapshot((paneId, cols, rows, text) => {
      if (paneId !== this.paneId || this.ended) return;
      // SNAPSHOT は画面の描き直し（最初と、流量制御からの再開）。前の出力の書きかけの列・文字を持ち越さない。
      this.queries.reset();
      this.decoder = new TextDecoder();
      this.width = cols;
      this.height = rows;
      this.snapshotSeen = true;
      this.write(this.frames.frame(this.queries.filter(text), true, cols, rows));
    });
    this.client.onOutput((paneId, chunk) => {
      if (paneId !== this.paneId || this.ended || !this.snapshotSeen) return;
      const text = this.queries.filter(this.decoder.decode(chunk, { stream: true }));
      if (text !== "") this.write(this.frames.frame(text, false, this.width, this.height));
    });
    this.client.onClose((_code, reason) => this.end("connection_closed", reason));
    this.disposers.push(
      this.io.onOutDrain(() => {
        if (!this.paused || this.ended) return;
        this.setPaused(false);
      }),
    );
    this.disposers.push(this.io.onOutError(() => this.end("output_closed")));
  }

  /** hello で購読したイベント（大きさの変化・pane の終わり）。 */
  onEvent(evt: ServerEvent): void {
    if (this.ended) return;
    if (evt.event === "pane.size_changed" && evt.data.paneId === this.paneId) {
      this.width = evt.data.cols;
      this.height = evt.data.rows;
      return;
    }
    if (
      (evt.event === "pane.exited" || evt.event === "pane.closed") &&
      evt.data.paneId === this.paneId
    ) {
      this.end("pane_closed");
    }
  }

  /** control の解放を始めた（以後の pane の終了・奪取・切断は `released` で終える）。 */
  markReleasing(): void {
    this.releasing = true;
    // 止めたままだと `pane.detach` の応答が読めず、要求の時間切れ（10 秒）まで終われない。以後は止めない。
    this.pauseAllowed = false;
    if (this.paused) this.setPaused(false);
  }

  /** 終える（最初の 1 回だけ有効）。`output_closed` 以外は `terminal.closed` を書く。 */
  end(reason: ClosedReason, detail = ""): void {
    if (this.ended) return;
    this.ended = true;
    const effective: ClosedReason =
      this.releasing && reason !== "output_closed" ? "released" : reason;
    if (effective !== "output_closed") this.io.writeOut(this.frames.closed(effective));
    const failure = failureFor(effective, this.paneId, detail);
    if (!failure) this.resolveDone();
    else if (effective === "output_closed") this.rejectDone(failure);
    // 失敗で終わると呼び出し側がすぐ `process.exit(1)` するので、`terminal.closed` とその前のフレームを書き出してから知らせる
    // （書き出し待ちが残ったまま exit するとパイプの先に届かない）。
    // 読み手が止まっていると書き出しは終わらないので、待つのは FLUSH_TIMEOUT_MS まで（その間のシグナルは受け手が外れておらず効かないため）。
    else {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, FLUSH_TIMEOUT_MS);
      });
      void Promise.race([this.io.flushOut(), timeout]).then(() => {
        clearTimeout(timer);
        this.rejectDone(failure);
      });
    }
  }

  /** 購読を外す（終わった後に呼ぶ）。 */
  dispose(): void {
    this.ended = true;
    for (const dispose of this.disposers.splice(0)) dispose();
    // 止めたままだと、この後の `close()` が相手の close フレームを読めず `ws` の closeTimeout（30 秒）まで終われない。
    if (this.paused) this.setPaused(false);
  }

  /**
   * `pane.subscribe` の応答を受け取った（これより前は受信を止めない——止めると応答が読めず、要求の時間切れで失敗する）。
   * 既に書き出し待ちが上限を超えていれば、ここで止める。
   */
  allowPause(): void {
    if (this.releasing) return; // 解放を先に始めていたら止めない（detach の応答を読むため。markReleasing）
    this.pauseAllowed = true;
    this.pauseIfBehind();
  }

  /** 後で外す購読を足す（control の stdin・シグナル）。 */
  addDisposer(dispose: () => void): void {
    this.disposers.push(dispose);
  }

  private write(line: string): void {
    this.io.writeOut(line);
    this.pauseIfBehind();
  }

  /** 読み手が遅い: 受信を止めてサーバの流量制御に任せる（捨てた出力の代わりに再開時の SNAPSHOT が届く。decisions D4）。 */
  private pauseIfBehind(): void {
    if (this.ended || this.paused || !this.pauseAllowed) return;
    if (this.io.outPending() > OUTPUT_HIGH_WATERMARK_BYTES) this.setPaused(true);
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.client.pause();
    else this.client.resume();
    this.onFlowChange?.(paused);
  }
}

/** 購読して、終わるまで待つ（`pane.subscribe` の応答待ちの間に終わることもあるので、終わりとも競わせる）。 */
export async function subscribeAndWait(
  stream: PaneStream,
  client: WtmClient,
  paneId: string,
): Promise<void> {
  await Promise.race([
    client
      .request("pane.subscribe", { paneId, scrollbackLines: 0 })
      .then(() => stream.allowPause()),
    stream.done,
  ]);
  await stream.done;
}

export async function runPaneObserve(
  cmd: PaneObserveCmd,
  store: SessionStore,
  io: StreamIo = processStreamIo(),
): Promise<void> {
  await withSession(cmd.opts, store, async (client) => {
    const stream = new PaneStream(client, cmd.paneId, io);
    await client.hello((evt) => stream.onEvent(evt));
    stream.start();
    try {
      await subscribeAndWait(stream, client, cmd.paneId);
    } finally {
      stream.dispose();
    }
  });
}

type PaneControlCmd = Extract<Command, { kind: "pane-control" }>;

/**
 * `wtmctl pane control <paneId> [--takeover] [--cols N] [--rows N]`（herdr の terminal session control）。
 * `pane.attach` で所有者になり（`pane attach` と所有者の表を共有）、observe と同じフレームを流し、stdin の NDJSON を
 * INPUT フレーム・`pane.attach_resize`・`pane.detach` に写す。不正な行は stderr に理由を出して読み飛ばす（decisions D5）。
 */
export async function runPaneControl(
  cmd: PaneControlCmd,
  store: SessionStore,
  io: StreamIo = processStreamIo(),
): Promise<void> {
  await withSession(cmd.opts, store, async (client) => {
    const { paneId } = cmd;
    const stream = new PaneStream(client, paneId, io);
    let myClientId: string | null = null;
    /** 自分が所有者になった `pane.attach_changed` を見たか（これより後に別の clientId が来たら奪われた）。 */
    let owned = false;
    let releasing = false;
    /**
     * `pane.attach` が通るまではストリームにイベントを渡さず溜めておく（その間の pane の終わりで `terminal.closed` を書いてから attach の失敗を
     * 投げると、「始まる前の失敗は stdout に何も書かない」が破れる。pane が消えていれば attach が not_found を返す）。attach が通ったら溜めたものを
     * 順に渡す——`ws` は同じ受信の塊のメッセージを同期で配るので、attach の応答の直後のイベントは `await` の続きより先に届く（decisions D10）。
     */
    let pending: ServerEvent[] | null = [];
    const onEvent = (evt: ServerEvent): void => {
      if (evt.event === "pane.attach_changed" && evt.data.paneId === paneId) {
        if (myClientId !== null && evt.data.clientId === myClientId) owned = true;
        else if (owned && evt.data.clientId !== null) stream.end("taken_over");
        return;
      }
      if (pending) pending.push(evt);
      else stream.onEvent(evt);
    };
    // hello の後・ストリームを始める前（attach の応答待ち）の切断は、stdout に何も書かずに connection_closed で終える
    // （実物の WtmClient は切断で待ち中の要求を reject しない）。
    let streamStarted = false;
    /** ストリームを始める前に切れたときの理由（attach の応答の直後・始める前に切れた場合に、始めてから終える）。 */
    let closedEarly: string | null = null;
    const closedBeforeStart = new Promise<never>((_resolve, reject) => {
      client.onClose((_code, reason) => {
        if (!streamStarted) {
          closedEarly = reason;
          reject(
            new RpcFailure(
              "connection_closed",
              `server closed the connection: ${reason || "(no reason given)"}`,
            ),
          );
        }
      });
    });
    closedBeforeStart.catch(() => undefined);
    const hello = await client.hello(onEvent);
    myClientId = hello.clientId;
    // 失敗（not_found・pane_attached 等）はここで投げる——stdout にはまだ何も書いていない。
    await Promise.race([
      client.request("pane.attach", {
        paneId,
        cols: cmd.cols,
        rows: cmd.rows,
        takeover: cmd.takeover,
      }),
      closedBeforeStart,
    ]);
    streamStarted = true;

    const release = (): void => {
      if (releasing || stream.isEnded) return;
      releasing = true;
      stream.markReleasing();
      // 所有を返してから終わる（返せなくても接続を閉じれば解放される）。
      void client.request("pane.detach", { paneId }).then(
        () => stream.end("released"),
        () => stream.end("released"),
      );
    };
    /**
     * 不正な行の警告。stderr を読まない相手だと書き出し待ちが際限なく溜まるので、上限を超えている間は捨てる
     * （review ラウンド 1。stdout の D4 と同じく wtmctl のメモリを上限の範囲に留める）。
     */
    const warn = (reason: string): void => {
      if (io.errPending() > MAX_WARN_PENDING_BYTES) return;
      io.warn(`wtmctl: pane control input ignored: ${reason}\n`);
    };
    const handle = (event: LineEvent): void => {
      if (releasing || stream.isEnded) return;
      if (event.kind === "too_long") {
        warn(`line exceeds ${MAX_CONTROL_LINE_BYTES} bytes`);
        return;
      }
      const parsed = parseControlLine(event.bytes);
      if (parsed.ok === "empty") return;
      if (parsed.ok === false) {
        warn(parsed.reason);
        return;
      }
      const command = parsed.command;
      switch (command.type) {
        case "terminal.input":
          if (command.data.byteLength > 0) client.sendInput(paneId, command.data);
          return;
        case "terminal.resize":
          // 奪われた後は not_attached になるが、それはイベントで分かるので無視する。
          client
            .request("pane.attach_resize", { paneId, cols: command.cols, rows: command.rows })
            .catch(() => undefined);
          return;
        case "terminal.release":
          release();
          return;
      }
    };

    // 受信を止めている間は stdin も止める（奪われた知らせを読めないまま入力を送り続けない。止めている間の行は stdin に残る）。
    stream.onFlowChange = (paused) => (paused ? io.stopIn() : io.resumeIn());
    stream.start();
    const early = pending;
    pending = null;
    for (const evt of early) stream.onEvent(evt);
    if (closedEarly !== null) stream.end("connection_closed", closedEarly);
    const lines = new LineSplitter();
    stream.addDisposer(io.onIn((chunk) => lines.feed(chunk).forEach(handle)));
    stream.addDisposer(
      io.onInEnd(() => {
        lines.end().forEach(handle);
        release();
      }),
    );
    // 2 度目のシグナルは応答を待たずに終える（所有は接続を閉じれば解放される）。
    stream.addDisposer(io.onSignal(() => (releasing ? stream.end("released") : release())));
    try {
      await subscribeAndWait(stream, client, paneId);
    } finally {
      stream.dispose();
      io.stopIn();
    }
  });
}
