# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）
- [must][conv:-] packages/protocol/src/ask.ts `normalizeAskSpec` が `toString` を持つオブジェクトの `value`・`default`・`showIf` の値で例外を投げる（`String()` の呼び出し） / 対応: 修正済（T1・ラウンド1。文字列・数・真偽だけを `String()` にし、ほかは誤り／捨てる）
- [should][conv:-] packages/protocol/src/ask.ts `checkAskAnswer`・`askVisible` が `in`・素のオブジェクトで判定し、`constructor` 等の継承されたキー名を未知の id として断れず、そういう id の質問を誤って弾く / 対応: 修正済（T1・ラウンド1。`Object.hasOwn`・`Map`）
- [should][conv:-] packages/protocol/src/ask.ts id・`showIf` のキーが `__proto__` のとき辞書への代入がプロトタイプの差し替えになり、条件が消える・答えられない質問になる / 対応: 修正済（T1・ラウンド1。`__proto__` の id・キーは誤り）
- [nit][conv:-] packages/protocol/src/ask.ts `showIf: null`・`[]` を ask-form は通すが拒否していた / 対応: 修正済（T1・ラウンド1。無いものとして扱う）
- [should][conv:-] packages/server/src/ask/AskService.ts 購読の後に kind が `external` に変わった接続が購読者に数えられたまま `ask.get`・`ask.answer` できる・`open` が待ってしまう / 対応: 修正済（T3・ラウンド1。`require`・`cancel`・`open` の数で `isBrowserKind` を再確認）。hello 前の接続は既定で desktop のため、hello 前に `ask.subscribe` する external は防げない（同じ認証・同じ権限の接続なので許容。decisions D6）
- [nit][conv:-] packages/server/src/ask/AskService.ts `close()` が `ask.closed` の配布を `resolve` の前に行い、購読者の例外で応答が返らなくなりうる / 対応: 修正済（T3・ラウンド1。`resolve` を先に・配布は例外を握る）
- [nit][conv:-] packages/cli/src/commands/ask.ts 標準入力が BOM つきの JSON だと「not valid JSON」で弾かれる / 対応: 修正済（T4・ラウンド1。先頭の BOM を読み飛ばす）
- [nit][conv:-] packages/cli/src/commands/ask.ts 壊れた標準入力（error）が素の Error で終了コード 1 になる / 対応: 修正済（T4・ラウンド1。使い方の誤り＝終了コード 2）
- [should][conv:-] packages/web/src/components/AskDialog.vue 前の質問でネイティブに閉じられた後、次の質問に替わっても `showModal()` を呼ばず、見えない質問に `view.askOpen` だけが残りキーが端末へ流れなくなる / 対応: 修正済（T8・ラウンド1。質問が替わるたび開いていなければ開き直し、askOpen を立て直す）
- [should][conv:-] packages/web/src/components/AskDialog.vue 即確定の判定が `click.detail > 0` で、選択肢が `<label>` のカードなので転送された合成 click では 0 になり、カードの文字をクリックしても確定しない恐れ / 対応: 修正済（T8・ラウンド1。`pointerdown`・`keydown` の新しいほうで直前の操作を覚え、`change` で判定。E2E で実ブラウザの label クリックを確かめる）
- [nit][conv:-] packages/web/src/components/AskDialog.vue dialog の keydown が、Teleport で中へ移されたトーストのキーでも Ctrl+Enter で決定してしまう / 対応: 修正済（T8・ラウンド1。質問の部品の中のキーだけ扱う）
- [should][conv:-] packages/web/src/store/StoreAdapter.ts 質問のフォームだけが開いている間、焦点の pane が閉じられても `applyViewRepair` が戻り先を直さず、閉じた後も存在しない pane が焦点のまま残る / 対応: 修正済（T9・ラウンド1。`view.preAskFocusPaneId`・`retargetPreAskFocus` を足し、閉じたとき反映）
- [should][conv:-] packages/web/src/notify/NotificationController.ts `#focusEntry` が質問のフォームを知らず、通知から別 tab の pane へ移った後に閉じると表示中の tab にない pane が焦点のまま残る / 対応: 修正済（cross・ラウンド1。`retargetPreAskFocus`）
- [should][conv:-] packages/protocol/src/messages.ts 回答の zod が id を UTF-16 の 200 で切り、定義の検査はコードポイントなので、絵文字の id の質問は答えられない / 対応: 修正済（cross・ラウンド1。UTF-16 の余裕つき）
- [should][conv:-] packages/protocol/src/ask.ts `text` の `default` が回答の上限を超えても通り、触らずに決定すると送れない / 対応: 修正済（cross・ラウンド1。誤りにする）
- [should][conv:-] docs/sodactl.md 「端末版も ask.subscribe できる」が実装と食い違う / 対応: 修正済（cross・ラウンド1）
- [nit][conv:-] docs/sodactl.md・SKILL.md 検査の理由の例外（id の重複）・`--machine local` の表記 / 対応: 修正済（cross・ラウンド1）
- [should][conv:-] design の AC-I4・AC-I5・AC11 の対応に、名指しの検証が無い・足りない / 対応: 修正済（cross・ラウンド1。E2E・単体を足し、ホイールの検証手段の変更は decisions D7）
- [should][conv:-] packages/protocol/src/ask.ts 対応していない型を見つけた時点で即 return し、後ろの質問の誤り（options 無し・showIf の存在しない id・id の重複）が `unavailable`・終了コード 0 に隠れる / 対応: 修正済（T12・ラウンド1。ループを最後まで回してから返す。誤りが優先）
- [nit][conv:-] packages/server/src/ask/AskService.ts 対応していない型の判定が pane の存在・ask_busy の確認より前で、存在しない pane への `ask.open` が `not_found` でなく `unavailable` になる / 対応: 修正済（T12・ラウンド1。pane・busy の後ろへ）

