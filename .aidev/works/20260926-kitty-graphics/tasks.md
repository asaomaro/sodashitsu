# タスク: 端末内の画像表示（Kitty graphics。herdr H13）

## 実装方針

design の「振る舞いの詳細」を、下から順に積む。純粋な部品（基準のセル・PNG・翻訳器）を先に作って単体テストで固め、
次にサーバの組み込み（`TerminalHost`・ミラー・PTY の画素）、並行してブラウザ（addon と握りつぶし）、最後に docs と backlog。

## 作業順序と依存関係

- 下の `依存:` に従う。各タスクの負の確認（変異で壊してテストが落ちること）はそのタスクの中で行う。T2（翻訳器）が最も不確実（状態機械と応答の規則）なので、T1 の直後に着手し、変異による負の確認で固める。
- T6・T7（ブラウザ）はサーバと独立。addon を jsdom/happy-dom で読み込めるかを最初に確かめる（読み込めなければ注入の差し替えだけでテストする）。

## リスク / 留意点

- ブラウザでの実際の描画（canvas・WebGL との重ね）は E2E を走らせない指示のため確かめられない。test-result の未検証の穴に書く。
- ミラーのハンドラ・翻訳器で投げると出力が止まる。翻訳器は内部の例外を全て握ってエラーの応答にする（T2 でテストする）。
- `png.ts` の `encodePng` は `deflateSync` を主スレッドで呼ぶ。上限（D5）で 1 枚の大きさを抑える。
- 既存のテストの偽の PTY は `resize()` を引数なしで実装している（`packages/server/src/terminal/TerminalHost.test.ts` の `FakePty`）。第 3 引数を足しても型は通る（引数の少ない関数は代入できる）。

## テスト方針

- 単体: `png.ts`（作った PNG を検査で読み直す・壊れた PNG を弾く）、`KittyGraphicsTranslator`（出力の読み分け・分割の境目・応答の規則・上限・転送方法の拒否・表示の文字列・内部の例外で投げないこと）、
  ミラー（`CSI 14/16 t`）、`QueryFilter`（`XTSMGRAPHICS`）、`imageAddon`（設定値）、`TerminalRegistry`（addon の読み込みと握りつぶしの順序）。
- 結合: `TerminalHost`（偽の PTY → 実物の headless ミラー。区切りごとの配信・応答の順序・resize の画素）、`NodePtyBackend`（実 PTY の画素）。
- 負の確認: `.aidev/conventions/regression-negative-control.md` に従い、翻訳器・ミラー・握りつぶし・`TerminalHost` の組み込みを行・記号ごとに壊して、テストが落ちることを確かめる
  （生のログはファイルに残し、元へは `cmp` で戻したことを確かめる）。
- 全体: `pnpm -s build`・`pnpm -s typecheck`・`pnpm -s test`・`aidev smoke`。E2E と負荷試験は行わない（利用者の指示）。

## タスク

- [x] T1: 基準のセルの大きさ（`cellPixels.ts`）と PNG の部品（`png.ts`：`isPng`・`pngSize`・`encodePng`）を作り、単体テストと負の確認を行う
      対象: `packages/server/src/terminal/cellPixels.ts`（新規）・`packages/server/src/terminal/png.ts`（新規） / 根拠: design「インターフェース」
      依存: なし
      AC: AC2, AC8
- [x] T2: `KittyGraphicsTranslator` を作る（出力の読み分け・分割送信・コマンドの解釈・応答・保存・表示の文字列・上限・内部の例外を握る）。単体テストと負の確認を行う
      対象: `packages/server/src/terminal/KittyGraphics.ts`（新規） / 根拠: design「振る舞いの詳細」1〜3・decisions D5・D7
      依存: T1
      AC: AC1, AC2, AC3, AC4, AC5, AC9, AC10, AC11, AC12
- [x] T3: ミラーが `CSI 14 t`・`CSI 16 t` に基準のセルの大きさで答える。単体テストと負の確認を行う
      対象: `packages/server/src/terminal/Mirror.ts` `XtermMirror` のコンストラクタ（research A2）
      依存: T1
      AC: AC8
- [x] T4: PTY の画素の大きさ（`PtyProcess.resize` の第 3 引数・`NodePtyBackend.resize`・`TerminalHost.resize` が `windowPixels` を渡す）。テストと負の確認を行う
      対象: `packages/server/src/pty/PtyBackend.ts:19`・`packages/server/src/pty/NodePtyBackend.ts:48`・`packages/server/src/terminal/TerminalHost.ts` `resize`（research A3）
      依存: T1
      AC: AC8
- [x] T5: `TerminalHost` で出力を翻訳器に通す（区切りごとにミラーと配信へ渡す・応答をミラーの処理の後に PTY へ返す・dispose）。結合テストと負の確認を行う
      対象: `packages/server/src/terminal/TerminalHost.ts` コンストラクタの `pty.onData`・`dispose`（research A1）
      依存: T2, T4
      AC: AC1, AC3, AC7, AC12
- [x] T6: ブラウザに `@xterm/addon-image` 0.9.0 を足し（`imageAddon.ts`・`IMAGE_ADDON_OPTIONS`）、`TerminalRegistry.create` で読み込んで握りつぶしを後に移す。テストと負の確認を行う
      対象: `packages/web/package.json`・`pnpm-lock.yaml`・`packages/web/src/term/imageAddon.ts`（新規）・`packages/web/src/term/TerminalRegistry.ts:201-218` `create`（research A4）
      依存: なし
      AC: AC6, AC10
- [x] T7: `installQueryFilter` に `XTSMGRAPHICS`（`CSI ? … S`）の握りつぶしを足す。テストと負の確認を行う
      対象: `packages/web/src/term/QueryFilter.ts:13`（research A5）
      依存: なし
      AC: AC6
- [x] T8: docs と backlog（`docs/herdr-parity.md` H13 の行・未検証の項、backlog に後続の `[ ]` 行）
      対象: `docs/herdr-parity.md:36`・`.aidev/backlog/product-roadmap.md`
      依存: T3, T5, T6, T7
      AC: AC14
- [x] T9: 全体の検証（build・typecheck・全体のテスト・smoke）。coding の最後に 1 回通し、test 工程でもう一度通す
      対象: リポジトリ全体（`pnpm -s build`・`pnpm -s typecheck`・`pnpm -s test`・`aidev smoke`）
      依存: T8
      AC: AC13
