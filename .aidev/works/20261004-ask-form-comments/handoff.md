# 引き継ぎ: ask-form-comments の実装（coding 工程）

あなたは、この作業の **coding 工程だけ**を担当する実装のセッションです。要件・設計・タスク分解は済んでいて、承認済みです。test・review・deliver は別のセッション（依頼元）が行います。

## やること

1. aidev の coding 工程（skill `aidev-40-coding`）を、この work（`20261004-ask-form-comments`。mode は autonomous・profile は full）で実行する。`tasks.md` の T1〜T10 を、`依存:` の順に 1 つずつ消化する。
2. タスクごとに: 実装 → テスト → 壊して落ちる確認 → **独立点検**（`aidev taskcheck start <T> --mode delegated` → 別のコンテキスト〔サブエージェント〕に差分だけを点検させる → `aidev taskcheck report <T> --findings <n>` → 指摘を直す）→ `tasks.md` にチェック → コミット。全タスクの後に `aidev taskcheck start cross` の点検を 1 回。
3. 全部終わったら `aidev approve coding` を打ち、**そこで止まる**（test 工程へ進まない）。最後に、やったこと・テストの結果・残った懸念・`decisions.md` に足した判断を短く報告する。

## 読む順

`requirements.md` → `design.md` → `decisions.md` → `tasks.md`（すべて `.aidev/works/20261004-ask-form-comments/`）、条項 `.aidev/conventions/e2e-observe-browser.md`・`regression-negative-control.md`、`AGENTS.md`、`third_party/ask-form/README.md`。

## 環境

- 作業フォルダは **`/workspaces/sodashitsu-wt/ask-form-comments`**（git worktree。ブランチ `feature/ask-form-comments`）。`/workspaces/sodashitsu` と `/workspaces/sodashitsu-wt/` のほかのフォルダは別の作業なので、触らない。
- `node_modules` が無い。最初に `pnpm install` をする。
- `pnpm` は PATH に無い。`corepack pnpm` を使う（または `/usr/lib/node_modules/corepack/shims/pnpm`）。Node は 24 が要る: `export PATH="$HOME/.local/share/fnm/node-versions/v24.15.0/installation/bin:$PATH"`（既定の Node 20 では一部のテストが落ちる）。
- aidev の CLI は `~/.claude/skills/aidev-docs/bin/aidev`（リポジトリの中には無い）。`.aidev/current` は設定済み。
- コマンド: `pnpm build`、`pnpm typecheck`、`pnpm test`（リポジトリ直下。vitest）、パッケージを絞るなら `pnpm --filter @sodashitsu/<name> exec vitest run <path>`。E2E は `pnpm build` の後に `cd packages/e2e && pnpm exec playwright test src/specs/<spec>`（spec ごとに自分のサーバを空きポートで立てる）。
- public_docs は `/workspaces/public_docs`。別のブランチで未コミットの変更があるので、**読むだけ**（`git -C /workspaces/public_docs show／diff`）。チェックアウト・書き込みをしない。
- **動いている 7780 のサーバ（利用者の `soda`）に触れない**（止めない・テストから繋がない・状態ディレクトリを使わない）。テストは自前の一時の状態ディレクトリと空きポートを使う。
- 既知の、この作業と関係ない失敗: `pnpm lint` の 22 errors と、E2E 全体の 18 件（設定・テーマ・キー割り当て等）は `main` でも同じ。ask 関連の E2E は全部通るのが正しい。

## 決まり

- コミットはタスクごと。自分が変えたファイルだけを `git add <パス>`（`git add -A` は使わない）。メッセージは Conventional Commits・日本語で、末尾に空行のあと `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`。**push と PR はしない。**
- 文書は日本語で、既存の文体に合わせる。
- 部品（`third_party/ask-form/`）は手で直さない。prettier・eslint も当てない。
- 元から prettier が通らないファイルに `--write` を当てない（差分が膨らむ）。

## 止まって知らせる条件

次のときは、作業を止めて状況を報告する（依頼元のセッションが `sodactl agent read` で読む）。

- 製品コードを変えない見込みの T6 で、変更が要ると分かったとき。
- 部品（`ask-form.js`）に不具合を見つけたとき（直さず、再現の手順を書く）。
- design と食い違う事実を見つけて、設計の判断が要るとき。
- 独立点検が上限（2 回）で止まり、[must] が残ったとき。
