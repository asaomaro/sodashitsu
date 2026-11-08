# 小UI群をまとめた検証

- 指定画像3枚を確認。隔離HTML/script面は色変数・buttonCSSのみ配信され、scrollbarの共通CSSが未配信だった。親の計算済みthin/8px・補助track色と共通stylesheetをtheme bridgeへ追加し、静的/スクリプト両方に適用する。テーマ更新で内容を再実行せず、旧paletteの補助track値は残さない。
- Bellは NotificationBell.vue のfeature属性欠測。ThemeModeToggle/新規/メニューは既にfeatureなので、features時だけbellも対象へ。none/actionsは従来の背景を維持する。理由があって除外されたものの分類変更ではない。
- Toggleを0.2em右へ寄せ、隣のbellとのgapを0.4em→0.2emに。折畳時の縦配置はmargin0で維持。
- core THEME_LABELS（Web/TUIが共用）とdesktop settings optionを指定どおり `sodashitu light` / `sodashitsu dark` へ変更。内部ID・保存値・アプリのウィンドウタイトル/製品名は変更しない。desktop-labels.json。
- 関連core15test、Web42test成功。Web全型check成功。raw restored-core/web/typecheck.log。
- 生成ブラウザ: 4palette×3button mode×2実sandbox iframe=24組。縦横ともoverflowが発生する600pxコンテンツ、実gutter10px（Chromium thin）、webkit宣言8px、thumb半径8px、accent色を確認。Soda light/dark画像を保存し目視。none/actions/featuresのbell背景、toggle間隔、入力ノード/編集値保持、script実行1回、テーマ切替の追随を確認。browser.json/log/mjs/png。
- 旧6製品sourceへ戻してcoreを旧sourceで再buildするとcore1test/Web2test失敗、ブラウザも表示名/bell/間隔/両iframe色・幅・角の回帰を検出。負例は個別CSSごとに増やさずこの一回へ集約。restoration.jsonの6SHA byteExact復元後core再build0、15+42test/24DOM組成功。
- 別PJplugin本文/OS設定/利用者pane/実機/実モデル操作なし。全体CIは統合ownerが一回行うため重複実行しない。
