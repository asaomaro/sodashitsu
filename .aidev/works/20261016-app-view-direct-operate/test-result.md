# 20261016-app-view-direct-operate: test-result

## 受け付ける操作（最終）
タブの切り替え（`tabDelta`・`tabIndex`）とワークスペースの切り替え（`workspaceDelta`・`workspaceIndex`）。ワークスペースは既定では `prefix+u` のあとの番号で届く。
作業画面⇄アプリ画面は、**既存のキー操作が無い**ので含めていない（タブ行のボタンをマウスで）。閉じる・分割・新規・送る（prefix 二度押し）・設定・コマンド・モードへ入る操作は効かない。

## モバイルの判断
A（操作中で始まる）は同じ。中継は同じ部品・同じ経路で、実キーボードの keydown が来たときだけ働く（来なければ何も起きない）ので「対象外」にはしていない。

## 負の対照（元に戻すと落ちる）
- 許可表に closeTab・closeWorkspace・split・newTab・settings を足す（単体 `prefixRelay.test.ts`）: 受けない操作 5 件 + 許可表の一覧が落ちる。
- 許可表に closeTab・split・newTab を足してビルド（E2E）: 「受けない操作」が `Expected: 0 Received: 1`（確認ダイアログ）、「偽の知らせ」が `Expected: 3 Received: 2`（タブが閉じた）で落ちる。
- `parkFocusAfterRelay` を外してビルド（E2E）: B-1 のみ落ちる（`Expected: false Received: true`、`terminalFocused`）。
- `direct` を常に偽にしてビルド（E2E）: A・Esc・［操作を終える］・B-1・受けない操作・偽の知らせ・モバイルの 7 件が落ちる（`[data-display-cover]` Expected 0 Received 1 など）。
- 単体: `script.html` の swallow を空に／`directOperable` から拡張の判定を外す: scriptHost の中継 1 件・components 1 件・DisplayFrameDirect の source 無し／builtin／形違い 3 件が落ちる。
- いずれも元に戻し、`cmp` で一致を確認、再ビルドして緑に戻した。

## 結果
- `pnpm build`・`pnpm typecheck` 通過。
- `pnpm test`: 10805 通過・4 件失敗。`agent.test.ts` の 1000ms（既知）。他の 3 件（GraphView・soda-statusline・perf）は全体実行の負荷による揺れで、単独実行では 109 件すべて通る。
- E2E `app-view-direct.spec.ts` 10 件、`display-script*`・`plugin-components`・`display-mount-scope`・`plugin-discovery` を含む 140 件: 137 通過・3 失敗。3 件（`display-script-engage` の覆いの試験、`display-script-noreturn` のつまみのドラッグ ×2）は **origin/main の同じビルドでも同じ 3 件が落ちる**（既存の失敗。この差分と無関係）。
- 独立レビュー（別コンテキスト）: 許可表の迂回・script.html の控え方・direct の範囲・後始末は問題なし。指摘 1（面の更新の再接続のたびに枠がフォーカスを奪う）は修正（初回だけ無条件、再接続は枠の外で打っているなら奪わない。単体を追加）。指摘 2（direct の FocusGuard が steal の守りを外す）は設計上の割り切り（承認した拡張のメイン画面のみ）。docs の限界に書いた。
- 副産物の修正: 面が設定の読み込みより先に届いた場合に中身を取りに行かず空のままになる不具合（`ensureContent` の監視に「枠を出してよいか」を足した）。アプリタブを開いたままブラウザを再読み込みすると再現する。

## レビュー修正（S1・S2・N3〜N5）
- S1: `guardRelayRun`（ダイアログ・グラフ・質問・承認が開いている間は中継の操作を実行しない）。ガードを外すと単体 `guardRelayRun` が落ち、戻すと通る。
- S2: 最初の接続でも、`modalOpen`／枠の外の入力欄（xterm は除く）なら奪わない。判定を外すと単体 S2 が落ち、戻すと通る。
- N3: direct の印・終了ボタンの title を実態に合わせた。N4: docs に keyup の注意。N1・N2: docs の限界に追記。
- N5: E2E の連打で、1 秒内の切り替え回数（aria-selected の変化）が 1〜5 であることを数える。
- 結果: web 単体 350 件通過、web typecheck 通過、build 通過、E2E app-view-direct（10）＋display-mount-scope（2）= 12 件通過。
