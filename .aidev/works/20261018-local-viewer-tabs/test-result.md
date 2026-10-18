# 検証記録

## 実行済み

- 全体build: PASS（`/tmp/viewer-tabs-build-final.log`）。最終UI差分もWebを再build。
- 全体unit: 704ファイル、11109件のうち11108 PASS。実行中に追加したcontrol文字ラベルの拒否テスト1件は旧protocolキャッシュで失敗した。protocol再build後、該当backendテストを新しいプロセスで再実行し3件PASS（`/tmp/viewer-tabs-server-final.log`）。
- 先行全体実行で落ちたTUIの狭幅予約領域を修正。mouse/render/viewerの関係テスト112件PASS。負荷下timeoutのGraphViewも単独再実行PASS。
- WebPreviewの実ブラウザ: 実iframeの状態が作業タブ・workspaceの切替後も維持されることを確認しPASS（`/tmp/viewer-tabs-e2e-final.log`）。
- リモートデスクトップE2E: 合成helperによる共有/入力/終了を確認しPASS（`/tmp/viewer-tabs-e2e1.log`）。
- TUIの裏pane入力遮断: 通常入力・貼り付け・マウス・prefix・組み込みエディタを確認、3件PASS。
- TabWorkspaceライフサイクル: plugin UIと旧desktop/vscodeを非表示時に破棄し、端末DOMを保持する3件PASS。
- 起動smoke: 作業外worktreeから最新server distでPASS（`/tmp/viewer-tabs-smoke.log`）。

Windows実機のキャプチャや入力は実行していない。本番サーバ更新・handoff・コミット・PR/mergeは本依頼に含めず未実行。

## 負対照: TUIのdockedViews入力遮断

`TuiApp.handleInput` の `!this.activeViewer()` 条件だけを一時的に外した。実際の組み込みエディタが選択された状態で、キー入力が裏へ到達して失敗。修正ファイルを元のbytesへ戻しSHA一致を確認後、3件PASS。以下は失敗時の生出力。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/app/TuiApp.viewerTabs.test.ts (3 tests | 1 failed | 2 skipped) 134ms
   × does not dispatch viewer keystrokes/paste/mouse to a retained interactive docked editor 133ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/app/TuiApp.viewerTabs.test.ts > does not dispatch viewer keystrokes/paste/mouse to a retained interactive docked editor
AssertionError: expected "key" to not be called at all, but actually been called 24 times

