# 共有元終了後のロック解除lease復旧

## 実機で確認した状態

sr-pcはmain e8e700ae。windows-helper.ps1 -ValidateOnlyは成功し、非撮影照会はlocked=0 / selected=cover / cover=trueだった。保存された共有設定はenabled/allowInput/allowUnlock=trueなのに、SodaDesktopUnlockサービスはStopped、維持用powershell/DesktopUnlock --leaseプロセスは存在しなかった。

公開HTTPSのdesktop-shareで旧viewer相当と最新subprotocol/通常optionsの両方からready secureDesktop=true / lockScreenCover=trueを確認。操作権は取得せず、入力・復帰要求は送っていない。したがって、報告された「共有元が終了」の直接原因は現時点で再現・特定できていない。初期ロック画面の入口は維持サービスを使わない別経路であり、サービス停止と元のエラーを同一原因だと断定しない。

ソース上、DesktopUnlockLeaseは子の終了・stdinエラーで維持を止めたまま再開せず、保存された許可が有効でもサービスがずっとStoppedになる問題を確認した。

sr-pcで既存設定を保ってhandoffを実行。exec.readのCLI応答は接続入れ替え中にtimeoutとなったが、Bのserver.logで2026-10-24T01:10:36.302Zにhandoff complete、維持用powershell/--lease子プロセスの再出現、サービスRunningを確認した。その後も非撮影のcover readyを確認。サービス導入・管理者権限・OS設定・ロック解除の操作は行っていない。

## 修正

維持プロセスの予期しないclose/error/heartbeat書き込み失敗で、1/2/4/8/16秒の最大5回だけ再起動する。30秒以上持続していた子が切れた場合は予算をリセットする。初期起動を含め連続失敗時は合計6回までで停止する。明示的に共有を開く場合は、許可・共有先originを検証した後で枯渇した予算を再開できる。信頼済みの保存コマンドでlease/heartbeatのみを再開し、共有・操作権・入力は自動で取得/送信しない。stop、許可変更、handoffは予約済みの再試行とheartbeatを取り消す。

## 検証

- lease/settings/relayの関連unit42件成功。予期しない終了、stdin故障、古い子の通知、再試行上限、明示的な再試行、設定変更・停止、長期維持後の予算リセット、同期spawn失敗を検証。
- 独立レビュー review_transfer通過。元エラーとの因果を断定しない点も確認。

## 負対照

DesktopUnlockLease.tsだけをHEADの旧版へ戻し、追加した「restarts an unexpectedly」テストを実行。終了後に再起動しないため失敗した。ソースをバイト単位で復元し、最終ビルド後に全体試験を実行する。

```text
/workspaces/sodashitsu-desktop-input

 ❯ |@sodashitsu/server| src/desktop/DesktopUnlockLease.test.ts (7 tests | 1 failed | 6 skipped) 7ms
   × restarts an unexpectedly closed lease with backoff, without opening a share or sending input 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopUnlockLease.test.ts > restarts an unexpectedly closed lease with backoff, without opening a share or sending input
AssertionError: expected "vi.fn()" to be called 2 times, but got 1 times
 ❯ src/desktop/DesktopUnlockLease.test.ts:34:43
     32|   lease.start(["trusted-helper","-UnlockLease"]);
     33|   first.emit("close",0);vi.advanceTimersByTime(999);expect(spawn).toHa…
     34|   vi.advanceTimersByTime(1);expect(spawn).toHaveBeenCalledTimes(2);
       |                                           ^
     35|   expect(spawn.mock.calls[1]!.slice(0,2)).toEqual(["trusted-helper",["…
     36|   expect(input).toBe("heartbeat\n");lease.ensureRunning();expect(spawn…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  10:12:57
   Duration  158ms (transform 63%, import 22%, tests 10%, worker 4%)
```

## ロック画面ボタンのフォーカス退行

関連E2Eのstable/onceケースが、明示的な「サインイン画面へ進む」クリック後にcoverが残って失敗した（他4件は成功）。このボタンはdismissInFlightを立てると無効になり、フォーカスがbodyへ移る。PR189で追加したroot focusoutがrelinquishを呼んでdismissPendingを取り消すため、controlの応答を待つ間に要求が失われていた。ボタンを無効にする前にfocusableなwindow本体へ同期的にフォーカスを移し、要求を維持する。ブラウザからdismiss_lock_screenがちょうど1回送信されることを移行前に確認するassertionも追加した。修正箇所は別コンテキストで再レビュー通過。元の汎用終了表示とこの退行も同一原因とは断定しない。

ボタンのfocus移動だけを外してWebを再ビルドした負対照（生出力）。dismiss_lock_screenの送信数が0となって失敗した後、ソースをバイト単位で復元し再ビルドする。

```text
  1) src/specs/remote-desktop-cover.spec.ts:10:96 › lock cover safely handles stable startup transitions

    Error: expect(received).toHaveLength(expected)

    Expected length: 1
    Received length: 0
    Received array:  []

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      64 |     expect(received.find(m=>m.type==="ready")).toMatchObject({lockScreenCover:true,secureDesktop:true,allowClipboard:false,allowMedia:false});
      65 |     await cover.getByRole("button",{name:"サインイン画面へ進む",exact:true}).click();
    > 66 |     await expect.poll(()=>sent.filter(m=>m.type==="dismiss_lock_screen")).toHaveLength(1);
         |                                                                           ^
      67 |     await expect(cover).toHaveCount(0);
      68 |     const canvas=view.getByLabel("共有画面");
      69 |     await expect(canvas).toBeVisible();
        at /workspaces/sodashitsu-desktop-input/packages/e2e/src/specs/remote-desktop-cover.spec.ts:66:75

    Error Context: test-results/remote-desktop-cover-lock--bd642--stable-startup-transitions/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-cover-lock--bd642--stable-startup-transitions/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-cover-lock--bd642--stable-startup-transitions/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-cover.spec.ts:10:96 › lock cover safely handles stable startup transitions
undefined
/workspaces/sodashitsu-desktop-input/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-cover.spec.ts -g stable startup
```

修正後の関連E2E6件成功。主作業フォルダへ既存変更を保って反映後のbuildと関連unit47件も成功。

最終確認: 全体unit737ファイル・11292件成功。関連E2E6件と負対照復元後のstable coverケース成功。build/typecheckと最終smoke成功。
