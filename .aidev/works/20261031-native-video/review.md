# 独立点検（進行中）

review_pointerのkernel点検で、tick前のlate ACKが期限を消す、旧tick/startが新streamを停止/上書きする、取消前の物理job slotが世代跨ぎで再利用される、同UUIDでseq reset、failed candidateの未確認退役後fallbackを指摘。各修正と生成回帰を追加。source/helper配線とGStreamer実生成検証、Mac/設定の後に全体の独立レビューを行う。
