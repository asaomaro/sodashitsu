# タスク: 06-docs-verify（docs・機能の扱いの一覧・性能の測定・確かめの手順）

## 実装方針

利用者向けの docs と、AC15（一覧）・AC16（3 環境の確かめ方）・AC17（性能）・AC4（SSH）・AC19（移行）の検証の材料を作る。親の統合 test で使う疑似端末の確かめのスクリプトもここで作る。

- `docs/tui.md`: 使い方（起動・切り離し・キー・マウス・設定・通知・複数ホスト・入れ子・tmux の中・外側の端末との衝突・SSH・Windows の注意〔WMI・`%LOCALAPPDATA%` の権限・止め方〕・ローカルログインの信頼の根拠〔手元の中継の後ろでは同じマシンの判定が効かない。02 の点検〕・設定の共有〔D3・D10〕・区別できないキー〔ESC ESC と ctrl+alt+[ 等〕）。
- `docs/tui-parity.md`: `research-inventory.md` を清書し、04/05 で実際に作ったものに合わせて「対応/読み替え/非対応（理由）」と検証した AC を各行に書く。`docs/herdr-parity.md` から参照する。
- `docs/migrate-from-wtm.md`・`AGENTS.md`・help: 引数なしの `soda` の変化（端末版の入口・端末が無ければ終了コード 2〔D11〕・`soda help`）。
- `docs/verification.md`: 端末版の確かめ方（design「対象の端末エミュレータ」の表）。
- `packages/tui/src/bench/`: 入力から描画までの遅延・16 pane・状態の反映の測定のスクリプト（AC17）。
- 疑似端末（node-pty）で `soda` を動かす確かめのスクリプト（親の統合 test 用。起動・描画・入力・切り離し・再接続・ブラウザ相当のクライアントとの同時接続）。

## 作業順序と依存関係

下の `依存:` に従う。

## リスク / 留意点

- 一覧（AC15）は実装と食い違いやすい。04/05 の review の結果を反映してから書く。
- 性能の測定は共有のマシンで重くしない（memory: 負荷テストは依頼時だけ）。1 回の短い測定にとどめ、busy loop・大量の繰り返しをしない。

## テスト方針

- docs は内部のリンクと、書いたコマンドを実際に 1 回ずつ打って確かめる。
- bench と疑似端末のスクリプトは親の統合 test で動かす。

## タスク

- [x] T1: `docs/tui.md`（使い方と注意）と help・`AGENTS.md` の案内
      対象: `docs/`（新規 `tui.md`）・`AGENTS.md`・`packages/server/src/cliArgs.ts`（USAGE）・`packages/server/src/main.ts`
      依存: なし
      AC: AC4, AC19
- [x] T2: `docs/tui-parity.md`（AC15 の一覧）と `docs/herdr-parity.md` からの参照
      対象: `.aidev/works/20260927-cli-mode/research-inventory.md`・`docs/herdr-parity.md`
      依存: なし
      AC: AC15
- [x] T3: `docs/migrate-from-wtm.md` と `docs/verification.md`（端末版の確かめ方）
      対象: `docs/migrate-from-wtm.md`・`docs/verification.md`
      依存: なし
      AC: AC16, AC19
- [x] T4: 性能の測定のスクリプト（`packages/tui/src/bench/`）
      対象: （新規 `packages/tui/src/bench/`）・`packages/tui/src/app/TuiApp.ts`
      依存: なし
      AC: AC17
- [x] T5: 疑似端末で `soda` を動かす確かめのスクリプト（親の統合 test 用）と `.aidev/config.yml` の smoke への追加
      対象: `.aidev/config.yml`（smokeCommands）・（新規 `scripts/` か `packages/tui/src/testing/`）
      依存: なし
      AC: AC1, AC3, AC4, AC11, AC12
