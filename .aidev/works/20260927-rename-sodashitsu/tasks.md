# タスク: 製品名を Sodashitsu に改める と 一度きりの移行スクリプト

## 実装方針

- 先に改名（T1〜T3）を終えてビルド・型検査・テストを緑にし、その後で移行スクリプト（T4〜T7）と docs（T8）を足す。
  移行スクリプト・テスト・移行の docs は古い名前を意図して含むので、置換の**後**に書く（design「置換の順序」）。
- 置換は scratchpad の使い捨ての Python（`scratchpad/rename.py`）で一度に当てる。リポジトリには残さない。

## 作業順序と依存関係

- 下の `依存:` に従う。T1 の置換が一度きりの操作なので、T1 の前に移行のファイルを `scripts/` に置かない。

## リスク / 留意点

- 一律の置換が意味を壊す箇所（F1.3）: `.wtm/worktrees` は置換の順序で先に扱う。lock は置換しない。
- パッケージ名を変えると `node_modules` の workspace のリンクが変わる → `pnpm install` が要る（T3）。ネットワークが無ければ `--offline` を試す。
- 移行スクリプトのテストが利用者の本物の状態に触れる危険 → 環境を一から組み、`process.env` を広げない（design「テスト」）。
- 既存のファイルの多くは prettier で未整形 → 新規ファイルにだけ `prettier --write`。

## テスト方針

- 改名: `pnpm -s build`・`pnpm -s typecheck`・`pnpm -s test` を終了コードで確かめる（T3 で一度、T4〜T8 の後に T11 でもう一度）。`aidev smoke`。E2E は走らせない。最後の `git grep` の当たりを分類する（AC5）。
- 移行スクリプト: `scripts/migrate-from-wtm.test.ts`（vitest から sh を起動・一時的な根）。負の対照は安全の検査の行を 1 行ずつ壊す変異で確かめ、生の出力を
  `test-result.md` に残し、`cmp` で元に戻ったことを確かめる。`.bat` は読み合わせ（AC18）で、項目ごとの対応を `test-result.md` に表で残す。

## タスク

- [x] T1: 一律の置換（design「置換の順序」）と、`git mv docs/wtmctl.md docs/sodactl.md`・`git mv packages/cli/skills/wtmctl packages/cli/skills/sodactl`
      対象: `git ls-files`（`.aidev/works/`・`pnpm-lock.yaml` を除く）/ 根拠: research F1.1〜F1.3・F1.6
      依存: なし
      AC: AC1, AC2, AC3, AC4
- [x] T2: 表示名の手直し（ページのタイトル・`documentTitle` とそのテスト・LICENSE・NOTICE・AGENTS.md・docs の冒頭・skill の説明）
      対象: `packages/web/index.html:6`・`packages/web/src/serverSession/documentTitle.ts`・`documentTitle.test.ts`・`LICENSE:3`・`NOTICE:1-2`・`AGENTS.md`・`docs/*.md`・`packages/cli/skills/sodactl/SKILL.md:3` / 根拠: research F1.4・F1.5・A8
      依存: T1
      AC: AC3, AC4
- [x] T3: `pnpm install` で lock を作り直し、`pnpm -s build`・`pnpm -s typecheck`・`pnpm -s test` を通す（置換で壊れた所を直す）
      対象: `pnpm-lock.yaml`・置換の結果のすべて / 根拠: research F1.3
      依存: T1, T2
      AC: AC1, AC16
- [x] T4: 移行スクリプト（sh）
      対象: `scripts/migrate-from-wtm.sh`（新規）/ 根拠: research A1〜A6・F2〜F6・design「インターフェース」
      依存: T3
      AC: AC6, AC7, AC8, AC9, AC10, AC11, AC12, AC13
- [x] T5: 移行スクリプトの統合テスト（vitest から sh）と vitest の project
      対象: `scripts/migrate-from-wtm.test.ts`・`scripts/vitest.config.ts`（新規）・`vitest.config.ts:11` / 根拠: research A11・design「テスト」
      依存: T4
      AC: AC6, AC7, AC8, AC9, AC10, AC11, AC12, AC13
- [x] T6: 負の対照（安全の検査の行を 1 行ずつ壊す変異・生の出力・`cmp` で復元）
      対象: `scripts/migrate-from-wtm.sh` の、動いているサーバの検査（design「動いているサーバの判定（検査 1）」）と、移動先・バックアップの検査と断る分岐（design「計画の項目」の断る条件）の行。関数の名前は T4 で決まる / 根拠: design「AC14」
      依存: T5
      AC: AC14
- [x] T7: 移行スクリプト（bat）。書いた後、`.sh` と項目ごとに読み合わせた対応の表を `test-result.md` に残す（design「AC18」）
      対象: `scripts/migrate-from-wtm.bat`（新規）/ 根拠: design「`scripts/migrate-from-wtm.bat`」
      依存: T4
      AC: AC18
- [x] T8: 移行の docs（日本語）と、AGENTS.md・docs からの案内
      対象: `docs/migrate-from-wtm.md`（新規）・`AGENTS.md`（docs の一覧の行）・`docs/sodactl.md`（skill を入れ直す手順から移行の docs への案内）/ 根拠: design「振る舞いの詳細」・research F7
      依存: T4, T7
      AC: AC15
- [x] T9: 最後の `git grep -i -E 'wtm|web-tn-multiplexer' -- ':!.aidev/works'` の当たりの分類（残してよいものだけか）
      対象: `.aidev/works/**` を除くリポジトリ全体 / 根拠: design「AC5」
      依存: T1, T2, T3, T4, T5, T7, T8
      AC: AC5
- [x] T10: 起動確認（`aidev smoke`）——test 工程で消化する（decisions D4）
      対象: `.aidev/config.yml` `smokeCommands` / 根拠: research A10
      依存: T3
      AC: AC17
- [x] T11: T4〜T8 の後に `pnpm -s build`・`pnpm -s typecheck`・`pnpm -s test` をもう一度通す（`scripts` の vitest の project を含む）
      対象: リポジトリ全体 / 根拠: design「AC16」
      依存: T5, T6, T7, T8
      AC: AC16