Received:

  1st key call:

    Array [
      Object {
        "alt": false,
        "code": "KeyE",
        "composing": false,
        "ctrl": false,
        "key": "e",
        "meta": false,
        "shift": false,
        "type": "keydown",
      },
    ]

  2nd key call:

    Array [
      Object {
        "alt": false,
        "code": "KeyS",
        "composing": false,
        "ctrl": false,
        "key": "S",
        "meta": false,
        "shift": true,
        "type": "keydown",
      },
    ]

  3rd key call:

    Array [
      Object {
        "alt": false,
        "code": "KeyH",
        "composing": false,
        "ctrl": false,
        "key": "H",
        "meta": false,
        "shift": true,
        "type": "keydown",
      },
    ]

  4th key call:

    Array [
      Object {
        "alt": false,
        "code": "KeyO",
        "composing": false,
        "ctrl": false,
        "key": "O",
        "meta": false,
        "shift": true,
        "type": "keydown",
      },
    ]

  5th key call:

    Array [
      Object {
        "alt": false,
        "code": "KeyU",
        "composing": false,
        "ctrl": false,
        "key": "U",
        "meta": false,
        "shift": true,
        "type": "keydown",
      },
    ]

  6th key call:

    Array [
      Object {
        "alt": false,
        "code": "KeyL",
        "composing": false,
        "ctrl": false,
        "key": "L",
        "meta": false,
        "shift": true,
        "type": "keydown",
      },
    ]

  7th key call:

    Array [
      Object {
        "alt": false,
        "code": "KeyD",
        "composing": false,
        "ctrl": false,
        "key": "D",
        "meta": false,
        "shift": true,
        "type": "keydown",
      },
    ]

  8th key call:

    Array [
      Object {
        "alt": false,
        "code": "_",
        "composing": false,
        "ctrl": false,
        "key": "_",
        "meta": false,
        "shift": false,
        "type": "keydown",
      },
    ]

  9th key call:

    Array [
      Object {
        "alt": false,
        "code": "KeyN",
        "composing": false,
        "ctrl": false,
        "key": "N",
        "meta": false,
        "shift": true,
        "type": "keydown",
      },
    ]

  10th key call:

    Array [
      Object {
        "alt": false,
        "code": "KeyO",
        "composing": false,
        "ctrl": false,
        "key": "O",
        "meta": false,
        "shift": true,
        "type": "keydown",
      },
    ]

  11th key call:

    Array [
      Object {
        "alt": false,
        "code": "KeyT",
        "composing": false,
        "ctrl": false,
        "key": "T",
        "meta": false,
        "shift": true,
        "type": "keydown",
      },
    ]

  12th key call:

    Array [
      Object {
        "alt": false,
        "code": "_",
        "composing": false,
        "ctrl": false,
        "key": "_",
        "meta": false,
        "shift": false,
        "type": "keydown",
      },
    ]

  13th key call:

    Array [
      Object {
        "alt": false,
        "code": "KeyR",
        "composing": false,
        "ctrl": false,
        "key": "R",
        "meta": false,
        "shift": true,
        "type": "keydown",
      },
    ]

  14th key call:

    Array [
      Object {
        "alt": false,
        "code": "KeyE",
        "composing": false,
        "ctrl": false,
        "key": "E",
        "meta": false,
        "shift": true,
        "type": "keydown",
      },
    ]

  15th key call:

    Array [
      Object {
        "alt": false,
        "code": "KeyA",
        "composing": false,
        "ctrl": false,
        "key": "A",
        "meta": false,
        "shift": true,
        "type": "keydown",
      },
    ]

  16th key call:

    Array [
      Object {
        "alt": false,
        "code": "KeyC",
        "composing": false,
        "ctrl": false,
        "key": "C",
        "meta": false,
        "shift": true,
        "type": "keydown",
      },
    ]

  17th key call:

    Array [
      Object {
        "alt": false,
        "code": "KeyH",
        "composing": false,
        "ctrl": false,
        "key": "H",
        "meta": false,
        "shift": true,
        "type": "keydown",
      },
    ]

  18th key call:

    Array [
      Object {
        "alt": false,
        "code": "_",
        "composing": false,
        "ctrl": false,
        "key": "_",
        "meta": false,
        "shift": false,
        "type": "keydown",
      },
    ]

  19th key call:

    Array [
      Object {
        "alt": false,
        "code": "KeyE",
        "composing": false,
        "ctrl": false,
        "key": "E",
        "meta": false,
        "shift": true,
        "type": "keydown",
      },
    ]

  20th key call:

    Array [
      Object {
        "alt": false,
        "code": "KeyD",
        "composing": false,
        "ctrl": false,
        "key": "D",
        "meta": false,
        "shift": true,
        "type": "keydown",
      },
    ]

  21st key call:

    Array [
      Object {
        "alt": false,
        "code": "KeyI",
        "composing": false,
        "ctrl": false,
        "key": "I",
        "meta": false,
        "shift": true,
        "type": "keydown",
      },
    ]

  22nd key call:

    Array [
      Object {
        "alt": false,
        "code": "KeyT",
        "composing": false,
        "ctrl": false,
        "key": "T",
        "meta": false,
        "shift": true,
        "type": "keydown",
      },
    ]

  23rd key call:

    Array [
      Object {
        "alt": false,
        "code": "KeyO",
        "composing": false,
        "ctrl": false,
        "key": "O",
        "meta": false,
        "shift": true,
        "type": "keydown",
      },
    ]

  24th key call:

    Array [
      Object {
        "alt": false,
        "code": "KeyR",
        "composing": false,
        "ctrl": false,
        "key": "R",
        "meta": false,
        "shift": true,
        "type": "keydown",
      },
    ]


