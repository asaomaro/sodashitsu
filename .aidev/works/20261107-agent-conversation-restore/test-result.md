# 検証

Node24.22.2。関連4ファイル145test pass。MemoryHostと生成した会話fixtureのみを使用し、利用者の会話やAPIは呼ばない。保存/復元はhook/argv/stop由来の根拠を5種で検査し、送信待機中のPJ変更・別actorを拒否する。ProcessMatcherは明示UUID、競合、picker/name/latest/prompt/子agentを検査する。

回帰負対照は新しいテストを維持しProcessMatcher.ts/SessionService.tsだけHEADへ戻して実行。10failed/115passedで修正欠落を捕捉した。finallyで両ファイルをbyte exact復元した。生出力は[negative.log](negative.log)、修正後は[positive.log](positive.log)、復元結果は[byte-exact.json](byte-exact.json)。server `pnpm --filter @sodashitsu/server run typecheck`はexit0。`git diff --check`も通過。
