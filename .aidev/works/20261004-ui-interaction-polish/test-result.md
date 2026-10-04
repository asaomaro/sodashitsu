# テスト結果: ui-interaction-polish（境目の見た目・ドラッグ・区画の折りたたみ）

対象: `feature/ui-interaction-polish` の HEAD（9c2957a）。合格の根拠にした実行は **Node v24.15.0**。

## 実行したもの

- `pnpm build`・`pnpm typecheck` — 終了コード 0。
- `pnpm test`（全体）— 407 ファイル中、落ちたのは `server/src/tui.integration.test.ts`「端末版 2 つを同時に繋ぐ」の 1 件だけ（実装直後・レビュー修正後の 2 回とも）。worktree のフォルダ名が長いと、期待する文字列が 1 行に収まらず画面に出ないための環境の問題で、**main を同じ長さのフォルダ名の worktree に置いても同じ 1 件が 2 回落ちる**ことを確かめた（この work の退行ではない）。レビュー修正後の 1 回は `composeServer.lineage.integration.test.ts` の 1 件も落ちたが、単独で流すと 11 件通る（負荷による揺れ）。
- 最後の修正（`useResizeDrag` のしきい値）の後: web の単体 2488 件すべて通る。
- 起動確認（`aidev smoke`。作業フォルダの外の worktree）— 初回は smoke(web) の `.xterm-helper-textarea` のクリックで落ちた。原因は xterm の不可視の補助要素が画面の上へ 18px はみ出していて、その中心（画面の外）を押していたこと（製品の退行ではない。実測は decisions.md D4）。実際に押す `.xterm-screen` を押す形に直し、**2 回とも通過（10 本）**。
- E2E（この work の新しい spec `resize-handles`（境目 3 か所）・`sidebar-sections`（区画）と、期待を変えた `keys-mouse-dialogs`・`workspace-tab-pane` の溢れの件）— 最後に `resize-handles`・`sidebar-sections` の 21 件が通る。review ラウンド 1 の直しの後は、関係する 4 spec で 43 件通過・1 件失敗（失敗は `workspace-tab-pane.spec.ts`「新しい pane を作る操作の直後に打った文字…（D99）」で、**main でも作業ブランチでも各 2 回同じ失敗**する既知のもの）。
- `pnpm lint` — main と同じ 22 errors（この work のファイルのものは無い）。
- 壊して落ちる確認（`regression-negative-control`）— T1〜T13・cross・レビュー修正の 10 変異・しきい値の 1 変異の生の出力を `review.md` に残した。

## 受け入れ基準

`design.md`「受け入れ基準との対応」の AC1〜AC21・AC-I1〜I5 は、実装セッションの点検（`aidev coverage`: ac=19・gaps=0）と review ラウンド 1・2 の独立レビューで、実装・テストとの対応を 1 つずつ確かめた。E2E の穴（AC1・AC2 後半・AC10・AC17・AC20）はレビューの指摘で埋めた。

## 未検証の穴

- 実機でしか見られない項目（17 テーマの線の見え方・タッチ・OS の「動きを減らす」・端末版の `▾`／`▸` の桁）— `docs/verification.md` に手順を書いた。自動では未確認。
- Chromium 以外のブラウザ・実機のスマートフォン。
- 他マシンの件数の分岐の単体テストが薄い（cross で許容と判断）。
- E2E 全体の既知の失敗（main でも同じ）は、この work のファイルでは見ていない。
