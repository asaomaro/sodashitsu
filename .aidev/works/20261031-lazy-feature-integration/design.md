# 設計と独立監査

## 確認した未達

- main.tsがcomposeServer/assistant installer/controller/Windows supervisor等を静的importし、helpでも機能実装を評価していた。
- sodactl main.tsが全commandsとwork-agent/MCP/preview/native-helperを静的importしていた。公式sodactl内のentryには既に集約されているが、未使用実装の読み込みは残っていた。
- composeServerはAssistantSessions/AudioUploads/idle監視・DesktopProvider/Relay・PreviewService/ManagedPreviewHelpersを無効時も読込・生成する。これは次段階の対象で、このentry変更だけでは解消しない。
- assistant配布はSodashitsu Assistant.exeと独立ZIP installを前提にする。GUI用Electron processと、アプリ固有の別exe/導入手順を分けて扱い、soda内部GUI entryとoptional runtime素材へ統合する。新standalone installerを追加しない。
- Windows通常helperは専用exeではなくPowerShellだが、audio/mic/rich/codec/virtual/protectedを一括Add-Typeする。
- native-copy.exe/audio-pipe.exe/selection.exeは普通権限の共通host roleへ集約候補。STA・Windows pipe・WSL境界の別processは維持する。
- DesktopUnlockは既に1exeのservice/proxy/worker role。Signin service/workerの統合はmanifest/SCM/Job/VerifyWorker/owner/receiptを同時に扱う独立した段階にする。
- opusscript/weriftの実codec importは既に遅延されている。この点をeagerと誤って扱わない。

## 最初の差分（このPR）

コマンド入口をthin routerにし、選択branch内でだけimportする。型依存はtype-onlyを使う。assistant statusは新しい薄いEnabledState/PackageStateだけを読み、起動manager・ZIP extractor・AI audio実装を読まない。既存のファイル形式とatomicな保存/更新処理は変えない。

更新のhandoff preflightは例外として実際のserver moduleを読み込み、実装が壊れていればreadyを返さない。helpを軽くする変更で、更新前の検査を弱めない。stage2の不正probeを使う生成検証ではPTYを開かない。

実プロセスのESM loaderで評価されたfile URLを観測する。helpでoptional implementationが0件、skillで選んだmoduleだけload、statusでmetadataだけloadをassertする。loaderでcomposeServerを拒否してもhelpは成功し、preflightは失敗する。旧entryを戻して両packageを再buildし、7件中5件が意図したAssertionErrorで失敗することを確認する。

## 次段階の境界

無効時の認可・disabled workspace authorityと設定の薄いmetadataはcore側に置き、実serviceは有効化後のfactoryへ移す。無効/close/handoffの処理で未生成serviceをimportしない。生成済みnative runtimeは停止・所有を確認してから解放し、未終了の物理slotやagentの進行中作業を強制的に再利用しない。

このPRの3つのCLI遅延だけを根拠に、配布統合・server off時module load・全機能統合が完了したとは扱わない。
