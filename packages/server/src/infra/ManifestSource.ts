/** 判定ルール（herdr の TOML）のファイルアクセスを抽象化する口（architecture.md「infra/*」）。 */
export interface ManifestSource {
  /** 読み込めるファイル名の一覧（拡張子を含む。例 `claude.toml`）。 */
  list(): Promise<string[]>;
  read(name: string): Promise<string>;
  /** ログに載せる、置き場所の説明（例 ディレクトリのパス）。無くてよい。 */
  describe?(): string;
}
