# 状況画面の親子表示

- 対象: Web screens/screens.ts の dashboard（状況）→DashboardView、TUI UsageDashboard。親の既存row生成/usage集計/並び順は保持し、表示上だけ子の開閉と会話導線を追加する。
- 展開状態は親instanceとmachine/clientのscope、上限256。子は64件＋残り件数、状態icon/セッション名→正式取得model+effort。子を親の独立paneと扱わず専用会話store/contextへ渡す。mobileは状況modalを閉じてから渡し、desktopは状況画面を保持する。
- Web11test/TUI13test成功。旧2製品sourceへ戻すとWeb2＋TUI2test/実DOMが失敗→2SHA byteExact復元で11＋13/DOM成功。restoration.json/negative/restored生log。
- Web実DOM4テーマ＋390px狭幅、親metric1回/同値、折畳badge、2行同font、unknown状態icon、keyboard子会話と送信0を確認。4PNG目視。TUI実compiled Grid4テーマでも親metric1回/子mouse会話を確認。
- root独立review P2: scrollbar offsetがviewport先頭entryをselectedにしたため、末尾に届かない。13617b22でviewport末尾に収まるentryへ補正。64子の実thumb最下端drag→最後の子を表示・Enterでc63選択を検証。旧9c98で新回帰1fail→source byteExact復元14test成功。scrollbar-restoration/negative/restored.log。
- exact9c98b169/cleanでWeb/TUI test-inclusive型0。Web sourceは13617からも不変、exact13617/cleanでTUI型0・build0・compiled Grid成功。final-source.json/型logに記録。rootの全体batch検査は別であり再実行しない。
- 先行Web fixtureのkind型だけを027faa4eで修正。exact027faa/clean Web型0の元receiptも同梱。前の型logがfixture追加前だった点はrootへ明示訂正済み。
- rootはruntimeとscrollbar追加fixを独立reviewしmust/should無し。これ以降この差分の製品source変更なし。Windows/実モデル/利用者pane操作0。
- 子への正式direct能力・終了子一覧入口・子usageは次の単位として元台帳へ維持。この差分で対応済みとは主張しない。
