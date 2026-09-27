/**
 * PTY の master を読む stream（`tty.ReadStream`＝`net.Socket`）の読み取りを、libuv の handle の段で止める・再開する（20260926-live-handoff）。
 *
 * `Readable.pause()` だけでは、handle は内部の buffer が満ちるまで読み続け、読んだ分は stream の buffer に溜まる——execve をまたぐと
 * その分が失われる（カーネルの PTY から取り出し済みなので、新しい版からは読めない）。ここでは handle の `readStop()` で読み取りを止め、
 * 既に buffer に溜まった分は `read()` で取り出して（一時停止中の `read()` も `data` を出す）通常の受け手（ミラー）へ流し切る。
 * `_handle`・`reading`・`readStop`・`readStart` は Node の内部（`lib/net.js` の `tryReadStart`・`Socket.prototype.pause`）。
 * 無い版では false を返し、呼び出し側は引き継ぎを断る。
 */
interface StreamHandle {
  reading?: boolean;
  readStop?: () => number;
  readStart?: () => number;
}

export interface HandleBackedStream {
  pause(): unknown;
  read(): unknown;
  _handle?: StreamHandle | null;
}

function handleOf(stream: HandleBackedStream): Required<StreamHandle> | undefined {
  const h = stream._handle;
  if (h === null || h === undefined) return undefined;
  // 内部の印（`reading`）の形が変わった版では、止めたつもりで読み続けることになるので、止められないとみなす
  // （まだ一度も読み始めていない handle では印が無い＝`undefined`。`tryReadStart` が true にする）。
  if (
    typeof h.readStop !== "function" ||
    typeof h.readStart !== "function" ||
    (h.reading !== undefined && typeof h.reading !== "boolean")
  )
    return undefined;
  return h as Required<StreamHandle>;
}

/** 読み取りを止め、buffer に溜まっていた分を `data` として流し切る。止められなければ false（何も変えない）。 */
export function stopHandleReading(stream: HandleBackedStream): boolean {
  const h = handleOf(stream);
  if (h === undefined) return false;
  stream.pause();
  // 先に buffer を流し切る。`read()` は buffer が減ると `_read` → handle の `readStart` を呼びうるので、**止めるのはその後**
  // （逆の順だと、止めた handle を `read()` が再び読ませ、読んだ分が buffer に溜まって execve で失われる）。
  while (stream.read() !== null) {
    // `read()` が `data` を出す（受け手は TerminalHost のミラー）。
  }
  if (h.reading) {
    h.reading = false;
    h.readStop();
  }
  return true;
}

/** handle の読み取りを再開する（`Readable` の一時停止は解かない——呼び出し側が流量制御の状態を見て `resume` する）。 */
export function restartHandleReading(stream: HandleBackedStream): void {
  const h = handleOf(stream);
  if (h === undefined || h.reading) return;
  h.reading = true;
  h.readStart();
}
