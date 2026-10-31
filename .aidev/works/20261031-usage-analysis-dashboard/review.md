# Independent review

Risk taskcheck: review_transfer（別コンテキスト）で集計/RPC/runner/履歴を点検。

- 履歴累計reset後の同値衝突: 実イベントtimestampをdedup keyへ追加。負例で検出を確認。
- pending cacheをevictして無制限走査: cacheとは別のphysical active<=2枠とfinally解放を追加。負例で検出を確認。
- pending promiseのcaller取消共有: 完了値だけをcache。
- deadline: performance.now。
- 認可取消: 取得前/await後/spawn直前/実行中/完了直前をcheckし中止。
- contextTokens/window/pctをreport数値へ追加。

UI review: review_pointer（別コンテキスト）でlazy導線/期間/グラフ/report/browser/CIを点検。旧履歴表示中のrangeを保持し、scopeを現在pane+選択アカウント+期間に統一。欠損日のtooltipとカレンダー枠を未取得にし、0除算を防止。CIのactual/generated出力を分離。

最終cross: review_transferが全差分28filesを点検し追加must/shouldなし（snapshot集合SHA256 92f4844292f6299386df332cfb9ea1a5081b76476caa7ec95588164fc8d1370c）。review_pointerも追加delta指摘の修正を確認。後続のApp.test async描画待ちは描画rowを観測する2行のみで、対象Appを含む46testsが成功。生成RPCブラウザはhostedで成功し、スクリーンショットをrootでも確認。actualWSのlocator修正は追加delta点検を依頼する。
