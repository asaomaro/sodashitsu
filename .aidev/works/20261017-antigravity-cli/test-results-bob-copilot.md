# Bob/Copilot 監査 回帰検証

## 負の対照

修正用テストだけを先に加え、実装は main のままで実行。表示名 bob と premiumRequests の要素未存在で 2 件失敗した。依存 dist 未ビルドによる最初の suite load 失敗は負の対照として数えず、protocol/client-core をビルドしてから再実行した。

```sh
pnpm exec vitest run packages/web/src/dashboard/dashboardModel.test.ts packages/web/src/dashboard/PaneInfoView.test.ts
```

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-antigravity

 ❯ |@sodashitsu/web| src/dashboard/dashboardModel.test.ts (12 tests | 1 failed) 27ms
   ❯ 数字の見せ方 (9)
     × Bob Shell と Copilot CLI の種類を表示名で出す 7ms
 ❯ |@sodashitsu/web| src/dashboard/PaneInfoView.test.ts (10 tests | 1 failed) 234ms
   ❯ PaneInfoView (10)
     × Copilot の AI クレジットとプレミアムリクエストを表示し、未取得の値は出さない 109ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/dashboard/PaneInfoView.test.ts > PaneInfoView > Copilot の AI クレジットとプレミアムリクエストを表示し、未取得の値は出さない
Error: Unable to get [data-pane-info-premium-requests] within: <section data-v-395bcb99="" class="pinfo pinfo-popover" data-pane-info="" data-pane-info-pane="p1" aria-label="pane の利用状況">
  <header data-v-395bcb99="" class="pinfo-head"><span data-v-e93665c8="" data-v-395bcb99="" class="state-icon" data-state="idle" data-symbols="on" role="img" aria-label="待機中" title="待機中">○</span><span data-v-395bcb99="" class="pinfo-name" title="GitHub Copilot CLI">GitHub Copilot CLI</span><span data-v-395bcb99="" class="dash-chip" data-pane-info-kind="">Copilot CLI</span></header>
  <dl data-v-395bcb99="" class="pinfo-dl">
    <dt data-v-395bcb99="">状態</dt>
    <dd data-v-395bcb99="" data-pane-info-state="">待機中<span data-v-395bcb99="" class="dash-muted pinfo-since">（2 分前から）</span></dd>
    <dt data-v-395bcb99="">モデル</dt>
    <dd data-v-395bcb99="" data-pane-info-model="">claude-sonnet-5-5</dd>
  </dl>
  <h3 data-v-395bcb99="" class="pinfo-sub">このセッションの利用状況</h3>
  <dl data-v-395bcb99="" class="pinfo-dl" data-pane-info-usage="">
    <dt data-v-395bcb99="">トークン</dt>
    <dd data-v-395bcb99="" data-pane-info-tokens=""><span data-v-395bcb99="" class="dash-num">8.64k</span><span data-v-395bcb99="" class="dash-muted pinfo-basis" title="会計の累計（記録の会計の行と、その後の記録の分）">累計</span></dd>
    <dt data-v-395bcb99="" class="pinfo-indent">入力</dt>
    <dd data-v-395bcb99="" class="dash-num pinfo-indent-value">1k</dd>
    <dt data-v-395bcb99="" class="pinfo-indent">出力</dt>
    <dd data-v-395bcb99="" class="dash-num pinfo-indent-value">2.35k</dd>
    <dt data-v-395bcb99="" class="pinfo-indent">キャッシュ読み</dt>
    <dd data-v-395bcb99="" class="dash-num pinfo-indent-value">5k</dd>
    <dt data-v-395bcb99="" class="pinfo-indent">キャッシュ書き</dt>
    <dd data-v-395bcb99="" class="dash-num pinfo-indent-value">300</dd>
    <!--v-if-->
    <dt data-v-395bcb99="">コスト</dt>
    <dd data-v-395bcb99="" data-pane-info-cost=""><span data-v-395bcb99="" class="dash-num">0.166 AIC</span>
      <!--v-if-->
    </dd>
    <dt data-v-395bcb99="">コンテキスト</dt>
    <dd data-v-395bcb99="" data-pane-info-context="">
      <!--v-if--><span data-v-395bcb99="" class="dash-num">—</span>
      <!--v-if-->
    </dd>
    <dt data-v-395bcb99="">更新</dt>
    <dd data-v-395bcb99="" data-pane-info-updated="" title="10/10/2026, 11:59:55 AM">5 秒前
      <!--v-if-->
    </dd>
  </dl>
  <h3 data-v-395bcb99="" class="pinfo-sub">セッション</h3>
  <dl data-v-395bcb99="" class="pinfo-dl">
    <dt data-v-395bcb99="">会話の id</dt>
    <dd data-v-395bcb99="" data-pane-info-session="">—</dd>
    <dt data-v-395bcb99="">作業フォルダ</dt>
    <dd data-v-395bcb99="" class="pinfo-path" title="/work/p1" data-pane-info-cwd="">/work/p1</dd>
    <dt data-v-395bcb99="">ブランチ</dt>
    <dd data-v-395bcb99="" data-pane-info-branch="">feature/x</dd>
    <dt data-v-395bcb99="">サブエージェント</dt>
    <dd data-v-395bcb99="" data-pane-info-subagents="">—
      <!--v-if-->
    </dd>
  </dl>
  <!--v-if-->
  <div data-v-395bcb99="" class="pinfo-foot"><button data-v-395bcb99="" type="button" class="pinfo-btn" data-pane-info-open-dashboard="">ダッシュボードを開く</button></div>
