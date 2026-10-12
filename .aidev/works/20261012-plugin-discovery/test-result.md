# 検証

ビルド通過。関連ユニットテスト8ファイル130件通過。Web E2E6件通過（画面承認、クラシック/モダンD&D、枠なしD&D、外周outlineとgeometry）。
既存D&D E2Eは全DOMペイン数を固定1件と誤って仮定していたため、操作前後で件数を維持する確認に修正。

## 負例確認：枠なし名前の表示条件だけ以前に戻す

テストが失敗し、元のファイルバイトへ完全復元したことを確認。生出力：

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/web| src/components/paneInfo.test.ts (15 tests | 1 failed | 14 skipped) 67ms
   × keeps a floating draggable pane name when borders are hidden and agent naming only changes the text 65ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/components/paneInfo.test.ts > keeps a floating draggable pane name when borders are hidden and agent naming only changes the text
Error: Unable to get .pane-frame-name-floating within: <div data-v-b1804e4c="" class="pane-frame pane-frame-enabled" data-pane-id="p1" role="group" aria-label="pane「alpha」" style="--soda-pane-actions-w: 252px; padding: 0px;">
  <!--v-if-->
  <div data-v-b1804e4c="" class="pane-frame-edge pane-frame-edge-flush" role="button" tabindex="-1" aria-haspopup="menu" aria-expanded="false" aria-label="pane「alpha」のメニュー"></div><!-- 表示の面（パネル・帯）の有無で `<slot />` の位置を変えない（葉を作り直さない）: `enabled` のときは常に row > main の中に置く。 -->
  <div data-v-b1804e4c="" class="pane-frame-body pane-frame-body-displays">
    <!--v-if-->
    <!-- 4 つの側は、別の位置の `v-if`（1 つの `v-for` にしない。枠〔iframe〕を DOM の中で動かさないため）。 -->
    <!--v-if-->
    <div data-v-b1804e4c="" class="pane-frame-row">
      <!--v-if-->
      <div data-v-b1804e4c="" class="pane-frame-center">
        <div data-v-b1804e4c="" class="pane-frame-main" data-pane-frame-main="">
          <div class="fake-leaf"><textarea class="fake-terminal"></textarea></div>
        </div>
        <!-- 浮いた窓の層（端末の領域の箱の中だけ。`.pane-frame-main` の兄弟なので、操作中に端末を薄くする `opacity` が窓に掛からない）。
               `v-for` は出た順のまま（並べ替えない＝枠〔iframe〕を動かさない）。重なりは `z-index`。 -->
        <!--v-if-->
        <!-- 操作ボタン（モダンだけ。名前の行が無いときは、端末の領域の右上の隅に重ねる。浮いた窓の層より下） -->
        <div data-v-2341aba7="" data-v-b1804e4c="" class="pane-actions pane-actions-corner" role="group" aria-label="pane「alpha」の操作" data-pane-actions=""><button data-v-2341aba7="" type="button" class="pane-actions-btn" tabindex="-1" data-pane-action="info" aria-label="利用状況（情報）" title="利用状況（情報）" aria-pressed="false"><svg data-v-2341aba7="" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
              <circle data-v-2341aba7="" cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" stroke-width="1.3"></circle>
              <path data-v-2341aba7="" d="M8 7.2v4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>
              <circle data-v-2341aba7="" cx="8" cy="5" r="0.9" fill="currentColor"></circle>
            </svg></button><button data-v-2341aba7="" type="button" class="pane-actions-btn" tabindex="-1" data-pane-action="add-view" aria-label="このペインにビューを追加" title="このペインにビューを追加"><svg data-v-2341aba7="" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <rect data-v-2341aba7="" x="2" y="2" width="12" height="12" rx="1" fill="none" stroke="currentColor"></rect>
              <path data-v-2341aba7="" d="M8 5v6M5 8h6" stroke="currentColor"></path>
            </svg></button><button data-v-2341aba7="" type="button" class="pane-actions-btn" tabindex="-1" data-pane-action="compact" title="文脈を圧縮" aria-label="文脈を圧縮">↘</button><button data-v-2341aba7="" type="button" class="pane-actions-btn" tabindex="-1" data-pane-action="usage" title="利用状況" aria-label="利用状況">%</button><button data-v-2341aba7="" type="button" class="pane-actions-btn" tabindex="-1" data-pane-action="permissions" title="承認モード" aria-label="承認モード">✓</button>
          <!--v-if--><button data-v-2341aba7="" type="button" class="pane-actions-btn" tabindex="-1" data-pane-action="split-right" aria-label="右へ分割" title="右へ分割"><svg data-v-2341aba7="" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
              <rect data-v-2341aba7="" x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"></rect>
              <path data-v-2341aba7="" d="M8 3v10" stroke="currentColor" stroke-width="1.3"></path>
            </svg></button><button data-v-2341aba7="" type="button" class="pane-actions-btn" tabindex="-1" data-pane-action="split-down" aria-label="下へ分割" title="下へ分割"><svg data-v-2341aba7="" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
              <rect data-v-2341aba7="" x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"></rect>
              <path data-v-2341aba7="" d="M2 8h12" stroke="currentColor" stroke-width="1.3"></path>
            </svg></button><button data-v-2341aba7="" type="button" class="pane-actions-btn" tabindex="-1" data-pane-action="zoom" aria-label="最大化" title="最大化" aria-pressed="false"><svg data-v-2341aba7="" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
              <path data-v-2341aba7="" d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg></button><button data-v-2341aba7="" type="button" class="pane-actions-btn pane-actions-close" tabindex="-1" data-pane-action="close" aria-label="閉じる" title="閉じる"><svg data-v-2341aba7="" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
              <path data-v-2341aba7="" d="M3.5 3.5l9 9M12.5 3.5l-9 9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>
            </svg></button>
        </div>
      </div>
      <!--v-if-->
    </div>
    <!--v-if-->
    <!--v-if-->
    <!--v-if-->
    <!--v-if-->
  </div>
  <!-- ドロップ先のゾーン（縁/中央）表示（20260924-pane-dnd-split-move。design「振る舞いの詳細 >
         視覚フィードバック」AC4）。`.pane-frame-body`（端末）より後に置く理由は下の `.pane-frame-name`
         と同じ（z-index:auto は DOM 順で決まる）。 -->
  <!--v-if-->
  <!-- `.pane-frame-body`（端末。DOM 順で後）より後に置く——z-index:auto の重なりは DOM 順で
         後のものが上に来るため、`.pane-frame-edge` の中に置くと端末の不透明な内容の下に隠れて
         見えなくなる（taskcheck が実際のスクリーンショットで発見。review.md 参照）。 -->
  <!--v-if-->
  <!--v-if-->
  <!-- 操作ボタン（モダンだけ）。名前の行があるときは、その右端（名前の後ろ。`.pane-frame-name` と同じ理由で端末より後ろに置く）。 -->
  <!--v-if-->
  <!--v-if-->
