# 会話画面のチェックボックス配色

原因: accent-colorが.assistant-scroll配下のcheckboxのみを対象にし、会話画面.speech-contentには適用されていなかった。
修正: checkbox/radio全体に--assistant-button-bgを適用。既定2配色は従来の金色、それ以外はテーマのaccent。

- 実Chromiumで会話画面の通知要約checkboxと、全19テーマのsettings checkboxのcomputed accentColorを確認。既存UI試験も成功（browser.txt）。
- style.cssのみHEADへ戻すnegative controlでbubble checkboxのaccentColorがautoとなり期待rgb(201,166,79)に一致せず失敗（negative.txt）。元の修正済みbytesへ復帰・一致確認後、同じ試験成功。
- build:host成功。
- review_bubble_resize独立レビュー、必須指摘なし。

利用者の画面統合・通知の共通要約基盤に関する質問には提案として回答し、この差分ではUI構成や要約処理を移動していない。通知の失効条件はnoticeFeed.pruneとその回帰試験で確認した。
