# 子利用状況UIの検証

製品source系列は `ac461eaa`（共通）→`65e9e1c3`（Web）→`521318e8`（TUI）→`e48b3220`（型外peer/nullable制御prop修正）→`ee26d314`（CSSのみ）。protocol依存`3b39f195`はbackend `ab519991`の重複で、統合時pick不要。実モデル/実マイク/通常利用者session/Windows操作は0。

関連テストは初回 core11 / Web52 / TUI46件が成功。固定521318のcore/TUI test-inclusive型0。Webは新しい任意boolean制御propの default:undefined だけが exactOptional に合わず1件失敗したため、e48で明示的なnullを非制御sentinelへ変更した。e48の最終Web test-inclusive型0、共通2製品source+関連testの対象型0、core build0。Web/TUIの不変部分の全体型を重複しない。最後のee26はCSSの3行だけで、未定義の変数を使わず既存AccountCardのgraphと同じtrack/geometryに揃えた（TypeScript差分なし）。各sourceと型結果は `type-results.json` とmanifestに保存する。

新規共通reader/formatterには既存版が無いため、scope guard撤去と未報告totalの合算を限定mutationとして注入し、4件の意味回帰が失敗した。Web Info/TUI2sourceは旧d442 wiringへ戻してWeb1/TUI5件と実DOMが失敗した。5runtime全てgit管理領域の専用recoveryに永続保存したbytesから復元しSHA256完全一致、その後 core11/Web52/TUI46件とDOMが再成功。生出力は `negative-{core,web,tui,browser}.log` / `restored-{core,web,tui,browser}.log`、5SHAは `restoration.json`。

後続の型外peer reason/enum回帰6件は旧521 formatterで失敗し、e48へSHA64047683…完全復元して17件成功。`fix-negative.log` / `fix-restored.log` / `fix-restoration.json`。正式backendの型通り応答で発生した失敗ではなく、旧/不正shapeを受ける境界の防御である。

Chromiumへ実Vue/Pinia/Info/子会話を載せ、生成metadataだけで4テーマを確認した。初期展開前usage RPC0、Infoと子会話の同じ部品、hasTranscript=falseでも数値取得、正式fieldだけ/未報告totalなし/親加算なし、self-subtree、実観測日時、USD、partial/scanning/歴史理由、context graphの色・track、390px、scroll後も送信ボタン到達可能、入力RPC0、pageerror0を確認。One Light/Soda darkとfooter終端の画像を実見した。fixtureをhasTranscript=falseにした追加実行の初回は型compiler並行中に自作3秒navigation上限でtimeoutしたため、実装失敗とはせず、navigationだけ20秒へ直した最終fixtureで成功した（`restored-browser-no-transcript.log`に失敗を残す）。`final-browser.log` / `browser.json` が最終結果。own Chromium/Viteはfinallyで停止済み。

全リポジトリbuild/test、実provider呼出し、利用者の起動設定変更は行っていない。終了子一覧の会話側入口はbackend RPC未固定の次単位として未完を保持する。情報画面へ履歴は戻さない。差分全体の独立レビューは実装者以外のbackend/rootで実施する。
