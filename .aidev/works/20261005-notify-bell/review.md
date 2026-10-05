# レビュー記録: notify-bell

## タスク点検ログ

- T4 [should] 履歴の置き換え（`removeHistoryPane`）の回帰テストが無効（行を消しても通る）→ 古い履歴を解消させない状態（agent は入力待ちのまま）で別の鍵を直に配送する形に直し、行を消すと落ちることを確認 [conv:regression-negative-control]
- T4 [should] 押し出しの条件（`e.paneId !== paneId`）の回帰テストが無効（外しても通る）→ 置き換えられる古い件が未解決の状態で確かめる形に直し、条件を外すと落ちることを確認 [conv:regression-negative-control]
