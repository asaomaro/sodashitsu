import { clampTerminalSize, type ServerEvent } from "@sodashitsu/protocol";
import { AttachKeyFilter } from "../attachKeys.js";
import { TerminalQueryFilter } from "../attachOutput.js";
import { resolvePaneRefViaConnect } from "../idRef.js";
import type { Command } from "../cliArgs.js";
import type { SessionStore } from "../session.js";
import { assertNotSelfPane } from "../selfGuard.js";
import { withSession } from "../withSession.js";
import { RpcFailure, type SodaClient } from "../wsClient.js";

/**
 * `sodactl pane attach <paneId> [--takeover]`（20260926-pane-direct-connect。herdr の terminal attach）。
 * 手元の端末を raw モード・代替画面にし、`pane.attach`（大きさを手元に合わせる）→ `pane.subscribe`（見えている画面＋以後の出力）
 * → INPUT（打鍵）で pane に直結する。終わり方は `Ctrl+B q`（0）・奪われた／pane の終了／接続断（1）。どの終わり方でも
 * 端末のモードと raw モードを戻してから返る（`reportAndExit` より前）。
 */

type PaneAttachCmd = Extract<Command, { kind: "pane-attach" }>;

/** 手元の端末（テストで差し替える）。 */
export interface AttachTerminal {
  /** stdin と stdout の両方が端末か。 */
  readonly isTTY: boolean;
  size(): { cols: number; rows: number };
  setRawMode(on: boolean): void;
  write(data: string | Uint8Array): void;
  /** 解除する関数を返す。 */
  onInput(cb: (bytes: Uint8Array) => void): () => void;
  onResize(cb: () => void): () => void;
  /** 終わらせるシグナル（SIGTERM・SIGHUP）。切り離しと同じに扱う。 */
  onSignal(cb: () => void): () => void;
}

/** 代替画面に入り、画面を消す（decisions D4）。 */
export const ENTER_SCREEN = "\x1b[?1049h\x1b[H\x1b[2J";
/**
 * pane が変えたかもしれない端末のモードを戻し、最後に代替画面から出る（decisions D4・D9）。色・カーソルの表示と形・スクロール領域・
 * 自動折り返し・原点モード・文字集合・マウスの報告・フォーカスの報告・bracketed paste・カーソルキー／キーパッド。
 * kitty keyboard・modifyOtherKeys は戻さない。
 */
export const RESTORE_SCREEN =
  // スクロール領域の解除（CSI r）はカーソルを左上へ動かすので、カーソルの退避（ESC 7）と復帰（ESC 8）で挟む。
  "\x1b[0m\x1b[?25h\x1b[0 q\x1b7\x1b[r\x1b8\x1b[?7h\x1b[?6l\x1b(B" +
  "\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1005l\x1b[?1006l\x1b[?1015l\x1b[?1016l" +
  "\x1b[?1004l\x1b[?2004l\x1b[?1l\x1b>" +
  "\x1b[?1049l";

const FALLBACK_SIZE = { cols: 80, rows: 24 };

