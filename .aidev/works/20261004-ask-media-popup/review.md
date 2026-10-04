# レビュー記録

## タスク点検ログ（coding 工程内）

- T1: UNC パス（`\\host\share`）を `classifyMediaRef` が通していた（Windows のサーバが外部の SMB へ繋ぐ）→ 拒否に直した。`lang`・`group` が文字列でないときは誤りにせず捨てる（`str()` の既存の流儀。`code` だけが誤り=ask.py と同じ）、`view` の件数超過は他の上限と同じ `too_large`、`view.text` の長さは定義全体の 256 KiB が歯止めなので個別の検査は足さない、と判断（指摘は据え置き）。
- T2: `AskMediaParams.id` の上限が 1 大きかった（0 始まりで最大 31）→ 直した。import の並び・`ASK_MEDIA_CHUNK_BYTES` と `FILE_CHUNK_BYTES` の参照元は、値が同じ（768 KiB）ので据え置き。
- T3: 合計の上限を読む前の `stat` で断つ（残りの予算を `readRegularFile` へ）・`st.size` が 0 のファイル（`/proc` 等）は上限+1 まで読んで確かめる・`open` に `O_NOCTTY`。直した。同じファイルが image/audio と view の両方に出たときは別の保持になる（キーが種類別）＝据え置き（合計には両方数える。安全側）。`ftyp` の brand を m4a に絞らない・`data:` の MIME の大文字・`;charset=` は受けない＝拒否側に倒れるので据え置き。
- T4: 検査済みのアドレスを順に試す（IPv6 の経路が無い環境）・名前解決にも時間の上限（`raceAbort`）・IP リテラルに SNI を付けない・実物の `https.request` の固定を自己署名の証明書の local サーバで確かめるテストを足した（`makeRealRequest({ca})`）・destroy の確認。直した。
- T5: 全体の合計に足した値を Entry に持たせて引く（`heldBytes`）・準備中に時間切れ/pane が閉じた/dispose・全体の上限で断った後の後片付けのテストを足した。差し替え口の名前（`askImageFetcher`）を design に反映。
