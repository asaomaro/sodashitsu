# Grok終了attemptの正式proofと履歴読取り

Base bb4dc23c（Cursor history先行runtime、後続Cursor65df6571は証跡のみ）。別treeでNative/Grok/composeの必要最小接続を追加し、固定Cursor sourceへ混在させない。実モデル・provider login・Windows操作0。

正式な_x.ai/session/updateのspawn/finished、exact parent/child UUID、nonempty attempt、event ID・正式時刻だけを使う。finished.completed/failed/cancelledはcompleted/error/abortedへ対応する。unknown/foreign/no-start/missing attemptは歴史を0件成功にしない。新spawn・新attempt・未処理の親append/partial・親namespaceの置換/rewind/forgetでは旧proofを失効させる。active countの復活や親設定からのモデル補完は行わない。

GrokReader private namespaceはstate生成/record resetごとにUUID、同じ内容の再作成でも旧entryIdを再利用しない。getterは既存EOF foldからのみproofを作り、scan/CLI/daemon/modelを起動しない。read前後はverified親のpane/instance/kind/refとNativeService.knownを確認する。parent所有closureへ短命なlist API leaseを閉じ込めず、各verify/openにその要求のallowedを別に渡す。

Parent proofはcurrent foldの最後の正式terminal attemptを再照合し、safe opened parentのdev/ino/size/mtime/ctime・全EOF・path revisionをbefore/after確認する。4 physical verifiersをfd closeまで保持。caller deadlineは既存history 2s/collector1500ms、late結果は破棄。CHUNK4MiB/file512MiB/line256KiB/events20k/children256/attempts256は維持。

本文chat_history.jsonlと数値usage.jsonは用途別の正式safe opener。client pathは受け取らず、leaf/path/fd identity・単一file・nlink・no symlink・size上限とparent proofを再確認する。usageは既存独立history singletonの数値engineへexactentry targetとして供給し、旧current/B grantの拒否を無条件解除しない。親ledgerを子へ転用/加算せず、正確な子IDのreported USD ticksだけを使う。context/モデル単価/現在設定は捏造しない。

履歴モデルは正式spawnのeffective model（creation由来）を保持する場合があり、最後の子turn/current modelとは断定しない。既存currentの子ModelChanged/effort取得経路は保持する。hasTranscriptは正式子sessionと安全openerの読取り材料の印で、ファイルの実在/不変性は各本文要求で再検査し、missing/unreadable時は現在の子へfallbackしない。

検査対象: formal terminal fold、parent namespace/reset/current、sourcekind/fresh失効、4physical/lateclose、用途別安全open、Native→history→child-only数値、認証WS配線。独立review必須。生成CLI/recordは実Grok live/model再開の実測とは区別する。Cursor数値/current取得、他provider新終了collection、Claude即resume制約、保護音声実機、署名IDD依存の残件は維持。
