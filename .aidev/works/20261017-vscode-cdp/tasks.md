# VSCode CDPの最小実装と検証

目的: 既存VSCodeのrendererをCDPで画像共有し、Sodaアプリビューで操作する。公開拡張APIのみの実装やDOM複製とは区別する。
独立worktree: /workspaces/sodashitsu-vscode-cdp / feature/vscode-cdp。元の未コミット変更は取り込まない。

## 境界

- 既存VSCodeの再起動・終了・接続口開放、外部公開、認証設定変更、PR/mergeはしない。
- 実機Windows VSCodeでの性能・IME・native dialog・最小化の合格は主張しない。
- Chromiumのテスト用pipe CDPで画素と入力を検証する。外部向けdebug TCP portは開かない。
- 小さなCDP bridgeはNode 24の標準APIだけで動かし、VSCode本体のpatchをしない。
- 操作には共有元の --allow-input とSoda管理の表示部品での明示許可が必要。

## タスク

- [x] CDP入力allowlist・一回限り招待・接続単位relay・切断と認証失効の実装（独立taskcheck対象）
- [x] アプリビューのnative desktop-cdp部品・実験版プラグイン・Windows bridge
- [x] 単体・統合試験、Chromium実CDP→画面描画→操作→切断のE2E
- [x] 全体build/typecheck/test、関係E2E、起動確認
- [x] 差分全体の独立レビュー、修正差分の再レビュー
- [x] 利用手順・検証結果・未検証条件の記録

要件上の判断: 任意CDP proxyをブラウザへ渡さず、画像と限定入力だけの専用WSを追加。frame ACKと上限で背圧制御。招待と画面は隔離iframeへ渡さない。再接続は新しい招待から行い、既存作業の自動再起動や入力再送はしない。

完了時の注意: 全体試験には基準commitでも再現する既存失敗1件が残る。詳細・生の失敗出力・negative controlは `test-result.md`。この初回完了後にユーザーが検証用VSCodeを起動し、画像・一部入力を実機確認した。後続の実機記録を参照。

## 環境再起動後の継続

- [x] 元のsession履歴と記録・自worktree・Windows接続口の状態確認
- [x] 隔離した検証用Sodaの復元と、再作成可能なlauncher追加
- [x] rendererリサイズ・2倍DPI・入力座標追従の実CDP E2E追加
- [x] 別コンテキストでlauncherと追加E2Eの独立レビュー
- [x] リサイズの希望範囲をユーザー確認（Soda表示枠への追従。実外枠変更と区別したviewport fit採用）
- [x] Windows検証用VSCode起動後の再接続と描画領域の実機追従/解除確認

遠隔resizeの候補設計は resize-design.md。Windows設定・実ウィンドウは未変更。

## 表示領域追従の追加

- [x] allow-fit/viewport schema・二重許可relay（独立taskcheck対象）
- [x] 明示checkboxとResizeObserver・最新viewport集約・描画世代/ACKと入力抑止
- [x] fit解除/許可取消し/停止の解除と回帰negative control
- [x] Windows実機の表示枠追従・解除・停止後復帰
- [x] 独立レビューと修正差分の再レビュー
- [x] 最終の新規/既存関連E2Eまとめ確認（専用artifact出力、15件PASS）

詳細は fit-test-result.md。native Windows外枠resizeとnative dialog共有は未実装のまま。

## ホイール混雑停止の追加修正

- [x] viewer wheel32ms集約、deltaMode換算、順序/取消し
- [x] helper128項目buffer/1worker、連続合算/最新移動、離散枠・release保持
- [x] slowCDP/burst/飽和/取消/満杯の単体24件と実CDP scroll E2E2件
- [x] helper/viewerそれぞれ修正前negative失敗、byte一致復元
- [x] Windows一時bridgeファイルを修正版へ更新（起動/設定変更なし）
- [x] 独立レビュー最終確認と配信確認

接続操作の省略はreconnection-design.mdに候補のみ記録。自動再接続/恒久認証/Windows常駐設定は変更していない。

## 登録済み共有元・毎回CLI不要化

- [x] 認証済みviewerのdevice一覧/connect/forget、share UUID隔離とcleanup待機（独立点検対象）
- [x] hash-only bounded atomic registry、再起動/失効/duplicate拒否（独立点検対象）
- [x] Windows profileとresident bridge、tokenless起動、切断後idleへresume（独立点検対象）
- [x] UI登録checkbox/初回command/一覧接続/解除、nativefocus保持
- [x] 実CLI＋実CDPのstop/reload/serverrestart/profileonly/forget E2E
- [x] 対象68unit、rootbuild/typecheck、smoke、4修正negative・byte復元
- [x] 独立最終レビューと指摘修正・再レビュー
- [x] 最終16E2E（まとめ15＋該当1単独）・検証サーバー更新と既存state保持・Windows配布ファイル確認

詳しくはresident-test-result.md / resident-review.md。Windows OS自動起動・VSCode extensionは追加しない。

## 共有表示の全画面

- [x] native表示面のFullscreen API・top-layer配置・等倍/fit追従
- [x] 解除/拒否/停止/切断競合とEsc repeat/keyup抑止（独立点検対象）
- [x] 実CDP3E2E・webbuild/typecheck・2negative controlとbyte復元
- [x] 独立レビュー/修正再レビュー・稼働検証サーバへのasset反映確認

詳細 fullscreen-test-result.md / fullscreen-review.md。Windows実ウィンドウ最大化ではなくブラウザ内共有画面の全画面化。

## 接続操作の自動化

- [x] fixed server argvのhelper supervisor・認証/target/epoch統合（独立点検対象）
- [x] Windows helper discovery/必要時専用VSCode起動/bridge stdin取消し（独立点検対象）
- [x] native画面の起動接続/候補選択・起動失敗/停止
- [x] unit/実CDP E2EとWindows実機reuse検証
- [x] 独立最終レビュー・適用/手順/残る範囲の記録

## 接続済みマシンからのVSCode共有

- [x] 限定RPCとgateway認証closure・virtualpeer・個別映像配信（独立点検対象）
- [x] machine headerのVSCode/modalとplugin native面のmachine key切替
- [x] 2Soda/reverse/実CDPで画像/日本語入力/fit/閉じる/失効/非漏洩を検証
- [x] 既存local/resident/launcher回帰と独立レビュー・稼働testSoda反映
