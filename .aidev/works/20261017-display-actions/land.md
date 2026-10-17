# 未コミット変更の統合

ユーザーからローカルmain最新化、続いて既存未コミット変更のPR/mergeを指示された。mainを3cd00d39（#173）へfast-forwardし、保存していた変更を復元。script.htmlのfeatures宣言のみ競合したため、desktop-cdp部品と既存terminal、viewportMaximizeの双方を保持して解消。

対象は、指示本文とEnterの待ちを1000msにする変更、script-htmlの外部リンク中継・ブラウザ内最大化/復帰、LoginView selectの高さ揃え、テスト・文書。ユーザー状態の.claude/.sodaは対象外。

- build/typecheck成功。
- 関連7ファイル227件成功。旧DisplayFrame初期メッセージの完全一致期待をfeatures追加に合わせて更新。
- 実ブラウザでPopover幅・同じiframe/入力の保持・復帰・別タブ/opener=null・sandbox維持を確認。
- 独立レビューで全差分・競合解消・追加E2Eを確認、阻害事項なし。
- 外部接続画面の変更と併せた最新mainの全体検証を別worktreeで実施し、重複実行を避ける。

元ファイル・patch・stash IDは ~/.local/state/sodashitsu/dev-backups/main-update-20261017-224919 に保存。作業前のstashを保持。
