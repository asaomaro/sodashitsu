# 検証

- Webビルド（vue-tsc含む）成功。
- PaneFrame: 59テスト成功。通常の端末の減光テストも成功。
- パースペクティブE2E: 2件成功。実アプリのiframe内をクリック/文字入力し、DOMのactiveElementとアプリからdocumentまで全先祖要素のcomputed opacityが1であることを確認。
- 実行中サーバのHTTPは各リクエストでdistファイルを読むため、ブラウザ再読み込みで反映される。サーバやペインの再起動は行わない。

## 負の対照

初回の単体回帰テストでは、表示部品の初期化前にfocusedを設定し、初期化で消されるため誤って成功した。upsert後settleで初期化を待つ順序に修正。非減光の1行だけ除去してdimmedクラスが残ることによる失敗を確認。finallyでbyte一致復元、59件を再実行し成功。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=73ba49c7d53f082175174d52d069b7e1": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
 ❯ |@sodashitsu/web| src/components/PaneFrame.test.ts (59 tests | 1 failed | 58 skipped) 65ms
   ❯ PaneFrame — 表示の面（パネル・帯。20261007-soda-extensions・20261008-display-layout） (12)
     × アプリの外枠は表示にフォーカスがあっても減光しない 64ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/components/PaneFrame.test.ts > PaneFrame — 表示の面（パネル・帯。20261007-soda-extensions・20261008-display-layout） > アプリの外枠は表示にフォーカスがあっても減光しない
AssertionError: expected [ 'pane-frame-main', …(1) ] to not include 'pane-frame-main-dimmed'
 ❯ src/components/PaneFrame.test.ts:994:59
    992|     d.setFocused("app");
    993|     await settle(wrapper);
    994|     expect(wrapper.get(".pane-frame-main").classes()).not.toContain("p…
       |                                                           ^
    995|   });
    996|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 58 skipped (59)
   Start at  13:59:29
   Duration  1.89s (transform 75%, import 11%, environment 10%, tests 4%)


```
