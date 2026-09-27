# テスト結果: サイドバー行の独自トークンと、行の並び・色の条件付け（H21）

## 実行したもの

- `pnpm -s build` — exit 0。`pnpm -s typecheck` — exit 0（出力と終了コードを別に残した。パイプに通していない）
- `pnpm -s test`（ルートの vitest。全パッケージ）— **241 files / 4666 passed / 0 failed / 0 skipped**（負の確認で見つけた穴のテストを足した後の最後の 1 回。
  その前の 1 回は 4665 passed。再実行なし）
- 負の確認（変異 52 本。下の節）— 1 本ずつ直列に、対象のテストファイルだけを走らせた
- `aidev smoke` — pass（exit 0、7 本。2 本目〔`pnpm --filter @wtm/cli run smoke`〕に今回の report-metadata の段を足した）
- 負荷試験・E2E は行っていない（ユーザーの指示。共有マシン）。起動したサーバ・子プロセスはテスト・smoke が片付けた（`pgrep` で残りが無いことを確かめた）

## 受け入れ基準ごとの判定

- AC1: pass — `composeServer.metadata.integration.test.ts`（実物の composeServer: 報告 → ほかの接続へ `workspace.updated`・後から繋いだ snapshot の `tokens`）、`MetadataService.test.ts`（触れない名前は残る・消去・変わらなければ写さない）、`SessionService.tokens.test.ts`、smoke（ビルドした wtmctl で `{}`・snapshot に載る・消去で消える）。
- AC2: pass — 同じ結合テストの pane 版（`pane.updated`・snapshot）、`MetadataService.test.ts`、smoke。
- AC3: pass — `metadataTokens.test.ts`（前後の空白〔Rust の trim と同じ集合〕・Cc・80 コードポイント・切った後の空白・空は消去・後が勝つ）。
- AC4: pass — `metadataTokens.test.ts`・`MetadataService.test.ts`（各 code と文言・検査の順）、結合テスト（実際の RPC の code・何も配らない）、smoke（`invalid_metadata_source` で終了コード 1）。
- AC5: pass — `metadataTokens.test.ts`（isFresh・枠 32・消去や期限で戻らない）、`MetadataService.test.ts`（古い報告は成功・何もしない、33 個目は limit、キー数の上限より先に古さを見る）。
- AC6: pass — `metadataTokens.test.ts`（期限はその報告の名前だけ・設定し直すと外れる・古い締め切りで新しい値を消さない）、`MetadataService.test.ts`（偽の時計とタイマー、1 つのタイマー、`unref`、dispose）。
- AC7: pass — `MetadataService.test.ts`（pane.closed・workspace.closed で帳簿を捨てる）、結合テスト（`session.json` に `"tokens"` が無い、閉じた pane は not_found）。
- AC8: pass — `cliArgs.test.ts`（`=` の有無での見分け・順・誤り 12 通り）、`commands/workspace.test.ts`・`pane.test.ts`、`skill.test.ts`、smoke（キャッシュの無い HOME で接続の token と独自トークンを混ぜ、tokens がちょうど `{build}`）。
- AC9: pass — `Sidebar.test.ts`（HTML の値が文字のまま・要素が増えない、`$constructor` 等を描かない）、`resolveRows.test.ts`（hasOwn・受け継いだ値を引かない・style に不正な色を入れない）、`rowLayout.test.ts`（色の検査）。
- AC10: pass — `Sidebar.defaultLayout.test.ts`（**変更前の `Sidebar.vue` で取った golden** と比べる。golden のハッシュは coding の前後で同じ——`scratchpad/golden.sha256`）と既存の `Sidebar.test.ts`（変更なしで通過）。
- AC11: pass — `rowLayout.test.ts`（読み込みの落とし方・上限）、`settings.test.ts`（保存・読み戻し・storage の追従）、`SidebarRowsSettings.test.ts`（行・トークンの編集）。
- AC12: pass — `resolveRows.test.ts`・`Sidebar.test.ts`（値の無いトークン・空の行・代わりの行・開閉の印の位置・畳んだとき）。
- AC13: pass — `resolveRows.test.ts`（tokenStyleAttr）、`Sidebar.test.ts`（style）、`SidebarRowsSettings.test.ts`（色の検査・既定／入／切）。
- AC14: pass — `rowLayout.test.ts`（herdr の rules.rs のテストと同じ場面: 最初に当たったもの・ASCII だけ畳む・空の条件・数の読み方・hide）。
- AC15: pass — `SidebarRowsSettings.test.ts`（確認を経て戻す・`sidebarRows` の項目が消える）、`settings.test.ts`。
- AC16: pass — 全 4666 件と `aidev smoke`（下の生出力）。
- AC17: pass — `docs/herdr-parity.md` H21 を更新（タスク点検 T11・cross で実装と照合）。
- AC18: pass — 結合テスト「ログインしていない接続は WebSocket を開けない（401）」。新しい待ち受けは足していない（`composeServer.ts` の差分は組み立てと終了だけ）。
- AC-I1〜AC-I5: pass — `SidebarRowsSettings.test.ts`（開閉と aria-expanded・下書きと確定・閉じるときの確定・確認の Esc が外へ漏れない・削除／移動／上限の後のフォーカス・ネイティブの部品だけ）。キーが prefix へ漏れないことは既存の設定画面の仕組み（`main.ts`）のままで、実ブラウザでは確かめていない（下の穴）。

