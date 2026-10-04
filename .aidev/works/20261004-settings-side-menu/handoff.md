# 引き継ぎ: settings-side-menu の実装（coding 工程）

あなたは、この作業の **coding 工程だけ**を担当する実装のセッションです。要件・調査・設計・タスク分解は済んでいて、承認済みです。test・review・deliver は別のセッション（依頼元）が行います。

## やること

1. aidev の coding 工程（skill `aidev-40-coding`）を、この work（`20261004-settings-side-menu`。mode は autonomous・profile は full）で実行する。`tasks.md` の T1〜T10（順は `依存:` に従う） を、`依存:` の順に 1 つずつ消化する（既定は直列）。
2. タスクごとに: 実装 → テスト → 壊して落ちる確認 → **独立点検**（`aidev taskcheck start <T> --mode delegated` → 別のコンテキスト〔サブエージェント〕にそのタスクの差分だけを点検させる → `aidev taskcheck report <T> --findings <n>` → 指摘を直す）→ `tasks.md` にチェック → コミット。全タスクの後に `aidev taskcheck start cross` の点検を 1 回。
3. 全部終わったら `aidev approve coding` を打ち、**そこで止まる**（test 工程へ進まない）。最後に、やったこと・テストの結果・残った懸念・`decisions.md` に足した判断を短く報告する。

## 読む順

`requirements.md` → `research.md` → `design.md` → `decisions.md` → `tasks.md`（すべて `.aidev/works/20261004-settings-side-menu/`）、条項 `.aidev/conventions/e2e-observe-browser.md`・`regression-negative-control.md`、`AGENTS.md`。

## 環境

- 作業フォルダは **`/workspaces/sodashitsu-wt/settings-side-menu`**（git worktree。ブランチ `feature/settings-side-menu`）。`/workspaces/sodashitsu` と `/workspaces/sodashitsu-wt/` のほかのフォルダは別の作業なので、触らない。最初に `corepack pnpm install` と `corepack pnpm build` が要る。
- `pnpm` は PATH に無い。`corepack pnpm` を使う（または `/usr/lib/node_modules/corepack/shims/pnpm`）。Node は 24 が要る: `export PATH="$HOME/.local/share/fnm/node-versions/v24.15.0/installation/bin:$PATH"`（既定の Node 20 では一部のテストが落ちる）。
- aidev の CLI は `~/.claude/skills/aidev-docs/bin/aidev`（リポジトリの中には無い）。`.aidev/current` は設定済み。
- コマンド: `pnpm build`、`pnpm typecheck`、`pnpm test`（リポジトリ直下。vitest の projects）、パッケージを絞るなら `pnpm --filter @sodashitsu/<name> exec vitest run <path>`。E2E は `pnpm build` の後に `cd packages/e2e && pnpm exec playwright test src/specs/<spec>`（spec ごとに自分のサーバを空きポートで立てる）。
- **パッケージ間の import は `dist` 経由**。`protocol`・`client-core` を変えたら `pnpm build` してから下流を見る。server は tui を参照するので、tui の型エラーは server のビルドと E2E を止める。
- **動いている 7780 のサーバ（利用者の `soda`）に触れない**（止めない・テストから繋がない・状態ディレクトリを使わない）。テストは自前の一時の状態ディレクトリと空きポートを使う。`bin/soda`・`bin/sodactl` を、利用者のサーバに向けて実行しない。
- 既知の、この作業と関係ない失敗: `pnpm lint` の 22 errors と、E2E 全体の 18 件（設定・テーマ・キー割り当て等）は `main` でも同じ。

## 決まり

- コミットはタスクごと。自分が変えたファイルだけを `git add <パス>`（`git add -A` は使わない）。メッセージは Conventional Commits・日本語で、末尾に空行のあと `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`。**push と PR はしない。**
- 文書・コメントは日本語で、既存の文体に合わせる。コードは周りの書き方（コメントの密度・名前の付け方）に合わせる。
- 元から prettier が通らないファイルに `--write` を当てない（差分が膨らむ）。
- 触らない範囲: 設定の節の中身（別の作業 `subagent-display` が「エージェント連携」の節を変える）、`KeySettings.vue`（コメント 1 行を除く）、スクロールの入れ物（`<dialog>` 自身のまま）。

## 止まって知らせる条件

次のときは、作業を止めて状況を報告する（依頼元のセッションが `sodactl agent read` で読む）。

- design と食い違う事実を見つけて、設計の判断が要るとき（例: grid にすると題名の行・下の帯の固定が崩れる／既存の E2E が、期待を変えないと通らない）。
- 独立点検が上限（2 回）で止まり、[must] が残ったとき。
- タスクの `依存:` の順では、ビルドが通る状態を保てないと分かったとき。
