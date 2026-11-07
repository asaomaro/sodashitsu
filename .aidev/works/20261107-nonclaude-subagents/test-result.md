# 検証

Node 24.22.2。独立worktreeの依存とdistを使用。全体testは今回のauthorでは再実行せず、統合後にrootが調整する。

- 関係4files 25tests pass、exit0。production composeServerの起動/正式親UUID復元/記録読み取り/既存WS event・snapshotのcount1→0/reader closeを含む。`evidence/positive.log`。
- server typecheck exit0: `evidence/typecheck.log`。
- server build exit0: `evidence/build.log`。
- source/docsの`git diff --check` pass。raw証跡logは出力を保ち、末尾の空行もそのまま保存した。実CLIの採取範囲と制約はprobe.md、raw由来サニタイズfixtureはpackages/server/src/agent/fixtures/native-subagents。

## 負対照（生出力）

以下のraw logは要約へ置き換えず保存した。各試験は該当実装だけを一時的に旧動作へ戻し、finallyで元のbytesを復元。`evidence/negative-restores.json`にexitCode/byteExact/SHA256がある。Reader/Service/composeのSHAは最終source-sha256.jsonとも一致する。

- [CHUNK旧判定](evidence/negative-chunk.log): 4MiB直後のcompletedを未読のままactiveを出す旧動作で1fail。
- [fresh確認除去](evidence/negative-fresh.log): 旧refを新instanceへ付ける/非同期read中の証拠失効で2fail。
- [scope clear除去](evidence/negative-scope.log): 同instanceで親session消失/種類不一致時に旧値が残る動作で2fail。
- [production start配線除去](evidence/negative-wiring.log): 正式親refは復元されるがWSへcount1が出ず1fail。parser/serviceのunitだけで配線欠落を見逃さない。

初回の結合テストはagentSessionのreportedAtを含めた完全一致assertionが不適切だったため失敗した。識別情報のtoMatchObjectへ修正後、正式親所属と配信のpositiveを確認した。型検査初稿のexactOptionalPropertyTypes 2件も修正済み。

Copilot実probeはmodel_not_supportedで打切り。Copilotの生成unit fixtureを実CLI往復の成功とは扱わない。Windows nativeの実会話/親のOS終了での確認はこの検証に含まない。
