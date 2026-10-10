# decisions: e2e-fake-agent

## D1 E2E の共通の道具で、シェルを rc を読まない bash にする
`startAppServer`（`support/appServer.ts`）が、`composeServer` の `shell` に、`bash --norc --noprofile` を `exec` する包み（`<stateDir>/test-shell/bash`。名前は `bash`＝シェルの種類を名前で見分ける処理に合わせる）を渡す。`HOME` を差し替える案は、Playwright のワーカー全体（ブラウザ・キャッシュの場所）に効くので採らない。製品の既定（`SHELL` を rc つきで起動）は変えない。bash が無い環境（Windows）は、今までどおり。fork の spec（`feature/agent-fork-2`）の、spec ごとの `SHELL` の差し替えは、この道具に寄せられる（そちらは触らない）。

## D2 守りは「打ち込みの前に pane で `command -v`」
pane のシェルそのものが答える（`command -v <name> > file`）ので、rc・PATH・別名のどれで決まっても、実際に打ち込まれる先を見る。偽のものを指さなければ、**何も打ち込まずに** `Error` で落とす（理由に、実物のパスと、HOME/rc の可能性を書く）。偽のフォルダは `realpath` で比べる。

## D3 結合テストは、HOME を一時にしている（既存）ものに、守りだけ足す
`attribution`・`resumeLost`・`subagents`・`lineage`・`fork` は、すでに HOME を一時にして rc を読ませない。守りだけ足す。`composeServer.integration.test.ts` の 1 本は、HOME が実物だったので、HOME・ENV を差し替える（試験の後で戻す）。

## D4 graph-add の偽の `claude` は、これまで検出されていなかった
`exec -a claude bash -c "…; sleep 600"` は、bash が最後の `sleep` を直接 exec して、名前が `sleep` になる。末尾に `:` を足して、名前を保つ。これまでの「エージェントを足す」は、**実物の `claude` のおかげで通っていた**。