export function processTerminal(): AttachTerminal {
  const { stdin, stdout } = process;
  // 端末が先に閉じた（SIGHUP 等）後の書き込み・読み取りの失敗（EIO）で落ちないようにする。
  const ignoreError = (): void => undefined;
  return {
    isTTY: Boolean(stdin.isTTY && stdout.isTTY),
    size: () =>
      stdout.columns > 0 && stdout.rows > 0
        ? { cols: stdout.columns, rows: stdout.rows }
        : FALLBACK_SIZE,
    setRawMode: (on) => {
      if (on) {
        stdout.on("error", ignoreError);
        stdin.on("error", ignoreError);
      }
      stdin.setRawMode(on);
      if (on) stdin.resume();
      else {
        stdin.pause();
        stdout.off("error", ignoreError);
        stdin.off("error", ignoreError);
      }
    },
    write: (data) => {
      stdout.write(data);
    },
    onInput: (cb) => {
      const handler = (chunk: Buffer): void =>
        cb(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
      stdin.on("data", handler);
      return () => stdin.off("data", handler);
    },
    onResize: (cb) => {
      stdout.on("resize", cb);
      return () => stdout.off("resize", cb);
    },
    onSignal: (cb) => {
      process.on("SIGTERM", cb);
      process.on("SIGHUP", cb);
      return () => {
        process.off("SIGTERM", cb);
        process.off("SIGHUP", cb);
      };
    },
  };
}

export async function runPaneAttach(
  cmd0: PaneAttachCmd,
  store: SessionStore,
  term: AttachTerminal = processTerminal(),
): Promise<void> {
  let cmd = cmd0;
  // 自分の pane に直結すると、直結の出力が自分の pane に書かれて流れ続ける（20260926-agent-skill-file）。端末を触る前・接続する前に断る。
  assertNotSelfPane(cmd.opts, cmd.paneId, "attach to");
  if (!term.isTTY) {
    throw new RpcFailure("not_a_tty", "pane attach needs a terminal on both stdin and stdout");
  }
  // 部分の指定（先頭 4 文字以上）は完全な id に直す。自分の pane に当たっていたらここで断る。
  const paneId = await resolvePaneRefViaConnect(cmd.opts, store, cmd.paneId);
  if (paneId !== cmd.paneId) {
    assertNotSelfPane(cmd.opts, paneId, "attach to");
    cmd = { ...cmd, paneId };
  }
  await withSession(cmd.opts, store, (client) => attachSession(client, cmd, term));
  process.stderr.write(`sodactl: detached from ${cmd.paneId}\n`);
}

async function attachSession(
  client: SodaClient,
  cmd: PaneAttachCmd,
  term: AttachTerminal,
): Promise<void> {
  const { paneId } = cmd;
  let ended = false;
  let resolveDone!: () => void;
  let rejectDone!: (err: Error) => void;
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  done.catch(() => undefined); // 待ち始める前に終わっても未処理の reject にしない（後で await する）
  const finish = (err?: Error): void => {
    if (ended) return;
    ended = true;
    if (err) rejectDone(err);
    else resolveDone();
  };

  /**
   * 切り離しを始めた（`Ctrl+B q`・シグナル）。以後の打鍵は送らず、応答を待つ間の切断・奪取・pane の終了も切り離しとして
   * 正常に終える（どれが先に届くかで終了コードが変わらないように。decisions D9）。
   */
  let detaching = false;
  let myClientId: string | null = null;
  /** 自分が所有者になった `pane.attach_changed` を見たか（これより後に別の clientId が来たら奪われた）。 */
  let owned = false;
  const onEvent = (evt: ServerEvent): void => {
    if (evt.event === "pane.attach_changed" && evt.data.paneId === paneId) {
      if (myClientId !== null && evt.data.clientId === myClientId) owned = true;
      else if (owned && evt.data.clientId !== null) {
        if (detaching) return finish();
        finish(
          new RpcFailure(
            "attach_taken_over",
            `pane ${paneId} was taken over by another attached client`,
          ),
        );
      }
      return;
    }
    if (
      (evt.event === "pane.exited" || evt.event === "pane.closed") &&
      evt.data.paneId === paneId
    ) {
      if (detaching) return finish();
      finish(new RpcFailure("pane_closed", `pane ${paneId} has exited or was closed`));
    }
  };

  const hello = await client.hello(onEvent);
  myClientId = hello.clientId;
  // サーバのスキーマの上限（1 辺 4096・面積 1,000,000 セル）に丸める——上限の外は invalid_params で繋げない（20260927-server-size-input-limits）。
  const measured = term.size();
  const size = clampTerminalSize(measured.cols, measured.rows);
  // 失敗（not_found・pane_attached 等）はここで投げる——手元の端末はまだ触っていない。
  await client.request("pane.attach", {
    paneId,
    cols: size.cols,
    rows: size.rows,
    takeover: cmd.takeover,
  });

  const detach = (): void => {
    if (detaching || ended) return;
    detaching = true;
    // 所有者を返してから終わる（返せなくても切断で解放される）。
    void client.request("pane.detach", { paneId }).then(
      () => finish(),
      () => finish(),
    );
  };

  client.onClose((_code, reason) => {
    if (detaching) {
      finish();
      return;
    }
    finish(
      new RpcFailure(
        "connection_closed",
        `server closed the connection: ${reason || "(no reason given)"}`,
      ),
    );
  });
  // 端末への問い合わせは取り除く（答えるのはサーバのミラーだけ。decisions D8）。
  const queries = new TerminalQueryFilter();
  let decoder = new TextDecoder();
  const show = (text: string): void => {
    const out = queries.filter(text);
    if (out !== "") term.write(out);
  };
  client.onSnapshot((snapPaneId, _cols, _rows, text) => {
    if (snapPaneId !== paneId || ended) return;
    // SNAPSHOT は画面の描き直し（流量制御からの再開でも届く）。前の出力の書きかけの列・文字を持ち越さない。
    queries.reset();
    decoder = new TextDecoder();
    show(text);
  });
  client.onOutput((outPaneId, chunk) => {
    if (outPaneId === paneId && !ended) show(decoder.decode(chunk, { stream: true }));
  });

  const keys = new AttachKeyFilter();
  const disposers: (() => void)[] = [];
  let rawMode = false;
  try {
    term.setRawMode(true);
    rawMode = true;
    term.write(ENTER_SCREEN);
    disposers.push(
      term.onInput((bytes) => {
        if (ended || detaching) return;
        const result = keys.feed(bytes);
        if (result.forward.byteLength > 0) client.sendInput(paneId, result.forward);
        if (result.detach) detach();
      }),
    );
    disposers.push(term.onSignal(detach));
    disposers.push(
      term.onResize(() => {
        if (ended) return;
        const now = term.size();
        const next = clampTerminalSize(now.cols, now.rows);
        // 奪われた後は not_attached になるが、それはイベントで分かるので無視する。
        client
          .request("pane.attach_resize", { paneId, cols: next.cols, rows: next.rows })
          .catch(() => undefined);
      }),
    );
    // 応答を待つ間に終わる（切断等）こともある——切断では待ち中の要求は reject されないので、終わりも一緒に待つ。
    await Promise.race([client.request("pane.subscribe", { paneId, scrollbackLines: 0 }), done]);
    await done;
  } finally {
    ended = true;
    for (const dispose of disposers) dispose();
    // 手元の端末が既に無い（SIGHUP 等）ときの失敗で、終わり方を変えない。
    try {
      term.write(RESTORE_SCREEN);
    } catch {
      // 書けなければ戻すものも無い。
    }
    try {
      if (rawMode) term.setRawMode(false);
    } catch {
      // 同上。
    }
  }
}
