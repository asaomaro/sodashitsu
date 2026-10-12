# 端末版の文書ウィンドウと簡易フォーム

ペインの右クリック「表示ウィンドウ…」、または `prefix+i`／`prefix+shift+i`（既定prefixはCtrl+B）で、そのペインの表示の一覧を開きます。↑↓で選び、Enterで表示します。`sodactl display`から出したtext/markdown/htmlのパネルと帯を、端末版では窓として読み替えます。

焦点のあるペインで新しい `--dock float` の面を作ると、他のダイアログが開いておらず `--collapsed` が無い場合に窓が開きます。別ペインの表示・接続前からある表示・閉じて始める表示は一覧から開いてください。

## 動かす・サイズを変える

文書、会話履歴、要約、過去セッション、利用状況のウィンドウで使えます。

- 上辺をドラッグして移動、右下角をドラッグしてリサイズ。
- Alt+矢印でサイズ変更、Alt+Shift+矢印で移動。
- 画面より外へは出せません。端末自体を縮小すると窓の位置とサイズを補正します。
- ↑↓・PageUp/PageDown・ホイールで文書をスクロール。フォームの入力中はTabで欄を選びます。
- Escで文書から一覧へ戻り、さらにEscで窓を閉じます。面自体はサーバに残り、一覧から再表示できます。面を削除するには `sodactl display close 名前` を使います。

位置・サイズは開いている窓の間だけ保持します。端末がAlt操作を先に取る場合は、マウスで操作してください。設定・確認・コマンドpopupなど他の内蔵ダイアログは今回のリサイズ対象ではありません。

## MarkdownとMermaid

見出し、強調、引用、リスト、表、コードブロックをセルと色・罫線で整形します。リンクはURLを文字表示し、画像や外部ファイルは取得しません。HTMLを実行しません。会話の要約も同じ整形で表示します。

Markdown内の `mermaid` コードブロックは、[flowchartの基本構文](https://mermaid.js.org/syntax/flowchart.html)と[sequenceDiagramの基本構文](https://mermaid.js.org/syntax/sequenceDiagram.html)を文字図にします。フローチャートは接続ごとにボックスと矢印を描き、分岐・循環の辺も表示します。図全体の自由な配置やブラウザのSVGと同じ図形には対応しません。シーケンス図は参加者とメッセージの線を描きます。

対応範囲はflowchart/graphのLR/RL/TD/TB/BT、単純なノードIDと`[表示名]`・`(表示名)`・`{表示名}`、`-->`・`-.->`・`==>`、`|辺の名前|`、sequenceDiagramのparticipant/actorと`->`・`->>`・`-->`・`-->>`です。subgraphやloop等、解析できない構文は未対応の表示と原文を残します。幅の広い図は折り返します。Markdownの表示上限は128000文字です。

```sh
cat result.md | sodactl display set result --kind panel --format markdown --dock float
```

## 簡易フォーム

既存の静的HTMLの `data-soda-action` を使用します。ask-formの質問定義は必要ありません。同じHTMLをWeb版にも表示できます。

```html
<h2>レビュー結果</h2>
<form data-soda-action="review">
  <label>コメント <input name="comment" required maxlength="1000" /></label>
  <label
    >判定
    <select name="result">
      <option value="approve">承認</option>
      <option value="changes">修正依頼</option>
    </select>
  </label>
  <button>回答を送る</button>
</form>
```

```sh
sodactl display set review --kind panel --dock float --html-file review.html --wait --timeout 60000
```

Tab/Shift+Tabで欄を選び、文字を入力、Space/Enterでチェック・選択・ボタンを操作します。selectは左右キーでも選択できます。テキスト欄でEnterすると同じフォームの送信ボタンを実行します。結果は通常の `display.action` に `{ "comment": "…", "result": "approve" }` の文字列の組として届きます。フォームの送信が成功すると窓を閉じます。送信失敗時は入力を残して再試行できます。面自体はサーバに残るため、一覧から再表示できます。独立したdata-soda-actionボタンは窓を閉じません。作成プログラムが面を削除した場合も窓を閉じます。

text系のinput、password（表示を隠すだけ）、checkbox、radio、単一select、textarea（端末版は一行入力）、hidden、送信ボタン、独立した `button data-soda-action` が対象です。requiredとdisabledを扱い、JavaScript、CSS、外部通信は実行しません。email/number等は文字欄として扱い、型・patternの検証はアプリ側で行ってください。

入力欄は64件まで、編集する値は4096文字まで、HTMLの表示は128000文字まで。構造の深さ／表示行数の上限に達したり、未対応の入力欄・form属性・multiple selectがある場合は、不完全な回答を送らないように送信を無効にします。表示が更新された場合は入力を作り直します。切断後や古い版のフォームからは送信しません。

`script-html`とプラグインのJavaScriptアプリ画面は端末版では実行しません。複雑な操作はWeb版で開いてください。