## 起動確認（aidev smoke の生出力の抜粋）

```
smoke: workspace.create ok (pane p2)
smoke: pane.subscribe ok
smoke: echo round trip ok
smoke: PASS
smoke(cli): wtmctl workspace/pane report-metadata ok (normalized, in snapshot, cleared, bad source refused)
smoke(cli): wtmctl pane attach ok (in a real PTY: size 100x30, echo round trip, resize 90x25, Ctrl+B q exit 0, left the alternate screen)
smoke(cli): wtmctl pane observe/control ok (pipes: full first frame, control size 100x30, NDJSON input round trip, invalid line warned, release exit 0, observe pane_closed exit 0)
smoke(cli): PASS
handoff-smoke: ok
stop-smoke: ok
smoke: pass (exit 0, 7 本)
```

`smokeCommands` に行は足していない——今回の入口（`wtmctl workspace|pane report-metadata`）は既存の 2 本目（`pnpm --filter @wtm/cli run smoke`）の中に段を足した。

## 失敗の証跡

受け入れ基準の検証の失敗は無い。coding 中に build が型で落ちた（新しいエラーの code を `ErrorCode` に足していなかった）:

```
packages/server build: src/metadata/metadataTokens.ts(35,40): error TS2345: Argument of type '"invalid_metadata_source"' is not assignable to parameter of type 'ErrorCode'.
```

### 負の確認（規約 regression-negative-control。変異の網羅）

`scratchpad/negctl/sweep.py`: 主要な判断を 1 か所ずつ壊し、対応するテストファイルだけを 1 回走らせ、落ちることを確かめてから元に戻し `filecmp`（バイト比較）で一致を確かめた。
生のログは `scratchpad/negctl/logs/<id>.log`（作業場所。コミットしない）。**52 本。最初の一巡で 4 本が生き残り、3 本はテストを強めて落ちることを確かめ直した。1 本は等価な変異。
1 本（`ms-sweep-delete-all`）は変異がコンパイルできずに「落ちた」だけだったので、正しい変異で取り直した**。すべて元に戻した（cmp 一致）。

生き残ったもの（強める前の生の出力）:

```
cli-seq-omitted-key SURVIVED 0 cmp ok Tests  8 passed (8)
rr-hasown SURVIVED 0 cmp ok Tests  16 passed (16)
sb-empty-class SURVIVED 0 cmp ok Tests  2 passed (2)
srs-external-clear SURVIVED 0 cmp ok Tests  28 passed (28)
```

