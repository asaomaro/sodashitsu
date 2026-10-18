# 検証記録

## 実装と確認の範囲

Sodashitsu起動中に限るDemandStart Windows broker、保護されたインストーラー、local-only pipeの双方認証、active console/locked/Winlogon専用worker、SAS、lease期限とJob Object回収を実装。Web/TUIのローカル許可、--desktop-unlock、human-onlyのロック画面、通常画面との遷移時の破棄と閲覧専用への再接続を接続した。

実機サービスの導入、実際のWindowsロック、画面キャプチャ、資格情報入力、解除は行っていない。自動試験はそれらの成功を保証しない。初回の管理者導入と実機確認はB側利用者が行う。

## 成功した検証

- pnpm build: 全パッケージ成功。
- pnpm typecheck: 全パッケージ成功。
- pnpm test -- --maxWorkers=2: 716ファイル、11,152件成功、586.51秒。
- 関連ブラウザE2E: remote-desktop-display / remote-desktop-unlock / remote-desktop の3件成功、18.3秒。A/B実サーバーとsynthetic sourceを使い、ブラウザDOM/canvas/受信frameで判定。
- Windows C# compile-onlyとEXE entrypointのコンパイル成功（サービス登録なし）。
- Windowsの同じnative ServerPipe実装で、未接続Acceptが150msでキャンセルされること、制限したdata accessでUTF-8日本語/emojiが往復できることを確認。
- Windows CreateNoWindowの子プロセスで、実装のSetUtf8ConsoleにUTF-8日本語/emojiを渡して一致を確認。ConsoleのコードページAPIを使わない。
- 既存のWindows display lease fake-driver試験も成功。解像度変更・入力・キャプチャなし。
- 独立レビュー・各修正差分の再レビュー: 必須指摘を解消。review.md参照。
- git diff --check成功。
- soda handoff成功: pid 7467から8 paneのプロセスを維持して新buildへ引き継いだ。

## 途中で直した検証条件・不具合

- E2Eの共通openNativeTabが既に情報・設定を開いていた。二重クリックで畳んでしまう試験条件を、aria-expandedで確認してから開くよう修正。
- Web buildとブラウザ試験が重なった回はasset切替中で画面ロードに失敗した。build完了後の実行で成功。
- WindowsIdentity.Groupsはlogon SIDを除外するため、native TokenGroupsからの取得へ変更。
- 非コンソールプロセスでは.NET Frameworkのcode-page setterを使えないため、標準streamをUTF-8で包む方式へ変更し、実WindowsのCreateNoWindowで検証。

## 負の対照

ロック画面でのagent grant拒否だけを一時的に外し、新しい拒否試験が失敗することを確認。元ファイルはbyte単位で復元した。生出力:

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > never grants agent access on a lock screen and closes the old generation when unlocked
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopRelay.test.ts:307:60
    305|   viewer.send({type:"control",enabled:true});
    306|   await expect.poll(()=>viewer.messages.filter(m=>m.type==="control").…
    307|   expect(viewer.messages.some(m=>m.type==="agent_ticket")).toBe(false);
       |                                                            ^
    308|   viewer.send({type:"sas"});
    309|   await expect.poll(()=>viewer.ws.readyState).toBe(WebSocket.CLOSED);

 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
```

ログ: `/workspaces/sodashitsu-check-logs/20261018-desktop-unlock/`。個人設定 .claude/・.soda/ は対象外。
