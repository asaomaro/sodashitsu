# Electron端末コピーの修正と検証

persist:assistant-serverのpermission request/checkを一律falseにしていたため、Web端末のnavigator.clipboard.writeTextが失敗していた。

openPanelが作成したWebContentsをWeakMapへ登録し、その窓の現在のmainFrame URLとrequestingUrlが一致し、登録したサーバーorigin・画面pathnameと一致するmain frameに限りclipboard-sanitized-writeを許可する。closed時に登録解除する。clipboard-readや旧paste権限、iframe、外部origin、別WebContents、同originでもプラグイン等の別pathname、ローカルnative窓に許可を広げない。Web側の選択時自動コピー/明示コピー処理やnative preloadは変更していない。permission detailsにはuserGestureが無いため、独自のgesture推測・IPCの新設は行わず、既存DOMコピーとChromiumのfocus/activation境界を維持する。

一次資料: https://www.electronjs.org/docs/latest/api/session （clipboard-sanitized-write、request/checkの両handler、details.isMainFrame/requestingUrl）。

## 固定sourceの確認結果

- Node24.22.2。専用worktreeの依存と生成物のみ使用。
- tsc -b packages/desktop-assistant: exit0。
- desktop-assistant typecheck（テスト含む）: exit0（typecheck.log）。
- main配線・pure guard: 68pass（tests.log）。
- main.tsだけ修正前へ戻した負例: exit1（negative.log）。修正後へbyte exact復元。SHA256 `8bf3b414ae2a49d746d6a96576778595e7c90a22667926504256b36335c9bbbf`。

## 実Electron

Electron45.1.0（導入済みcache）を別Xephyr display :194で起動。fixture専用HTTP server/renderer/userData/クリップボードを使用し、利用者のOSクリップボードは読まず、Windows/sr-pcを操作しない。fixture以外のrendererへevaluate/入力しない。終了後はfixture ElectronとXephyrを終了。

修正前相当の全拒否で失敗→新policyで生成文字列を選択してwriteTextが成功し、native clipboardの生成値一致を確認。read、same-origin iframe、登録解除後writeは拒否。electron.logは本文を含めずboolean/permission metadataのみ。再現用electron-fixture.cjsはこの作業時の絶対一時パスを記録したもので、本番用の実行スクリプトではない。

これは実Electron API検証であり、Windows配布実機での最終製品画面確認は未実施。初回のfixtureでElectron45のreadTextがPromiseであることを見落として一致判定がfalseになったが、awaitして再実行し全条件成功。最初のtest runはunregistered MockWindowがisDestroyedを持たないことで失敗し、未登録contentsを先に拒否する順へ修正して68件を再実行した。最終検証後のruntime編集は無し。