- `cli-seq-omitted-key`（`seq` を無条件に代入）: `toHaveBeenCalledWith` が `undefined` の項目を同じと見ていた。キーの集合を直接見るテストにした → `KILLED 1 … 1 failed | 7 passed (8)`。
- `rr-hasown`（`Object.hasOwn` を外す）: `typeof v === "string"` がプロトタイプの関数を弾くので既存のテストでは差が出なかった。受け継いだ**文字の**値（プロトタイプ汚染）を引かないテストを足した → `KILLED 1 … 1 failed | 16 passed (17)`。
- `srs-external-clear`（外からの差し替えで下書き・開閉を捨てない）: テストの差し替えが位置を消していたので、確定の関数の位置の守りだけで通っていた。同じ位置に別のトークンが来る差し替えにした → `KILLED 1 … 1 failed | 27 passed (28)`（下の生の出力）。
- `sb-empty-class`（`v-bind` のオブジェクトに `class: undefined` を入れる）: **等価な変異**。Vue は `v-bind` のオブジェクトの `class: undefined` では属性を描かない（`:class="undefined"` は空の `class=""` を描く——こちらは golden が捕まえた。coding 中に実際に起き、`textTokenAttrs` で直した）。

```
 FAIL  src/components/SidebarRowsSettings.test.ts > SidebarRowsSettings — 位置に結び付いた状態とフォーカス（タスク点検 T10 の指摘） > ほかのウィンドウの変更で並びが差し替わったら、下書きと開閉を捨てる（別のトークンへ書かない）
AssertionError: expected [ DOMWrapper{ …(3) } ] to have a length of +0 but got 1
      Tests  1 failed | 27 passed (28)
```

落ちた変異の例（生の出力）:

```
=== mt-trim-js（前後の空白を JS の trim にする）
 FAIL  src/metadata/metadataTokens.test.ts > normalizeMetadataSource（AC4） > 前後の空白は Rust の trim と同じ集合（U+0085 は除き、U+FEFF は除かない）
 FAIL  src/metadata/metadataTokens.test.ts > normalizeMetadataValue（AC3） > 前後の空白は Rust の trim と同じ集合（U+0085 は枠を食う前に除き、U+FEFF〔Cf〕は残す）
=== rr-diverged（ずれの判定を ahead だけにする）
 FAIL  src/components/Sidebar.defaultLayout.test.ts > Sidebar — 既定の並びは変更前の描画と同じ（AC10） > 展開したサイドバー
 FAIL  src/sidebar/resolveRows.test.ts > resolveSpaceLines（spaces） > 既定の並び: ずれていなければ 1 行、ずれていれば 2 行目にブランチと ↑↓（今の描画と同じ条件）
=== ms-sweep-delete-all（期限の掃除の失敗で常に帳簿を捨てる）
 FAIL  src/metadata/MetadataService.test.ts > MetadataService — 期限（AC6） > 対象が無い以外の失敗では帳簿（seq の記録）を残してログに出す
```

落ちた 48 本の内訳（id）: server の規則 15（source の文字種・長さ、TTL の両端、制御文字、80、trim、16、名前の長さ・文字種、seq の `>`、枠 32、同じ値の締め切り、`<=`、`fromEntries`）、配線 8（古さの判定・キー数・表に入れる・変わらないと写さない・pane.closed・掃除の失敗・unref・掛け直しの順）、session 2（置き換え・保存しない）、CLI 3、web の規則 8、解決 4、Sidebar.vue 3（主の行のクラス・開閉の印の位置・既定の並びの順）、store 1、設定画面 4。

## 未検証の穴

- **実ブラウザでの見た目と操作**（E2E を行っていない）: 設定画面の部品のキーボード操作・フォーカスの移動・既存のキーの経路への漏れ（AC-I3・AC-I5）は happy-dom の単体テストだけ。`details`/`summary` のネイティブの開閉、disabled になったボタンのフォーカスの外れ方はブラウザごとの挙動で、happy-dom では確かめていない。
- **既定の見た目**は DOM（要素・クラス・属性・文字）の一致で確かめた。CSS の効き方（style 属性の色・太字・不透明度が補足の行の既定の不透明度とどう重なるか）は目で見ていない。
- 期限のタイマーの実時間の動作は偽の時計だけ（実時間を待っていない）。smoke の pane の TTL は 10 分で、期限切れまでは見ていない。
- macOS・Windows では動かしていない（Linux だけ）。