</section>
 ❯ VueWrapper.get ../../node_modules/.pnpm/@vue+test-utils@2.5.1_@vue+compiler-dom@3.5.43_@vue+server-renderer@3.5.43_vue@3.5.43_typescript@5.9.3_/node_modules/@vue/test-utils/dist/vue-test-utils.cjs.js:7333:15
 ❯ src/dashboard/PaneInfoView.test.ts:67:20
     65|     await wrapper.vm.$nextTick();
     66|     expect(wrapper.get("[data-pane-info-cost]").text()).toBe("0.166 AI…
     67|     expect(wrapper.get("[data-pane-info-premium-requests]").text()).to…
       |                    ^
     68|     store.setSnapshot({ panes: { p1: usage("p1", { kind: "copilot" }) …
     69|     await wrapper.vm.$nextTick();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/web| src/dashboard/dashboardModel.test.ts > 数字の見せ方 > Bob Shell と Copilot CLI の種類を表示名で出す
AssertionError: expected 'bob' to be 'Bob Shell' // Object.is equality

Expected: "Bob Shell"
Received: "bob"

 ❯ src/dashboard/dashboardModel.test.ts:104:30
    102| describe("数字の見せ方", () => {
    103|   it("Bob Shell と Copilot CLI の種類を表示名で出す", () => {
    104|     expect(kindLabel("bob")).toBe("Bob Shell");
       |                              ^
    105|     expect(kindLabel("copilot")).toBe("Copilot CLI");
    106|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed (2)
      Tests  2 failed | 20 passed (22)
   Start at  15:07:31
   Duration  2.57s (transform 67%, import 14%, environment 12%, tests 7%)

  Transform  |@sodashitsu/web| transforming modules took 2.56s · 67% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

## 修正後

11 ファイル（Bob/Copilot adapter、UsageService、UsageFeed、manifest、ProcessMatcher、statusline、TUI UsageView、Web 2 ファイル）を実行。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-antigravity


 Test Files  11 passed (11)
      Tests  136 passed (136)
   Start at  15:08:02
   Duration  2.89s (transform 69%, import 13%, tests 12%, environment 5%, worker 1%)

  Transform  |@sodashitsu/web| transforming modules took 3.16s · 70% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

  Transform  |@sodashitsu/server| transforming modules took 2.38s · 58% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

  Transform  |@sodashitsu/tui| transforming modules took 2.13s · 84% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```