## ラウンド 1（2026-10-03）
- [should][conv:-] packages/server/src/ask/AskService.ts:98-122 同時に待てる質問の総数にも 1 接続あたりの数にも上限が無く、認証済みの接続が pane ごとに最大 256 KiB の定義を最長 24 時間置ける（400 pane で約 100 MB。`ask.subscribe`・`ask.get` の応答もそれに比例して大きくなる）。`ImageUploads` の `maxActive`（メモリを数で止める）と方針が違う / 対応: 差し戻し→総数 32・1 接続 8 の上限（`ask_busy`）を足す
- [nit][conv:-] packages/cli/src/commands/ask.ts:34-41 サイズ超過で reject した後も `data` の購読が残り読み続ける / 対応: 差し戻しに合わせて直す（`destroy()`）
- [nit][conv:-] packages/cli/src/commands/ask.ts:100 `client.onClose` の購読を外せない（実害なし。接続を閉じた後の reject は無効）/ 対応: 理由をコメントに残す
- [nit][conv:-] AskService `ask.open` が呼び出し元の pane に限っていない・購読の条件が hello の自己申告の kind だけ / 対応: 許容（認証済みの接続は pane のシェルを操作できるのと同じ権限。decisions D6 と同じ。docs/sodactl.md に記載済み）

## ラウンド 2（2026-10-03）
前ラウンドの指摘（質問の数の上限・標準入力の読み止め・onClose のコメント）の解消と、そのラウンドの差分（`ASK_PENDING_MAX`・`ASK_PENDING_PER_CLIENT_MAX`・`AskService.open` の確認・`readStdinAll` の `destroy`・docs・テスト）を点検した。
- 解消: 上限は `AskService.test.ts`（総数 32・1 接続 8・閉じれば空く）で確かめ、`docs/sodactl.md` の上限と `ask_busy` の説明に反映済み。標準入力は上限超過でストリームを破棄する。
- 要件適合: `aidev coverage` は ac=20・design=20/20・tasks=20/20・gaps=0（tasks 承認時から AC15・T12 が増えた分だけ。追補 §1 の取り込み。decisions D9）。coding 中に足したタスクは T12 だけで `AC:` を持つ。
- 価値適合: 目的（ブラウザがどのマシンにあっても、pane のプログラムの質問がそのブラウザの画面の上に出て、答えが戻る）を、実物の Chromium の E2E（ビルドした sodactl 経由）で確かめてある。ループバックでないブラウザ・実機・ssh 越しは未検証として test-result・docs/verification.md に残した。
- 規約適合: `e2e-observe-browser`（合否はダイアログの DOM・ブラウザが送ったフレーム〔CDP〕・フォーカスで判定。テストのクライアントに届いたイベントを合図にしていない）・`regression-negative-control`（主要な判定 28 件を変異させて落ちることを確認）に沿う。
- 無関係な変更: 見当たらない（`sodashitsu-ask-form-*.md` は利用者が置いた指示で、コミットに含めない）。
指摘なし。
