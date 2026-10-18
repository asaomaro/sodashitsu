# デスクトップ初回設定の診断

実環境sr-pcの認証済みRPC `desktop.capabilities` を読み取り、available:false / allowInput:false / features:true / displayResize:falseを確認。通常のmachine接続は成立しているが、BのDesktopProvider設定が存在しないか不正、または起動時に未反映。実画面のキャプチャ、入力、共有設定、サーバーの停止・再起動は行っていない。

available:falseに限って、接続先PCのSODA_DESKTOP_COMMAND初回設定を案内する固定エラーを返す。他の例外をそのままブラウザへ流さず、従来の一般的なエラーに留める。Windows直接起動用の閲覧設定例と、元のサーバー環境を引き継ぐhandoffだけでは端末側の環境変数追加が伝わらない点をdocsへ追加。

関連テスト: DesktopRelay / DesktopProvider、2ファイル10件成功（/tmp/desktop-setup-error-tests.log）。server build / typecheck成功。負の対照後にソースをバイト単位・SHA256一致で復元し、新規回帰テストも再成功（/tmp/desktop-setup-error-restored.log）。git diff --check成功。

独立レビュー: review_remote_tabsによる別コンテキスト点検で必須指摘なし。未設定時にはhelper起動・画面配信が始まらず接続が閉じることを確認。

## 負の対照の生出力

設定案内の分岐だけを無効にすると、従来の一般エラーが返って回帰テストが失敗。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (7 tests | 1 failed | 6 skipped) 1028ms
   × explains missing provider setup before trying to start a helper 1027ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > explains missing provider setup before trying to start a helper
AssertionError: expected '共有を開始できません。Bの補助プログラム設定・共有先の許可・接続状態を確認…' to contain 'SODA_DESKTOP_COMMAND'

Expected: "SODA_DESKTOP_COMMAND"
Received: "共有を開始できません。Bの補助プログラム設定・共有先の許可・接続状態を確認してください。"

 ❯ src/desktop/DesktopRelay.test.ts:145:83
    143|   const f = await fixture(true, false, false), viewer = await f.viewer…
    144|   viewer.send(start);
    145|   await expect.poll(() => viewer.messages.find(m => m.type === "error"…
       |                                                                                   ^
    146|   expect(viewer.messages.find(m => m.type === "error")?.message).toCon…
    147|   expect(viewer.frames).toHaveLength(0);

Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.ts:145:3

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  00:24:27
   Duration  1.59s (tests 68%, transform 24%, import 8%)

```


## 追加対応：起動オプションと設定画面での許可

ユーザーの追加要望により、環境変数のみの初回設定案から、`soda serve --desktop`とWeb/TUIの専用設定へ拡張。設定保存、起動時の復元、不正ファイル時の無効化、直列化、既存共有/開始待ちの取消、ローカル接続だけの変更、同梱helper探索と配布に対応。

- 最終関連テスト: 11ファイル268件成功（`/tmp/desktop-permission-targets-final.log`）。Web設定、設定サイドメニュー、App、TUI設定、RPC認可、provider、relay、CLI、configを含む。
- 全体Vitest初回実行は新設節の既存期待値不一致、接続前mountでの不要RPC、実行途中のソース変更による新exportのキャッシュ不一致を検出。設定取得を画面が開き接続済みのときに限定、ナビの10節を更新。その後、失敗箇所を含む上記の関連テストが全成功。全体実行を再成功と称していない。
- E2E: remote-desktop.spec.tsの既存描画が成功。新設desktop-sharing-settings.spec.tsで実ブラウザの設定保存とreload後の復元を確認。画面共有を有効にせず、入力許可の保存だけを検証（`/tmp/desktop-permission-e2e-final.log`）。最終build後の再検証も実施。
- 外部worktreeをcwdとする起動確認: `/tmp/desktop-permission-smoke.log`の`smoke: PASS`。buildとtypecheckの最終ログは`/tmp/desktop-permission-build-final.log`と`/tmp/desktop-permission-typecheck-complete.log`。
- 独立レビュー: review_remote_tabs。bundledモードのSSH共有先origin欠落を指摘し修正。環境変数は初期値、保存したローカル権限が優先する仕様へ文書統一。追加のWeb再接続修正ではsave応答の世代チェックも追加。いずれも修正差分の再レビュー済み、必須指摘なし。
- 実機のキャプチャ/入力、稼働中サーバーの設定変更・再起動・handoff、PR/mergeは実施していない。

### save応答の世代チェックの負の対照（生出力）

本体を変更せず、一時的な同一componentのコピーからsaveの世代チェックだけを外す。同じ遅延応答回帰テストが失敗することを確認。終了時に一時component/testを削除し、本体のバイト一致を確認。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/web| src/components/DesktopSettingsNegative.test.ts (4 tests | 1 failed | 3 skipped) 25ms
   × ignores a stale save response after closing and reopening settings 24ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/components/DesktopSettingsNegative.test.ts > ignores a stale save response after closing and reopening settings
AssertionError: expected undefined to be defined
 ❯ src/components/DesktopSettingsNegative.test.ts:80:58
     78|   finish({ permissions: { ...permissions, enabled: true }, supported: …
     79|   await flushPromises();
     80|   expect(wrapper.get("fieldset").attributes("disabled")).toBeDefined();
       |                                                          ^
     81|   expect((wrapper.findAll("input")[0]!.element as HTMLInputElement).ch…
     82|   expect(wrapper.text()).not.toContain("保存しました"); wrapper.unmount();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  00:42:04
   Duration  659ms (environment 60%, transform 21%, import 13%, tests 5%, worker 2%)


```
