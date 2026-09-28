/**
 * server → tui の受け渡しの形（20260927-cli-mode の architecture「インターフェース / データモデル」の `TuiTarget`）。
 * server の `launch/tuiTarget.ts` と同じ形（tui は server に依存しないので、ここにも同じ形を持つ）。
 */
export interface TuiTarget {
  /** `http(s)://127.0.0.1:<port>` など（`serve.json` の host が 0.0.0.0/:: なら 127.0.0.1）。 */
  baseUrl: string;
  /** Origin ヘッダ（サーバの検査を通る値）。 */
  origin: string;
  /** https のとき。指紋（`AA:BB:…`）が一致した証明書だけ受ける。 */
  certSha256?: string | undefined;
  /** ローカルログインして cookie（`name=value`）を返す。最初の接続と 4401/401 の再ログインの両方。失敗は reject。 */
  login(): Promise<string>;
  /**
   * サーバがまだ居るか（状態ディレクトリのロックの持ち主・`serve.json`・`local-auth.json` の pid が生きているか）。再接続の途中でログインできないときに、
   * 本当に止まったのか（終える）・入れ替えや起動の途中なのか（繋ぎ直しを続ける）を見分ける。無ければログインの失敗を「止まった」とみなす。
   */
  isServerAlive?(): Promise<boolean>;
  /** `tui-state.json` を置く場所。 */
  stateDir: string;
  /** 名前付き session の名前（表示用）。既定の session は undefined。 */
  session?: string | undefined;
  /** 初回の token など、画面に出す知らせ。 */
  startupNotice?: string | undefined;
  /** Windows の WMI 失敗時の注意など。 */
  stopHint?: string | undefined;
}

export type TuiSignal = "SIGINT" | "SIGTERM" | "SIGHUP";

/**
 * 外側の端末とプロセスの口（テストで差し替える。`packages/cli/src/commands/attach.ts` の `AttachTerminal` と同じ考え方）。
 * 本物は `app/processIo.ts` の `processIo()`。
 */
export interface TuiIo {
  /** stdin と stdout の両方が端末か。 */
  readonly isTTY: boolean;
  size(): { cols: number; rows: number };
  setRawMode(on: boolean): void;
  write(data: string): void;
  /** 解除する関数を返す（以下同じ）。 */
  onInput(cb: (bytes: Uint8Array) => void): () => void;
  onResize(cb: () => void): () => void;
  /** 終わらせるシグナル。どれも切り離しと同じに扱う。 */
  onSignal(cb: (signal: TuiSignal) => void): () => void;
  /** 捕まえていない例外・reject。モードを戻して終了コード 1 で終える。 */
  onFatal(cb: (err: unknown) => void): () => void;
  /** プロセスの終わり（最後の砦。同期でモードを戻す）。 */
  onExit(cb: () => void): () => void;
  /** 標準エラー（モードを戻した後の案内）。 */
  writeError(text: string): void;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: string;
}
