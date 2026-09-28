# タスク: 01-client-core（共有パッケージの新設と web からの移動）

## 実装方針

`packages/client-core`（`@sodashitsu/client-core`）を protocol と同じ形（`tsc -b` で `dist`・`main`/`types`）で作り、web の純粋な TS を**中身を変えずに** `git mv` で移す。
テストも一緒に移す。web は import の参照先を `@sodashitsu/client-core` に付け替えるだけ。挙動の不変は「移したテストと web の残りのテストが全部通る」ことで確かめる（AC19）。

- 移すもの（architecture「client-core」）: `keys/`（`KeyInputController.ts`・`KeyboardLockController.ts` を除く）、`notify/policy.ts`・`describe.ts`、
  `store/workspaceGrouping.ts`・`workspaceOrder.ts`・`paneName.ts`・`viewRepair.ts`・`agentOrder.ts`・`stateIndicator.ts`、`sidebar/rowLayout.ts`・`resolveRows.ts`、
  `tabbar/tabBarRight.ts`、`term/layoutOrder.ts`、`theme/themes.ts`・`uiTokens.ts`、`net/Connection.ts`・`ports.ts`・`clientError.ts`・`retryAfter.ts`・`InputGate.ts`・`machineUrl.ts`・`MachineSummaryClient.ts`。
- `store/seen.ts` の純粋な部分（`STATE_PRIORITY`・`displayStateFor`・`aggregate`・`sweepMarkSeen` と、それらが使う型）を client-core の `agent/agentState.ts` へ移し、web の `seen.ts` はそこから import する。
- `store/view.ts` の型 `AgentSort`・`WorkspaceSort` を client-core の `prefs/types.ts` へ移し、web の `view.ts` は import して再 export する（web の他の参照を壊さない）。
- client-core のディレクトリ: `keys/`・`agent/`・`workspace/`・`sidebar/`・`tabbar/`・`layout/`・`notify/`・`theme/`・`net/`・`prefs/`、入口 `index.ts`（公開名は変えない。同名が衝突したら衝突した方だけ別名にせず、個別のパスで export する＝`@sodashitsu/client-core/keys/...` の subpath exports）。
- client-core の tsconfig は `lib: ["ES2023"]`（DOM 無し）。`net/Connection.ts` の既定の WebSocket・fetch は `globalThis` から取り、型は `ports.ts` の最小の interface で受ける（architecture「client-core」）。型のために `@types/node` の globals が要るなら `types: ["node"]` を許す（組み込みモジュールの import はしない）。

## 作業順序と依存関係

下の `依存:` に従う。

## リスク / 留意点

- web は vite（bundler）と vue-tsc。workspace のパッケージは protocol と同じく `dist` を参照するので、`pnpm build` の順序（protocol → client-core → web）が効くことを確かめる。
- テストの中で web の他のモジュール（pinia の store 等）を import しているものは移せない。そのときはテストを web に残し、import 先だけ付け替える。
- 移すファイルの中に DOM の参照が見つかったら移さず、`decisions.md` に残す。

## テスト方針

- `pnpm build`・`pnpm typecheck`・`pnpm test`（vitest 全体。件数が移動の前後で同じ＝テストを落としていない）。
- `pnpm lint`（既存の赤は記録して区別）。

## タスク

- [x] T1: `packages/client-core` を作る（package.json・tsconfig・tsconfig.typecheck.json・index.ts）。protocol と同じ形。ルートの build/typecheck に入ることを確かめる
      対象: `packages/protocol/package.json`・`packages/protocol/tsconfig.json`（写す元）/ `packages/client-core/`（新規）
      依存: なし
      AC: AC19
- [x] T2: 純粋なモジュールとテストを `git mv` で client-core へ移し、`seen.ts` の純粋な関数を `agent/agentState.ts` へ、`AgentSort`・`WorkspaceSort` を `prefs/types.ts` へ分ける。client-core の中の相対 import を直す
      対象: 上の「移すもの」/ `packages/web/src/store/seen.ts:67-124`・`packages/web/src/store/view.ts:46-50`（research A10）
      依存: T1
      AC: AC19
- [x] T3: web の import を `@sodashitsu/client-core` に付け替え、`package.json`・tsconfig の references を足す。web の全テスト・vue-tsc・vite build を緑にする
      対象: `packages/web/src/**/*.ts`・`*.vue`（参照 105 箇所）・`packages/web/package.json`・`packages/web/tsconfig.json`
      依存: T2
      AC: AC19
