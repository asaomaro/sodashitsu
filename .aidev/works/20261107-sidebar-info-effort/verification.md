# 親子一覧 effort / 共通情報窓

base1d68dd64。子effort先行941e4c6bを5f6484d0で取込（root既取込のため再pick不要）。独自runtimeは adc4d271（共通表示）→f630f1dc（Web）→362cb1d0（TUI）、この最後の文書・証跡commit。

親のsame-kind/paneId観測モデル後へeffort。既存statusline formatterを固定enabled/effort=trueで再利用し、footerの表示設定と独立。basis/source/観測時刻tooltipを保持。モデル未取得でeffortだけならeffortと明記。子はoptional value+basisのみ、creationは「開始時」、turnは「記録」。希望起動値/モデルsuffix推測を入力にしない。失効usage/null/別kind/paneは省略し、serverのinstance/session guardと失効配信を維持する。

Webの親1行目infoはPaneActionsと同一SVG部品/24px/同じhover、targetを可視化して既存togglePaneInfo。子開閉は2行、custom1行は同じ行。末尾詳細・記録削除、PaneInfoViewへSubagentListを列ラベル横でなく全幅sectionへinline。64件/ほかn/内外scrollを保持し、同一覧dialogへ遷移しない。既存menu/keysの一覧導線は維持。TUIも[i]で既存showUsageOf、同窓内子情報、2行/1行fallbackと狭幅省略。

実データ購読理由もWebmain/TUIへ追加。sidebar展開＋agents可視＋agent存在の間だけ既存watchを共有。TUIの実RPC回帰はfooter無効→sidebar縮小でoff→再表示on→usage_changedからobserved model/effort描画→agents折畳みでoffを観測。独立旧TuiAppだけのnegative1failで検出力を確認。

検証: helper6、Web231（Sidebar/PaneInfo/PaneActions/golden）、TUI32、最終全幅info16再確認、corebuild/3package型すべて0。golden変更は展開Sidebarの親info4個だけ、collapsedは無変更。自作DOMfixtureでinfo1行/開閉2行・親effort・子開始時・同window・no separate list・フォント13.6px一致・unknown circle・24px・4テーマを観測、PNG同梱。最終imageを実見しinline幅を調整済み。

旧製品7fileのnegativeはWeb/TUI/browser全失敗、byteexact復元後全成功（restore.json/raw logs）。最終info配置調整も旧PaneInfoView negative→byteexact復元16pass（restore-info-final.json）。生成record/DOM/偽RPCだけ、通常pane/利用者設定/OS clipboard/Windows/mic/新モデルturnは操作なし。全体CIの重複なし。root独立reviewへ渡す。
