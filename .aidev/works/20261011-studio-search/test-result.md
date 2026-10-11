# 検証

Node24件成功。正規化/AND/メモとID/絞込/状態優先/非破壊並替/ページclamp/HTML escaping/消えたseries/レビュー更新順を確認。

ブラウザStudio4件、自動依頼/通知2件、計6件成功。30件一覧の25/5ページ、全角検索/シリーズ/制作状態/並び順、詳細往復の条件保持、外部進捗更新で再絞込0件、条件解除を実DOMで確認。初回はselectラベルがoption文字を含み厳密一致で操作できず、aria-label明示で修正して成功。E2E型チェック成功。

負の対照は修正2箇所を各々戻して該当回帰が失敗し、byte一致復元。24件再成功。

配布: release/yukkuri-studio-0.7.0.sodaplugin SHA256 b15472a870ed90e9c4ad328ef489cf9043cc03d68379017f3c2ae2bf4c63e117。
yukkuri-workへinstall/enable/ext reload成功、承認pending。更新前に実行中ジョブ無し確認。制作165件と台帳SHA256 5255c09ed656a2d58231630d0b1dabc8f1b54c9e28cbe7f9633fff61174b2383を更新前後で保持。検索機能による実PJ制作データの変更なし。

## review-time

```text
✖ keeps a removed series filter visible and puts reviewed projects first in update order (2.924705ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 85.749979

✖ failing tests:

test at plugins/yukkuri-studio/search.test.mjs:22:1
✖ keeps a removed series filter visible and puts reviewed projects first in update order (2.924705ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

  'b' !== 'a'

      at TestContext.<anonymous> (file:///workspaces/sodashitsu/plugins/yukkuri-studio/search.test.mjs:25:42)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.start (node:internal/test_runner/test:1096:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:385:17) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'b',
    expected: 'a',
    operator: 'strictEqual',
    diff: 'simple'
  }

```

## removed-series

