# 設計

既存settings.statusへoptional progressを追加。runtime cache→bundled launch→controllerで工程とbytesを渡し、既存約2秒pollでUIへ反映する。総合完了率を捏造せず、ダウンロードのみ割合を表示し他工程は不定バーとする。キャッシュ再利用では取得・展開工程を飛ばす。キャンセル・世代ガードを進捗通知にも適用し、無効化後の古い通知を拒否する。readyはattached確認後だけ。保存・認証・ダウンロード検証・期限に変更なし。
