# requirements: e2e-fake-agent

## 背景
この機械の `~/.bashrc` は PATH の先頭へ `~/.local/bin`（実物の `claude`）を足し直す。pane のシェルは利用者の rc を読む（製品の既定）ので、PATH の先頭に偽の `claude` を置いて pane に `claude` と打ち込む試験は、実物の Claude Code を起動しうる（費用・枠・記録・結果が rc に左右される）。調べは `research.md`。

## 完了条件
- [x] AC1 試験の道具の 1 か所で、E2E のサーバの pane のシェルを、利用者の rc を読まないものにする（`packages/e2e/src/support/appServer.ts`。製品の既定は変えない）。
- [x] AC2 結合テストの、偽の agent を使うもの全部に、打ち込みの前の守り（pane で `command -v claude` が偽のものを指さなければ、打ち込まずに落とす）。共通の関数 `assertPaneResolvesFake`（`packages/server/src/testing/fakeAgentGuard.ts`。`testkit` から E2E にも公開）。
- [x] AC3 `composeServer.integration.test.ts` の偽の `claude` の試験は、HOME を一時にして rc を読ませない。
- [x] AC4 `graph-add.spec.ts` の偽の `claude` を、検出される形にする（`bash -c` の末尾の exec で名前が `sleep` になる問題）。守りを `boot()` に。
- [x] AC5 該当の試験を 1 本ずつ流して通る。結果が変わった試験は、記録する。