Number of calls: 24

 ❯ src/app/TuiApp.viewerTabs.test.ts:79:19
     77|   h.io.type("eSHOULD_NOT_REACH_EDITOR");h.io.type("\x1b[200~PASTE_MUST…
     78|   h.io.type(click(state.lastLayout.paneArea.x+4,state.lastLayout.paneA…
     79|   expect(key).not.toHaveBeenCalled();expect(paste).not.toHaveBeenCalle…
       |                   ^
     80| });
     81|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
   Start at  01:46:09
   Duration  1.94s (transform 78%, import 15%, tests 7%)


```

## 最終差分の確認

- 全体typecheck: PASS（`/tmp/viewer-tabs-typecheck-complete.log`）。
- Web最終build: PASS（`/tmp/viewer-tabs-web-complete.log`）。
- VSCodeリモートE2E: PASS。共有・操作・日本語入力・fit・fullscreen・終了・pluginへ戻る・権限取消を確認（`/tmp/viewer-tabs-e2e-complete.log`）。pluginでは親UI操作後に利用者が面へ入り直す既存のfocus guard仕様を、実ポインタ操作で検証。
- 最終focused unit: backend/TUI/lifecycleの3ファイル9件PASS（`/tmp/viewer-tabs-final-focused.log`）。
- 新しい一覧E2Eの撮影前に既存の一度限りのキー案内が残る問題は、本機能の検証対象ではないため、案内を読み終えた状態のlocalStorageで起動するfixtureとした。タイマー待機やクリックの強制では代用していない。

## 負対照: 非表示共有の破棄

TabWorkspaceの`active !== false`条件だけを一時的に外し、3件すべてが失敗。元のbytesへ復元し一致確認後、関係9件PASS。生出力:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/web| src/components/TabWorkspace.test.ts (3 tests | 3 failed) 51ms
   × releases hidden plugin UI while retaining its terminal DOM 43ms
   × releases a legacy desktop share while a controller viewer is selected 5ms
   × releases a legacy vscode share while a controller viewer is selected 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/components/TabWorkspace.test.ts > releases hidden plugin UI while retaining its terminal DOM
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/components/TabWorkspace.test.ts:26:49
     24|   expect(w.find("[data-test-plugin]").exists()).toBe(true);
     25|   await w.setProps({ active: false });
     26|   expect(w.find("[data-test-plugin]").exists()).toBe(false);
       |                                                 ^
     27|   expect(w.get("[data-test-terminal]").element).toBe(terminal);
     28|   await w.setProps({ active: true });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  |@sodashitsu/web| src/components/TabWorkspace.test.ts > releases a legacy desktop share while a controller viewer is selected
 FAIL  |@sodashitsu/web| src/components/TabWorkspace.test.ts > releases a legacy vscode share while a controller viewer is selected
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/components/TabWorkspace.test.ts:39:49
     37|   expect(w.find("[data-test-native]").exists()).toBe(true);
     38|   await w.setProps({ active: false });
     39|   expect(w.find("[data-test-native]").exists()).toBe(false);
       |                                                 ^
     40|   await w.setProps({ active: true });
     41|   expect(w.find("[data-test-native]").exists()).toBe(true);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯


 Test Files  1 failed (1)
      Tests  3 failed (3)
   Start at  01:58:01
   Duration  6.97s (transform 75%, import 13%, environment 12%, tests 1%)

  Transform  |@sodashitsu/web| transforming modules took 5.02s · 75% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

- 最終viewer一覧E2E: PASS（`/tmp/viewer-tabs-e2e-viewer-complete.log`）。A側だけに保存、B側のtab/pane不変、Aの別ブラウザへ一覧共有、800pxの管理メニューから閉じることを実画面で確認。
- wide/narrowのスクリーンショットも目視確認。作業タブは左、PC名付き枠線の閲覧タブは右、狭幅は右端のメニューにまとまり、メニューの項目が画面内に収まる。
- 最終 `git diff --check`: PASS。

## 追補: 左のタブ種類選択

- NameDialogとActionDispatcher: 258件PASS（`/tmp/viewer-chooser-unit-final.log`）。3種類の候補・submit・標準名/入力名・local desktop制約を検証。
- 負対照: 閲覧optgroupだけを削除し、候補の回帰テストが失敗。元のbytesへ戻し一致確認して再実行PASS。失敗時生出力:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/web| src/components/NameDialog.test.ts (17 tests | 4 failed) 138ms
   × タブの種類からweb-previewを閲覧タブとして追加する 19ms
   × タブの種類からdesktopを閲覧タブとして追加する 6ms
   × タブの種類からvscodeを閲覧タブとして追加する 5ms
   × 閲覧タブの名前の指定と外部マシン用desktopの制約を保つ 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/components/NameDialog.test.ts > タブの種類からweb-previewを閲覧タブとして追加する
Error: Unable to get option[value="viewer:web-preview"] within: <dialog data-v-d063c2a5="" class="name-dialog" open="">
  <form data-v-d063c2a5="" method="dialog"><label data-v-d063c2a5="" class="name-dialog-label"><span data-v-d063c2a5="">新しい tab の名前</span><input data-v-d063c2a5="" type="text" class="name-dialog-input"></label><label data-v-d063c2a5="" class="name-dialog-label"><span data-v-d063c2a5="">タブの種類</span><select data-v-d063c2a5="" aria-label="タブの種類">
        <optgroup data-v-d063c2a5="" label="作業タブ">
          <option data-v-d063c2a5="" value="">ターミナル</option>
          <option data-v-d063c2a5="" disabled="" value="builtin:workspace">開発（標準）</option>
        </optgroup>
      </select></label>
    <p data-v-d063c2a5="" class="name-dialog-hint name-dialog-project">プラグインを使うには、spaces のメニューでPJフォルダを設定してください。</p>
    <!--v-if-->
    <!-- workspace の名前を変えるときだけ（tab・pane の見た目は変えない。20260921-workspace-auto-label の design D8）。 -->
    <!--v-if-->
    <div data-v-d063c2a5="" class="name-dialog-actions"><button data-v-d063c2a5="" type="button">キャンセル</button><button data-v-d063c2a5="" type="submit">OK</button></div>
  </form>
</dialog>
 ❯ VueWrapper.get ../../node_modules/.pnpm/@vue+test-utils@2.5.1_@vue+compiler-dom@3.5.43_@vue+server-renderer@3.5.43_vue@3.5.43_typescript@5.9.3_/node_modules/@vue/test-utils/dist/vue-test-utils.cjs.js:7333:15
 ❯ src/components/NameDialog.test.ts:242:18
    240|   view.openDialogWithContext({ kind: "newTab", workspaceId: "w1" });
    241|   await wrapper.vm.$nextTick(); await wrapper.vm.$nextTick();
    242|   expect(wrapper.get(`option[value="viewer:${kind}"]`).text()).toBe(la…
       |                  ^
    243|   await wrapper.get("select").setValue(`viewer:${kind}`);
    244|   expect(wrapper.text()).toContain("操作元に保存");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯

 FAIL  |@sodashitsu/web| src/components/NameDialog.test.ts > タブの種類からdesktopを閲覧タブとして追加する
Error: Unable to get option[value="viewer:desktop"] within: <dialog data-v-d063c2a5="" class="name-dialog" open="">
  <form data-v-d063c2a5="" method="dialog"><label data-v-d063c2a5="" class="name-dialog-label"><span data-v-d063c2a5="">新しい tab の名前</span><input data-v-d063c2a5="" type="text" class="name-dialog-input"></label><label data-v-d063c2a5="" class="name-dialog-label"><span data-v-d063c2a5="">タブの種類</span><select data-v-d063c2a5="" aria-label="タブの種類">
        <optgroup data-v-d063c2a5="" label="作業タブ">
          <option data-v-d063c2a5="" value="">ターミナル</option>
          <option data-v-d063c2a5="" disabled="" value="builtin:workspace">開発（標準）</option>
        </optgroup>
      </select></label>
    <p data-v-d063c2a5="" class="name-dialog-hint name-dialog-project">プラグインを使うには、spaces のメニューでPJフォルダを設定してください。</p>
    <!--v-if-->
    <!-- workspace の名前を変えるときだけ（tab・pane の見た目は変えない。20260921-workspace-auto-label の design D8）。 -->
    <!--v-if-->
    <div data-v-d063c2a5="" class="name-dialog-actions"><button data-v-d063c2a5="" type="button">キャンセル</button><button data-v-d063c2a5="" type="submit">OK</button></div>
  </form>
</dialog>
 ❯ VueWrapper.get ../../node_modules/.pnpm/@vue+test-utils@2.5.1_@vue+compiler-dom@3.5.43_@vue+server-renderer@3.5.43_vue@3.5.43_typescript@5.9.3_/node_modules/@vue/test-utils/dist/vue-test-utils.cjs.js:7333:15
 ❯ src/components/NameDialog.test.ts:242:18
    240|   view.openDialogWithContext({ kind: "newTab", workspaceId: "w1" });
    241|   await wrapper.vm.$nextTick(); await wrapper.vm.$nextTick();
    242|   expect(wrapper.get(`option[value="viewer:${kind}"]`).text()).toBe(la…
       |                  ^
    243|   await wrapper.get("select").setValue(`viewer:${kind}`);
    244|   expect(wrapper.text()).toContain("操作元に保存");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯

 FAIL  |@sodashitsu/web| src/components/NameDialog.test.ts > タブの種類からvscodeを閲覧タブとして追加する
Error: Unable to get option[value="viewer:vscode"] within: <dialog data-v-d063c2a5="" class="name-dialog" open="">
  <form data-v-d063c2a5="" method="dialog"><label data-v-d063c2a5="" class="name-dialog-label"><span data-v-d063c2a5="">新しい tab の名前</span><input data-v-d063c2a5="" type="text" class="name-dialog-input"></label><label data-v-d063c2a5="" class="name-dialog-label"><span data-v-d063c2a5="">タブの種類</span><select data-v-d063c2a5="" aria-label="タブの種類">
        <optgroup data-v-d063c2a5="" label="作業タブ">
          <option data-v-d063c2a5="" value="">ターミナル</option>
          <option data-v-d063c2a5="" disabled="" value="builtin:workspace">開発（標準）</option>
        </optgroup>
      </select></label>
    <p data-v-d063c2a5="" class="name-dialog-hint name-dialog-project">プラグインを使うには、spaces のメニューでPJフォルダを設定してください。</p>
    <!--v-if-->
    <!-- workspace の名前を変えるときだけ（tab・pane の見た目は変えない。20260921-workspace-auto-label の design D8）。 -->
    <!--v-if-->
    <div data-v-d063c2a5="" class="name-dialog-actions"><button data-v-d063c2a5="" type="button">キャンセル</button><button data-v-d063c2a5="" type="submit">OK</button></div>
  </form>
</dialog>
 ❯ VueWrapper.get ../../node_modules/.pnpm/@vue+test-utils@2.5.1_@vue+compiler-dom@3.5.43_@vue+server-renderer@3.5.43_vue@3.5.43_typescript@5.9.3_/node_modules/@vue/test-utils/dist/vue-test-utils.cjs.js:7333:15
 ❯ src/components/NameDialog.test.ts:242:18
    240|   view.openDialogWithContext({ kind: "newTab", workspaceId: "w1" });
    241|   await wrapper.vm.$nextTick(); await wrapper.vm.$nextTick();
    242|   expect(wrapper.get(`option[value="viewer:${kind}"]`).text()).toBe(la…
       |                  ^
    243|   await wrapper.get("select").setValue(`viewer:${kind}`);
    244|   expect(wrapper.text()).toContain("操作元に保存");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯

 FAIL  |@sodashitsu/web| src/components/NameDialog.test.ts > 閲覧タブの名前の指定と外部マシン用desktopの制約を保つ
Error: Unable to get option[value="viewer:desktop"] within: <dialog data-v-d063c2a5="" class="name-dialog" open="">
  <form data-v-d063c2a5="" method="dialog"><label data-v-d063c2a5="" class="name-dialog-label"><span data-v-d063c2a5="">新しい tab の名前</span><input data-v-d063c2a5="" type="text" class="name-dialog-input"></label><label data-v-d063c2a5="" class="name-dialog-label"><span data-v-d063c2a5="">タブの種類</span><select data-v-d063c2a5="" aria-label="タブの種類">
        <optgroup data-v-d063c2a5="" label="作業タブ">
          <option data-v-d063c2a5="" value="">ターミナル</option>
          <option data-v-d063c2a5="" disabled="" value="builtin:workspace">開発（標準）</option>
        </optgroup>
      </select></label>
    <p data-v-d063c2a5="" class="name-dialog-hint name-dialog-project">プラグインを使うには、spaces のメニューでPJフォルダを設定してください。</p>
    <!--v-if-->
    <!-- workspace の名前を変えるときだけ（tab・pane の見た目は変えない。20260921-workspace-auto-label の design D8）。 -->
    <!--v-if-->
    <div data-v-d063c2a5="" class="name-dialog-actions"><button data-v-d063c2a5="" type="button">キャンセル</button><button data-v-d063c2a5="" type="submit">OK</button></div>
  </form>
</dialog>
 ❯ VueWrapper.get ../../node_modules/.pnpm/@vue+test-utils@2.5.1_@vue+compiler-dom@3.5.43_@vue+server-renderer@3.5.43_vue@3.5.43_typescript@5.9.3_/node_modules/@vue/test-utils/dist/vue-test-utils.cjs.js:7333:15
 ❯ src/components/NameDialog.test.ts:254:18
    252|   view.openDialogWithContext({ kind: "newTab", workspaceId: "w1" });
    253|   await wrapper.vm.$nextTick(); await wrapper.vm.$nextTick();
    254|   expect(wrapper.get('option[value="viewer:desktop"]').attributes("dis…
       |                  ^
    255|   await wrapper.get("select").setValue("viewer:vscode");
    256|   await wrapper.get("input").setValue("editor");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯


 Test Files  1 failed (1)
      Tests  4 failed | 13 passed (17)
   Start at  09:41:35
   Duration  1.87s (transform 65%, import 16%, environment 11%, tests 8%)


```

- 追補Web build（型検査込み）: PASS（`/tmp/viewer-chooser-build.log`）。
- E2E typecheck: PASS（`/tmp/viewer-chooser-e2e-typecheck.log`）。
- 左＋→タブの種類→VSCode閲覧→右側viewer作成→別ブラウザへの共有→狭幅で閉じる: 実ブラウザE2E PASS（`/tmp/viewer-chooser-e2e.log`）。接続先のtab/paneが増えていないことも確認。初回fixtureの承認通知は利用者と同じ×操作で閉じた。

## 最終方針: TUI閲覧UI撤去と+ビュー統一

55/120桁のappHarnessでWebに保存済みの3種類のviewer設定を読み込み、ボタンもタブ名も表示しないことを検証。globalメニューにも閲覧操作なし。120桁では+ビューボタンを確認。NameDialogも閲覧候補なしへ変更。関係2ファイル17件PASS。

変更前の実装で新回帰テストを実行し、狭幅/通常幅の2件が失敗した生出力（既存実装で負対照、以後実装からviewer UIを撤去）:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/app/TuiApp.viewerTabs.test.ts (3 tests | 2 failed) 308ms
   × does not expose browser viewer tabs or their menu at 55 columns 132ms
   × does not expose browser viewer tabs or their menu at 120 columns 115ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/app/TuiApp.viewerTabs.test.ts > does not expose browser viewer tabs or their menu at 55 columns
AssertionError: expected '   w1  t1  session: work             …' not to contain '閲覧'

- Expected
+ Received

- 閲覧
+    w1  t1  session: work               [閲覧▾]  switch
+ ┌─ pane p1 ─────────────────────────[⋮][+][│][─][□][×]┐
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ │                                                     │
+ └─────────────────────────────────────────────────────⋯

 ❯ src/app/TuiApp.viewerTabs.test.ts:14:22
     12|   await vi.waitFor(() => expect(h.app.prefs.shared.viewerTabs).toHaveL…
     13|   const screen = await h.screen();
     14|   expect(screen).not.toContain("閲覧");
       |                      ^
     15|   for (const viewer of viewerTabs) expect(screen).not.toContain(viewer…
     16|   expect(h.ws.requests("viewer_tabs.create")).toHaveLength(0);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/tui| src/app/TuiApp.viewerTabs.test.ts > does not expose browser viewer tabs or their menu at 120 columns
AssertionError: expected ' 端末 グラフ 状況 他 ▾   │ t1   +            …' not to contain '閲覧'

- Expected
+ Received

- 閲覧
+  端末 グラフ 状況 他 ▾   │ t1   +                    [ビュー＋] │ [WebOnly-web-preview]  [WebOnly… [閲覧▾]session: work
+  ▾ Spaces     開いた順   │┌─ pane p1 ─────────────────[⋮][+][│][─][□][×]┐┌─ pane p2 ─────────────────[⋮][+][│][─][□][×]┐
+      w1                  ││                                             ││                                             │
+      w2                  ││                                             ││                                             │
+                          ││                                             ││                                             │
+                          ││                                             ││                                             │
+                          ││                                             ││                                             │
+                          ││                                             ││                                             │
+                          ││                                             ││                                             │
+                          ││                                             ││                                             │
+                          ││                                             ││                                             │
+                          ││                                             ││                                             │
+                          ││                                             ││                                             │
+                          ││                                             ││                                             │
+                          ││                                             ││                                             │
+                          ││                                             ││                                             │
+                          ││                                             ││                                             │
+                          ││                                             ││                                             │
+                          ││                                             ││                                             │
+                          ││                                             ││                                             │
+                          ││                                             ││                                             │
+                          ││                                             ││                                             │
+                          ││                                             ││                                             │
+                          ││                                             ││                                             │
+                          ││                                             ││                                             │
+                          ││                                             ││                                             │
+                          ││                                             ││                                             │
+                          ││                                             ││                                             │
+  ＋新規 ⋯           🔔0  ││                                             ││                                             │
+                        « │└─────────────────────────────────────────────⋯└─────────────────────────────────────────────⋯

 ❯ src/app/TuiApp.viewerTabs.test.ts:14:22
     12|   await vi.waitFor(() => expect(h.app.prefs.shared.viewerTabs).toHaveL…
     13|   const screen = await h.screen();
     14|   expect(screen).not.toContain("閲覧");
       |                      ^
     15|   for (const viewer of viewerTabs) expect(screen).not.toContain(viewer…
     16|   expect(h.ws.requests("viewer_tabs.create")).toHaveLength(0);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 1 passed (3)
   Start at  10:10:37
   Duration  2.39s (transform 70%, import 16%, tests 14%)


```

- 最終方針の全体build/typecheck: PASS（`/tmp/viewer-ui-tidy-build.log`、`/tmp/viewer-ui-tidy-typecheck.log`）。
- Web閲覧E2E: PASS（`/tmp/viewer-ui-tidy-e2e.log`）。左のタブ種類に閲覧候補なし、右＋で追加、+ビューのラベルを実画面で確認。
- workspace-tools E2E: 2件PASS（`/tmp/viewer-ui-tidy-e2e-tools.log`）。+ビューからfile追加まで成功。最初の実行では以前のStatuslineビュー候補を要求する古いassertionで失敗したため、標準ペイン機能へ移動済みの現行仕様に合わせてそのassertionを更新した。

- 最終方針の全体unit: 705ファイル、11112件すべてPASS（`/tmp/viewer-ui-tidy-tests.log`）。
- 最終 `git diff --check`: PASS。

## 呼び出しボタンの右端配置と右からの接続タブ

- 関係unit: 6ファイル85件PASS（`/tmp/view-actions-layout-unit-final.log`）。接続の左右移動、保存順の非破壊、Web/TUIの既存操作を確認。
- Web build/型検査: PASS（`/tmp/view-actions-layout-build.log`）。TUI build/型検査も最終境界修正後PASS（`/tmp/view-actions-layout-tui-build-final.log`、`/tmp/view-actions-layout-tui-typecheck-final.log`）。E2E typecheck PASS。
- Webの実ブラウザE2E: 接続2件の追加順、classic/modernの右端配置・ボタン高さ・ボタン間隔・通常の新規タブ＋と等しい左右padding、800pxのメニュー・閉じるを確認してPASS（`/tmp/view-actions-layout-e2e-viewer.log`）。2種類のスクリーンショットも目視確認。
- ファイル/Gitと＋作業ビューの追加導線E2E: 2件PASS（`/tmp/view-actions-layout-e2e.log`）。
- theme設定のE2Eは、接続先を選んだままprefsを書き換えると操作者のlocal設定が適用されない既存仕様に合わせ、ローカル選択→設定→対象machineへ戻る実操作で実行。
- TUIの全角＋が警告列を上書きする境界: 修正前に新しいテストで失敗、修正後に関係85件PASS。生出力:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/render/chrome/tabBar.feedback.test.ts (2 tests | 1 failed) 11ms
   × keeps the full-width new-tab button out of the reserved alert column 5ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/render/chrome/tabBar.feedback.test.ts > keeps the full-width new-tab button out of the reserved alert column
AssertionError: expected { x: 5, w: 4 } to be null

- Expected:
null

+ Received:
{
  "w": 4,
  "x": 5,
}

 ❯ src/render/chrome/tabBar.feedback.test.ts:30:29
     28|   };
     29|   const tight = paint(10);
     30|   expect(tight.hits.newTab).toBeNull();
       |                             ^
     31|   expect(tight.grid.ch[8]).toBe("!");
     32|   const fits = paint(11);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
   Start at  10:44:00
   Duration  1.48s (transform 81%, import 18%, tests 1%)


```
