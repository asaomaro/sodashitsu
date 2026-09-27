/**
 * 引数なしの `soda` が端末版へ渡す「繋ぎ先と認証の仕方」（20260927-cli-mode の architecture「インターフェース / データモデル」の `TuiTarget`）。
 * 端末版（`@sodashitsu/tui`）は server に依存しないので、サーバの発見・起動・ローカルログインの秘密の読み出しはここ（server）で済ませて渡す。
 * 03-tui-core で tui パッケージがこの形を持つようになったら、そちらの型へ寄せる（形は同じ）。
 */
export interface TuiTarget {
  /** `http(s)://127.0.0.1:<port>` など（`serve.json` の host が 0.0.0.0/:: なら 127.0.0.1）。 */
  baseUrl: string;
  /** Origin ヘッダ（サーバの検査を通る値）。 */
  origin: string;
  /** https のとき。指紋が一致した証明書だけ受ける。 */
  certSha256?: string | undefined;
  /** ローカルログインして cookie（`name=value`）を返す。最初の接続と 4401 の再ログインの両方。失敗は reject。 */
  login(): Promise<string>;
  /** `tui-state.json` を置く場所（名前付き session ならその session の状態ディレクトリ）。 */
  stateDir: string;
  /** 名前付き session の名前（表示用）。既定の session は undefined。 */
  session?: string | undefined;
  /** 初回の token など、画面に出す知らせ。 */
  startupNotice?: string | undefined;
  /** Windows の WMI 失敗時の注意など。 */
  stopHint?: string | undefined;
}

/** 端末版の入口（`import("@sodashitsu/tui").runTui` と同じ形）。終了コードを返す。 */
export type TuiEntry = (target: TuiTarget) => Promise<number>;
