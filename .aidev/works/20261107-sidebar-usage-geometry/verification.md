# responsive sidebar の追加購読理由

元764の生成RPC再現: footerOFF、63桁、実layout.sidebar無し、prefs.sidebarCollapsed=falseのままでもusage_watch.on=trueを維持。新回帰がfalse期待で失敗した（baseline.log）。

実computeLayout結果の可視sidebarを次のusageWantedへ渡す内部フラグを追加。設定上の開閉だけを可視証拠にしない。layout()をusageWantedから呼んで再帰させず、既存layout後syncへ反映。dashboard/info/footerの購読理由は変更しない。

回帰はwide on→63桁hidden off→明示info on→info閉off→wide再表示onを実RPCで確認。23関連テスト/パッケージ型0。修正済みsourceだけ旧HEADへ戻したnegative1fail→byteexact復元23pass（restore.json/SHA/raw logs）。全体CI/実pane/CLI/Windows操作なし。
