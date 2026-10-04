# レビュー記録

## タスク点検ログ（coding 工程内）

- T1: UNC パス（`\\host\share`）を `classifyMediaRef` が通していた（Windows のサーバが外部の SMB へ繋ぐ）→ 拒否に直した。`lang`・`group` が文字列でないときは誤りにせず捨てる（`str()` の既存の流儀。`code` だけが誤り=ask.py と同じ）、`view` の件数超過は他の上限と同じ `too_large`、`view.text` の長さは定義全体の 256 KiB が歯止めなので個別の検査は足さない、と判断（指摘は据え置き）。
- T2: `AskMediaParams.id` の上限が 1 大きかった（0 始まりで最大 31）→ 直した。import の並び・`ASK_MEDIA_CHUNK_BYTES` と `FILE_CHUNK_BYTES` の参照元は、値が同じ（768 KiB）ので据え置き。
