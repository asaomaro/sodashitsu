import type { Terminal } from "@xterm/xterm";

/**
 * ブラウザ側の xterm.js が、端末アプリからの問い合わせに誤って応答しないよう握りつぶす（D17）。
 * 応答はサーバのミラー（`packages/server/src/terminal/Mirror.ts`）だけが行う——ブラウザが同じ問い合わせに
 * 答えると、ブラウザの台数ぶん応答が重複して PTY に届く。サーバの Mirror.ts と対になる（design「ブラウザ側
 * での問い合わせの握りつぶし」）。
 *
 * 色の問い合わせ（OSC 4/10/11/12）は、実際に色を**設定する** OSC（`?` を含まない）とは区別する
 * （Mirror.ts の `handleColorQuery`/`handlePaletteQuery` と同じ判定）。設定の OSC まで握りつぶすと、
 * 端末アプリが独自パレットを指定しても画面に反映されなくなる。
 */
export function installQueryFilter(term: Terminal): void {
  const swallow = (): boolean => true;
  const parser = term.parser;

  // DA1（CSI c）・DA2（CSI > c）・DSR 5 / CPR（CSI n）・DECRQM（CSI ? Ps $ p）・XTVERSION（CSI > q）。
  parser.registerCsiHandler({ final: "c" }, swallow);
  parser.registerCsiHandler({ prefix: ">", final: "c" }, swallow);
  parser.registerCsiHandler({ final: "n" }, swallow);
  parser.registerCsiHandler({ prefix: "?", intermediates: "$", final: "p" }, swallow);
  parser.registerCsiHandler({ prefix: ">", final: "q" }, swallow);

  // XTSMGRAPHICS（CSI ? Pi ; Pa ; Pv S）。画像の addon（`imageAddon.ts`）が答えるので握りつぶす（20260926-kitty-graphics D4・D8）。
  // 設定の操作（Pa=2・3。Sixel のパレットの上限を変える）も一緒に捨てる——サーバのミラーは答えないので交渉の相手がおらず、捨てておけば
  // 後から接続したブラウザとも addon の状態がそろう。この登録は addon の読み込みより後でなければ効かない（`TerminalRegistry.create` の順序）。
  parser.registerCsiHandler({ prefix: "?", final: "S" }, swallow);

  // DECRQSS（DCS $ q … ST）。
  parser.registerDcsHandler({ intermediates: "$", final: "q" }, swallow);

  // 色の問い合わせだけを握りつぶす（`?` を含まない実際の設定 OSC は関与しない。Mirror.ts と同じ判定）。
  parser.registerOscHandler(10, isColorQuery);
  parser.registerOscHandler(11, isColorQuery);
  parser.registerOscHandler(12, isColorQuery);
  parser.registerOscHandler(4, isPaletteQuery);
}

/** OSC 10/11/12 の本体が問い合わせ（`?`）か（Mirror.ts の `handleColorQuery` と同じ判定）。 */
export function isColorQuery(data: string): boolean {
  return data === "?";
}

/** OSC 4 の本体（`"<idx>;?"` の繰り返し）に問い合わせが 1 組でも含まれるか。 */
export function isPaletteQuery(data: string): boolean {
  const parts = data.split(";");
  for (let i = 1; i < parts.length; i += 2) {
    if (parts[i] === "?") return true;
  }
  return false;
}
