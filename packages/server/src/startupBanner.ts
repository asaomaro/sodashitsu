import { accessUrls, formatUrlHost } from "./util/net.js";

/** 起動時の表示の材料（`main.ts` が待ち受けに成功した後に集める）。 */
export interface StartupInfo {
  scheme: "http" | "https";
  host: string;
  port: number;
  /** `--origin`（`URL.origin` にそろえ済み）。 */
  extraOrigins: readonly string[];
  /** このマシンの LAN の IPv4（`NetworkInfo.lanAddresses()`）。 */
  lanAddresses: readonly string[];
  /** 今回作った token（作っていなければ `undefined`）。 */
  freshToken: string | undefined;
  /** 名前付き session で起動したときだけ（20260926-named-session）。 */
  session?: NamedSessionInfo | undefined;
  /** `--pane-history` で起動したときだけ、画面履歴の保存先（20260926-screen-history-replay）。 */
  paneHistoryPath?: string | undefined;
  /** 名前付き session の起動の記録のポートで待ち受けたときだけ true（20260926-named-session-ui の AC16）。 */
  portRemembered?: boolean | undefined;
}

/**
 * 起動の表示（`startupLines`）の最後の行の目印（「今だけ表示します」か「token を忘れた場合は」）。引数なしの `soda`（`launch/findOrStart.ts`）は、裏で起動した子の
 * `serve.out` にこの行が現れるまで準備完了とみなさない——`/ws` を受け付け始める（`listen()` の最後）のは表示より前なので、`/ws` だけを見ると token の行を
 * 書く前に読んで失う。表示の最後の行を変えたらここも変える（`startupBanner.test.ts` が両方を突き合わせる）。
 */
export const STARTUP_DONE_RE = /今だけ表示します\)|token を忘れた場合は/;

/**
 * 待ち受けに成功した後の表示（design「起動時の表示」・D101・D102・D103）。純関数（表示する行を返すだけ）。
 * - `soda: listening on <host> port <port> (<scheme>)`（URL の形にしない。端末がリンクにして開けない `0.0.0.0` を開かせない）。
 * - 開ける URL（`accessUrls`）ごとに `soda: open <URL>/`。token を作ったときだけ `#token=` を付ける。
 * - **URL が 1 つも組み立てられないとき（ゾーン付きの IPv6 の `--host` 等）も、作った token は必ず表示する**（以前は
 *   URL の組み立てが `Invalid URL` を投げ、token を一度も表示せずに終わっていた。D103）。
 */
export function startupLines(info: StartupInfo): string[] {
  const lines = [`soda: listening on ${formatUrlHost(info.host)} port ${info.port} (${info.scheme})`];
  if (info.session !== undefined) {
    lines.push(`soda: session ${info.session.name}（状態ディレクトリ: ${info.session.stateDir}）${info.session.fromEnv === true ? "（SODA_SESSION）" : ""}`);
    if (info.portRemembered === true) {
      lines.push(
        `soda: session ${info.session.name} が前回使ったポート ${info.port} で待ち受けています（別のポートにするには --port。次からはそのポートを使います）`,
      );
    }
  }
  if (info.paneHistoryPath !== undefined) {
    lines.push(`soda: 画面履歴を保存します（--pane-history）: ${info.paneHistoryPath}。pane の出力（秘密を含みうる）がディスクに残ります`);
  }
  const urls = accessUrls(info.scheme, info.host, info.port, info.lanAddresses, info.extraOrigins);
  if (urls.length === 0) {
    lines.push("soda: 開ける URL を表示できません（ゾーン付きの IPv6 アドレス等は URL にできません）。ブラウザで開く URL を --origin で渡すと、ここに表示します");
  }
  if (info.freshToken !== undefined) {
    if (urls.length === 0) {
      lines.push(`soda: token（今回作成）: ${info.freshToken}`);
      lines.push("soda: (token は今だけ表示します)");
    } else {
      for (const url of urls) lines.push(`soda: open ${url}/#token=${info.freshToken}`);
      lines.push("soda: (token 付きの URL は今だけ表示します)");
    }
  } else {
    for (const url of urls) lines.push(`soda: open ${url}/`);
    lines.push(`soda: token を忘れた場合は「${tokenResetCommand(info.session)}」で作り直せます`);
  }
  return lines;
}

/**
 * 作った token を、起動の表示（`startupLines`）で出せないまま終わるときの表示（「作った token は必ず一度表示される」。
 * D102・D103）。token は auth.json に保存済みで、次の起動では表示されない。起動の途中で終了のシグナルを受けたときも出す。
 */
export function lastChanceTokenLines(token: string, session?: NamedSessionInfo): string[] {
  return [
    `soda: token（今回作成・この表示が最後）: ${token}`,
    // 起動の失敗・表示の失敗・起動の途中の終了のシグナルのどれでも出すので、理由は問わない言い方にする。
    `soda: 起動を最後まで終えませんでしたが token は保存済みです。次の起動ではこの token でログインできます（失くしたら「${tokenResetCommand(session)}」で作り直せます）`,
  ];
}

/**
 * 起動した名前付き session。`stateDirBase` は利用者が `--state-dir` を渡したときだけ、その絶対パス（session はこれと名前の組で
 * 決まる。相対パスのままだと起動した場所でしか正しくない）。
 */
export interface NamedSessionInfo {
  name: string;
  stateDir: string;
  stateDirBase?: string | undefined;
  /** 名前を `SODA_SESSION` から選んだときだけ true（20260926-named-session-ui）。 */
  fromEnv?: boolean | undefined;
}

/** 名前付き session なら `--session`（と `--state-dir` を渡して起動したならその絶対パス）付き。付けないと別の session の token を作り直してしまう。 */
function tokenResetCommand(session: NamedSessionInfo | undefined): string {
  if (session === undefined) return "soda token reset";
  const dir = session.stateDirBase;
  return `soda token reset${dir === undefined ? "" : ` --state-dir ${shellQuote(dir)}`} --session ${session.name}`;
}

/** 案内に載せるパスの引用。展開されない単一引用符（bash・PowerShell の両方で文字どおり）。記号の無いパスは引用しない。 */
function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}
