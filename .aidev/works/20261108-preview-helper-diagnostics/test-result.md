# WebPreview helper起動の診断・再試行

製品固定9e8235d9、テスト型のみ修正1f9e13a9。server変更なし。固定stage理由/同viewer明示retry/正式pollnotfound限定reset/表示origin専用login案内/exactvalidatedorigin iframe allowを追加。初回Web型はfixture Promise<void> vs Promise<{}>1件のみでexit2、1f9eで修正。最終1f9e上のWeb package test-inclusive型+Vite build exit0（web-build-final.log）、準備core/protocol build0。全repo build/test再実行なし。

関連4files16tests成功。旧Web/store/helperProbe3runtimeでは5fail/11pass、旧Webによる実Chrome DOMも理由表示要素の欠落でfail。durable scratchへ保存した3filesをbyte-exact/SHA完全復元し16pass/同DOM0（negative.log/restored.log/browser-negative.log/browser-restored.log/restoration.json）。source-sha256.jsonは8source/testの固定SHA。生成2themeDOMで固定理由/peer秘密を出さない/不確かな期限切れを断定しない/同viewerretry/古いcommand除去/明示再許可のfreshviewerを確認、画像を保存。

actual LocalPreviewProbe.tsを隔離transpileし、自作証明書のownHTTPS親→実probe iframe→postMessageを明示clickでChrome153検証。old/new両PASS、sourceSHA不変、proof secretはメモリだけでserver.matches確認しstdout/fileへ保存しない。これはloopback HTTPS親なのでpublic-address LNAを再現しておらず、missingallowが今回原因と証明したものではない。rootのWindowscurl200/Host/peer127確認とも区別する。HTTPSprobe raw/数値receiptに範囲を記録（https-proof.log/json）。自作fixture証明書はgit-common-dir recoveryの私有dirのみ、repositoryへ含めない。

各browser finallyでownChrome/Vite、actualprobe finallyでownserverもawait close。既存browser/cookie/OS設定変更0・実モデル/Windows操作0。実利用者browserの失敗段階/根本原因はroot診断と反映後の表示確認待ちとして残す。

最終独立reviewはreview_audio_integration、9e読取で現時点must/should無し。最終8git/current SHA・3復元SHA・16PASS/型/Vite/2テーマDOM・HTTPS旧新両PASSの範囲を独立照合し、追加must/should無しで統合可。
