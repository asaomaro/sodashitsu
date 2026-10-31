# 検証

- 初回全体試験は旧installer statusの期待、GUI fake appのsetName不足、追加したsettings見出しの既存固定geometry/項目数の期待で失敗。期待とfake/geometryを更新し、関連168件pass。最終全体試験は改めて実行し、結果をPR本文/merge receiptに記録する。
- build pass。NativeRoot/private HostApp/RPC/Web/Controller/Managedなどの生成境界、実生成Node childによるON→attached→OFF→実終了、WSL mounted executable/native app引数分離を検証。
- 実WindowsPowerShellでroot scriptをAST parseしてpass（実行なし）。さらにGetItem/GetAcl/TestPathをメモリadapterへ置換し、安全ACL受理/非信頼ancestor置換ACL拒否をpass。production root・ACLへ触れない。
- Windows hostedでは、存在確認がfalseを返す前にprivate既存folderを作るraceを生成し、既存SDDLが作成前後で保持され、Set-Aclが呼ばれないことも検証する。
- negative controlはprivate copyだけへ変更し、元sourceは変更しない。正常版6passから、callback後Abort・同値ON・終了世代失効・WSL exe path・dispose後guardを除くと対象6件すべて失敗。

生出力（/tmp/soda-integrated-negative-failure.logから原文）:

```text
 FAIL  ../../tmp/soda-integrated-negative-psmuh4j7/packages/server/src/assistant/AssistantBundledLaunch.test.ts > on WSL launches the mounted executable while passing the app as a Windows path
AssertionError: expected [ 'C:\generated\app', …(1) ] to deeply equal [ …(2) ]
 FAIL  ../../tmp/soda-integrated-negative-psmuh4j7/packages/server/src/assistant/AssistantBundledLaunch.test.ts > rejects cancellation while the last preparation owner is retiring
AssertionError: promise resolved "{ command: [ 'generated', …(1) ], …(1) }" instead of rejecting
 FAIL  ../../tmp/soda-integrated-negative-psmuh4j7/packages/server/src/assistant/AssistantLaunchController.test.ts > retains a running identity through repeated ON and duplicate watch delivery
AssertionError: expected 'starting' to be 'running' // Object.is equality
 FAIL  ../../tmp/soda-integrated-negative-psmuh4j7/packages/server/src/assistant/AssistantLaunchController.test.ts > revalidates the single attached identity when an equivalent ON arrives during authorization
AssertionError: expected "vi.fn()" to be called once, but got 2 times
 FAIL  ../../tmp/soda-integrated-negative-psmuh4j7/packages/server/src/assistant/AssistantLaunchController.test.ts > a closed generated host cannot be revived by a late attached authorization result
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
 FAIL  ../../tmp/soda-integrated-negative-psmuh4j7/packages/server/src/assistant/AssistantNativeRoot.test.ts > rechecks abort after the final authorization callback before starting a native child
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
 Test Files  3 failed (3)
      Tests  6 failed | 17 skipped (23)
```

実GUI/実録音/入力/clipboard/driver/serviceや実モデルは自動試験で利用しない。

## OS差分と最終delta

8dc57b35製品の全体試験919files pass +1Windows専用file skip / 13227pass +1Windows専用skip (13228)、build/typecheck pass。generated browser E2E（desktop/narrow screenshot）と両OSの配布resource staging、既存GUI headless/全体server、lazy entry CIはpass。Windows新fixtureは3回のcoldPS呼出しでtest既定5秒を超え、macOSでは重複watch下のprepareを検出したため修正。

現deltaはobservation/idempotence/actual hostState/closedhost fixtureと旧startup項目削除。build pass。private copyで正常版8passから該当guardを外し、以下8件の意図したassertionが全て失敗。元sourceは変更しない。raw /tmp/soda-integrated-negative-{positive,failure}-current.log。最終全体結果と全headCIはPR本文・merge receiptに記録する。

```text
 FAIL  ../../tmp/soda-integrated-negative-psmuh4j7/packages/server/src/assistant/AssistantBundledLaunch.test.ts > on WSL launches the mounted executable while passing the app as a Windows path
AssertionError: expected [ 'C:\generated\app', …(1) ] to deeply equal [ …(2) ]
 FAIL  ../../tmp/soda-integrated-negative-psmuh4j7/packages/server/src/assistant/AssistantBundledLaunch.test.ts > rejects cancellation while the last preparation owner is retiring
AssertionError: promise resolved "{ command: [ 'generated', …(1) ], …(1) }" instead of rejecting
 FAIL  ../../tmp/soda-integrated-negative-psmuh4j7/packages/server/src/assistant/AssistantLaunchController.test.ts > retains a running identity through repeated ON and duplicate watch delivery
AssertionError: expected 'starting' to be 'running' // Object.is equality
 FAIL  ../../tmp/soda-integrated-negative-psmuh4j7/packages/server/src/assistant/AssistantLaunchController.test.ts > revalidates the single attached identity when an equivalent ON arrives during authorization
AssertionError: expected "vi.fn()" to be called once, but got 2 times
 FAIL  ../../tmp/soda-integrated-negative-psmuh4j7/packages/server/src/assistant/AssistantLaunchController.test.ts > a closed generated host cannot be revived by a late attached authorization result
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
 FAIL  ../../tmp/soda-integrated-negative-psmuh4j7/packages/server/src/assistant/AssistantLaunchController.test.ts > duplicate ON observations during a held preparation preserve the original preparation
AssertionError: expected true to be false // Object.is equality
 FAIL  ../../tmp/soda-integrated-negative-psmuh4j7/packages/server/src/assistant/AssistantLaunchController.test.ts > rapid OFF then ON before teardown keeps the still-owned running host
AssertionError: expected 'starting' to be 'running' // Object.is equality
 FAIL  ../../tmp/soda-integrated-negative-psmuh4j7/packages/server/src/assistant/AssistantNativeRoot.test.ts > rechecks abort after the final authorization callback before starting a native child
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
 Test Files  3 failed (3)
      Tests  8 failed | 17 skipped (25)
```

最終head1bba0262: build/typecheck pass、919files pass/1Windows専用skip、13229tests pass/1skip。10件の全headCI成功。PR345 main cd09d424、receipt /tmp/soda-assistant-integrated-final-receipt.json。