</div>
 ❯ VueWrapper.get ../../node_modules/.pnpm/@vue+test-utils@2.5.1_@vue+compiler-dom@3.5.43_@vue+server-renderer@3.5.43_vue@3.5.43_typescript@5.9.3_/node_modules/@vue/test-utils/dist/vue-test-utils.cjs.js:7333:15
 ❯ src/components/paneInfo.test.ts:248:150


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 14 skipped (15)
   Start at  11:44:35
   Duration  2.69s (transform 78%, import 11%, environment 8%, tests 3%)

  Transform  |@sodashitsu/web| transforming modules took 2.01s · 78% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

## 負例確認：ソース累積量の収集途中の上限

稼働中の全体テストに影響しないよう、ビルド済みモジュールを/tmpにコピーし、収集途中の上限だけ外して同じ3×8MiBと存在しない後続ファイルを参照した。期待する上限エラーに先行して後続ファイルの読み込みエラーになり、検証が失敗することを確認した。リポジトリの実装・成果物は変更していない。

```text
Expected bundle too large; actual: ENOENT: no such file or directory, lstat '/tmp/soda-negative-cap-AWaJ4p/unreadable-later'
```

## 最終確認

型チェック・ビルド通過。全体611ファイル10584件では10579件通過、旧名前行仕様の期待値5件が失敗。変更後仕様に合わせたテスト修正のみを行い、該当2ファイル36件が通過。テスト変更も独立レビュー通過。全体テストは重複実行していない。

生の全体失敗出力：