```text
✖ keeps a removed series filter visible and puts reviewed projects first in update order (2.626873ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 77.884886

✖ failing tests:

test at plugins/yukkuri-studio/search.test.mjs:22:1
✖ keeps a removed series filter visible and puts reviewed projects first in update order (2.626873ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /value="removed" selected>removed（現在該当なし）/. Input:

  '<style>*{box-sizing:border-box}body{margin:0;background:var(--soda-bg);color:var(--soda-fg);font:14px/1.6 system-ui}main{padding:16px;max-width:960px;margin:auto}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:14px 0 8px}.muted,small{opacity:.75}.card{padding:12px;margin:10px 0;border:1px solid var(--soda-menu-border);border-radius:10px;background:var(--soda-menu-bg)}button,input,textarea,select{font:inherit;color:inherit;background:var(--soda-subtle-bg);border:1px solid var(--soda-menu-border);border-radius:6px;padding:5px 8px}button{cursor:pointer}button:hover{border-color:var(--soda-accent)}input,textarea,select{width:100%;margin:4px 0 8px}button:disabled{opacity:.7;cursor:default}.row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.row>*{flex:0 1 auto}.stage{display:grid;grid-template-columns:1fr auto;gap:8px;padding:5px 0;border-bottom:1px solid var(--soda-menu-border)}.badge{font-size:12px;border:1px solid var(--soda-menu-border);border-radius:20px;padding:1px 8px}.done{color:#70d8a0}.failed{color:var(--soda-error-fg)}.working,.review{color:var(--soda-warn-fg)}progress{width:100%;height:6px;accent-color:var(--soda-accent)}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.title{font-size:16px;font-weight:600}label{display:block}a{color:var(--soda-accent)}</style><main><h1>Yukkuri Studio</h1><div class="muted">掛け合い解説の制作室</div><div class="row"><button type="button" data-soda-action="import" data-soda-value="">既存の制作物を取り込む</button></div><small>videos配下を読み取り、登録済みを除いて一覧へ追加します。工程は未確認として登録します。</small><details><summary>新しい制作</summary><form data-soda-action="create"><label>題<input name="title" required maxlength="120" placeholder="空はなぜ青いのか"></label><label>テーマ・対象者<textarea name="theme" maxlength="2000" placeholder="初めて見る人へ、身近な例で説明する"></textarea></label><label>制作フォルダ（PJ内・空欄は自動作成）<input name="workDir" placeholder="videos/kaisetsu/chatgpt-dots"></label><label>成果物の名前（拡張子なし）<input name="artifactPrefix" value="video" placeholder="chatgpt-dots"></label><button>制作を追加</button></form></details><h2>制作一覧</h2><form data-soda-action="search" role="search"><label>キーワード<input type="search" name="query" maxlength="300" value="" placeholder="タイトル・動画名・フォルダ・メモ（空白でAND検索）"></label><div class="row"><label>シリーズ<select name="series" aria-label="シリーズ"><option value="">すべて</option><option value="kaisetsu">kaisetsu</option></select></label><label>制作状態<select name="status" aria-label="制作状態"><option value="" selected>すべて</option><option value="pending">未確認・未着手</option><option value="working">作業中</option><option value="review">確認待ち</option><option value="done">全工程完了</option><option value="failed">要対応</option></select></label><label>レビュー結果<select name="review" aria-label="レビュー結果"><option value="" selected>すべて</option><option value="pending">未確認</option><option value="changes">修正が必要</option><option value="approved">承認済み</option></select></label><label>並び順<select name="sort" aria-label="並び順"><option value="updated" selected>更新が新しい順</option><option value="title">タイトル順</option><option value="progress">完了工程が多い順</option></select></label></div><button>検索する</button> <button type="button" data-soda-action="search-reset" data-soda-value="">条件をクリア</button></form><p role="status" data-search-count>0 / 1 件 · 1 / 1 ページ</p><p>条件に一致する制作がありません。キーワードや絞り込み条件を変更してください。</p><details><summary>設定</summary><form data-soda-action="settings"><label>yukkuri-kaisetsu のフォルダ<input name="skillDir" value="" placeholder="/path/to/skills/video/yukkuri-kaisetsu"></label><button>保存</button></form><small>素材・VOICEVOX・公開ツールは導入先で用意します。</small></details></main>'

      at TestContext.<anonymous> (file:///workspaces/sodashitsu/plugins/yukkuri-studio/search.test.mjs:24:102)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.start (node:internal/test_runner/test:1096:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:385:17) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '<style>*{box-sizing:border-box}body{margin:0;background:var(--soda-bg);color:var(--soda-fg);font:14px/1.6 system-ui}main{padding:16px;max-width:960px;margin:auto}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:14px 0 8px}.muted,small{opacity:.75}.card{padding:12px;margin:10px 0;border:1px solid var(--soda-menu-border);border-radius:10px;background:var(--soda-menu-bg)}button,input,textarea,select{font:inherit;color:inherit;background:var(--soda-subtle-bg);border:1px solid var(--soda-menu-border);border-radius:6px;padding:5px 8px}button{cursor:pointer}button:hover{border-color:var(--soda-accent)}input,textarea,select{width:100%;margin:4px 0 8px}button:disabled{opacity:.7;cursor:default}.row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.row>*{flex:0 1 auto}.stage{display:grid;grid-template-columns:1fr auto;gap:8px;padding:5px 0;border-bottom:1px solid var(--soda-menu-border)}.badge{font-size:12px;border:1px solid var(--soda-menu-border);border-radius:20px;padding:1px 8px}.done{color:#70d8a0}.failed{color:var(--soda-error-fg)}.working,.review{color:var(--soda-warn-fg)}progress{width:100%;height:6px;accent-color:var(--soda-accent)}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.title{font-size:16px;font-weight:600}label{display:block}a{color:var(--soda-accent)}</style><main><h1>Yukkuri Studio</h1><div class="muted">掛け合い解説の制作室</div><div class="row"><button type="button" data-soda-action="import" data-soda-value="">既存の制作物を取り込む</button></div><small>videos配下を読み取り、登録済みを除いて一覧へ追加します。工程は未確認として登録します。</small><details><summary>新しい制作</summary><form data-soda-action="create"><label>題<input name="title" required maxlength="120" placeholder="空はなぜ青いのか"></label><label>テーマ・対象者<textarea name="theme" maxlength="2000" placeholder="初めて見る人へ、身近な例で説明する"></textarea></label><label>制作フォルダ（PJ内・空欄は自動作成）<input name="workDir" placeholder="videos/kaisetsu/chatgpt-dots"></label><label>成果物の名前（拡張子なし）<input name="artifactPrefix" value="video" placeholder="chatgpt-dots"></label><button>制作を追加</button></form></details><h2>制作一覧</h2><form data-soda-action="search" role="search"><label>キーワード<input type="search" name="query" maxlength="300" value="" placeholder="タイトル・動画名・フォルダ・メモ（空白でAND検索）"></label><div class="row"><label>シリーズ<select name="series" aria-label="シリーズ"><option value="">すべて</option><option value="kaisetsu">kaisetsu</option></select></label><label>制作状態<select name="status" aria-label="制作状態"><option value="" selected>すべて</option><option value="pending">未確認・未着手</option><option value="working">作業中</option><option value="review">確認待ち</option><option value="done">全工程完了</option><option value="failed">要対応</option></select></label><label>レビュー結果<select name="review" aria-label="レビュー結果"><option value="" selected>すべて</option><option value="pending">未確認</option><option value="changes">修正が必要</option><option value="approved">承認済み</option></select></label><label>並び順<select name="sort" aria-label="並び順"><option value="updated" selected>更新が新しい順</option><option value="title">タイトル順</option><option value="progress">完了工程が多い順</option></select></label></div><button>検索する</button> <button type="button" data-soda-action="search-reset" data-soda-value="">条件をクリア</button></form><p role="status" data-search-count>0 / 1 件 · 1 / 1 ページ</p><p>条件に一致する制作がありません。キーワードや絞り込み条件を変更してください。</p><details><summary>設定</summary><form data-soda-action="settings"><label>yukkuri-kaisetsu のフォルダ<input name="skillDir" value="" placeholder="/path/to/skills/video/yukkuri-kaisetsu"></label><button>保存</button></form><small>素材・VOICEVOX・公開ツールは導入先で用意します。</small></details></main>',
    expected: /value="removed" selected>removed（現在該当なし）/,
    operator: 'match',
    diff: 'simple'
  }

```
