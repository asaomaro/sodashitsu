# 独立レビュー

review_pointer（実装とは別コンテキスト）がtaskcheckと全差分crossを実施。Provider/Relayの交渉とローカル許可、source purpose/key、virtual ready proof、pool marker除去、最終viewer退去とvirtual leaseの寿命、mic/control ownerを確認。製品sourceのmust/shouldなし。

crossのshould: 利用手順の旧「仮想併用不可」説明と共有マイクの旧制約を修正。E2E診断処理は除去し、失敗時のcleanupを維持。Chromiumの差は実行記録で明記し、成功へ読み替えない。

最終delta再レビュー: 製品/E2E追加mustなし。残ったLinuxマイクの旧説明も修正。負例rawは追跡対象negative-control.txtへ収録。