```text
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/components/PaneLayout.test.ts > PaneLayout — 枠の描画モードと隙間（AC1〜AC5・AC7・AC9） > 既定（常に・隙間入）：単一 pane も入れ子の分割も、各 pane の 4 辺に余白・選ばれた pane に強調（今と同じ。AC1）
AssertionError: expected [ '28px', …(3) ] to deeply equal [ 'var(--soda-pane-gap, 4px)', …(3) ]

- Expected
+ Received

  [
-   "var(--soda-pane-gap, 4px)",
+   "28px",
    "var(--soda-pane-gap, 4px)",
    "var(--soda-pane-gap, 4px)",
    "var(--soda-pane-gap, 4px)",
  ]

 ❯ src/components/PaneLayout.test.ts:478:29
    476|     mountWith(SINGLE);
    477|     useViewStore(pinia).focusPane("p1");
    478|     expect(paddingOf("p1")).toEqual(ALL);
       |                             ^
    479|     const w = mountWith(NESTED);
    480|     for (const p of ["p1", "p2", "p3"]) expect(paddingOf(p), p).toEqua…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯

 FAIL  |@sodashitsu/web| src/components/PaneLayout.test.ts > PaneLayout — 枠の描画モードと隙間（AC1〜AC5・AC7・AC9） > 分割時だけ：単一 pane の tab は余白・強調なし、分割（zoom 中を含む）は常にと同じ（AC2）
AssertionError: p1: expected [ '28px', …(3) ] to deeply equal [ 'var(--soda-pane-gap, 4px)', …(3) ]

- Expected
+ Received

  [
-   "var(--soda-pane-gap, 4px)",
+   "28px",
    "var(--soda-pane-gap, 4px)",
    "var(--soda-pane-gap, 4px)",
    "var(--soda-pane-gap, 4px)",
  ]

 ❯ src/components/PaneLayout.test.ts:496:65
    494|
    495|     mountWith(NESTED, { borders: "auto" });
    496|     for (const p of ["p1", "p2", "p3"]) expect(paddingOf(p), p).toEqua…
       |                                                                 ^
    497|
    498|     const zoomed = mountWith(NESTED, { borders: "auto", zoomedPaneId: …

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯

 FAIL  |@sodashitsu/web| src/components/PaneLayout.test.ts > PaneLayout — 枠の描画モードと隙間（AC1〜AC5・AC7・AC9） > 常に×隙間切：入れ子でも辺ごとに隣を判定し、隣と接する辺だけ 0（AC4・AC9）
AssertionError: expected [ '28px', '0px', …(2) ] to deeply equal [ 'var(--soda-pane-gap, 4px)', …(3) ]

- Expected
+ Received

  [
-   "var(--soda-pane-gap, 4px)",
+   "28px",
    "0px",
    "var(--soda-pane-gap, 4px)",
    "var(--soda-pane-gap, 4px)",
  ]

 ❯ src/components/PaneLayout.test.ts:516:29
    514|   it("常に×隙間切：入れ子でも辺ごとに隣を判定し、隣と接する辺だけ 0（AC4・AC9）", () => {
    515|     mountWith(NESTED, { gaps: false });
    516|     expect(paddingOf("p1")).toEqual([GAP, "0px", GAP, GAP]);
       |                             ^
    517|     expect(paddingOf("p2")).toEqual([GAP, GAP, "0px", "0px"]);
    518|     expect(paddingOf("p3")).toEqual(["0px", GAP, GAP, "0px"]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯

 FAIL  |@sodashitsu/web| src/components/PaneLayout.test.ts > PaneLayout — 枠の描画モードと隙間（AC1〜AC5・AC7・AC9） > 表示しない×隙間切はすべて 0。zoom 中の pane は root が描くので、隙間切でも辺はすべて外周（AC3・AC4）
AssertionError: expected [ '28px', …(3) ] to deeply equal [ 'var(--soda-pane-gap, 4px)', …(3) ]

- Expected
+ Received

  [
-   "var(--soda-pane-gap, 4px)",
+   "28px",
    "var(--soda-pane-gap, 4px)",
    "var(--soda-pane-gap, 4px)",
    "var(--soda-pane-gap, 4px)",
  ]

 ❯ src/components/PaneLayout.test.ts:525:29
    523|     for (const p of ["p1", "p2", "p3"]) expect(paddingOf(p), p).toEqua…
    524|     mountWith(NESTED, { gaps: false, zoomedPaneId: "p3" });
    525|     expect(paddingOf("p3")).toEqual(ALL);
       |                             ^
    526|   });
    527|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/5]⎯

 FAIL  |@sodashitsu/web| src/components/paneActions.test.ts > pane の枠の操作ボタン（モダン） > 名前の行が無いとき（枠の名前の設定が切）は、端末の領域の右上の隅（corner）に出す
AssertionError: expected [ 'pane-actions', 'pane-actions-row' ] to include 'pane-actions-corner'
 ❯ src/components/paneActions.test.ts:123:25
    121|     const { wrapper } = mountFrame("modern");
    122|     const g = wrapper.get("[data-pane-actions]");
    123|     expect(g.classes()).toContain("pane-actions-corner");
       |                         ^
    124|     expect(wrapper.get(".pane-frame-center").element.contains(g.elemen…
    125|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/5]⎯


 Test Files  2 failed | 609 passed (611)
      Tests  5 failed | 10579 passed (10584)
   Start at  11:45:52
   Duration  294.00s (tests 83%, import 8%, environment 5%, transform 4%)

Environment  |@sodashitsu/web| happy-dom was created 192 times · 50.46s total, 28% of tracked time
             create it once per worker with pool: 'vmThreads' (keeps per-file isolation) or isolate: false (shares it across files)
             learn more: https://vitest.dev/guide/improving-performance#test-environments


```

該当ファイルの再実行：

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu


 Test Files  2 passed (2)
      Tests  36 passed (36)
   Start at  11:51:24
   Duration  2.50s (transform 71%, import 11%, tests 10%, environment 9%)

  Transform  |@sodashitsu/web| transforming modules took 3.25s · 71% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

稼働中サーバーへhandoff完了。12ペインのモデルと9稼働PTYを保持。反映後plugin.discover成功（候補1件）。探索のみで、実プラグインの登録や起動は行っていない。
