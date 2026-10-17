# 初期実装文書のファクトチェック

2026-10-17。深さ: ざっと（高リスク10件）。対象: design.mdとdocs/remote-web-preview.md。実コードと既存検証ログを読み取り専用で点検し、本文・コード・設定は変更していない。実行/起動/再テストはしていない。

## 修正箇所と再確認

1. 初稿の実2サーバーE2EにおけるWS binary確認: 食い違う。実specはtext送信だった。書き手に報告後、design/test-resultはWS text、binaryはサーバー単体のみ・遠隔ブラウザ未確認へ訂正済み。
2. 初稿のX-Forwarded再生成: 言いすぎ。コードはHTTPだけで生成しWSでは削除のみ。designのHTTP限定とWSの説明を再確認済み。

現在の10主張について未修正の不一致はない。検証ログはその実行結果の証拠であり、現在の全機能や全環境の成功保証ではない。

### C1 HTTP32KiB/WS256KiBをbase64 RPCで運び、HTTP応答はpull、uploadは並行する
- 場所: design:17
- 種類: 実装・安全境界・検証範囲
- 判定: 確認できた
- 根拠: 「Upload and response proceed independently, including early HTTP responses.」。protocol/preview.tsのPREVIEW_CHUNK_BYTES=32*1024、PREVIEW_WS_BYTES=256*1024と、transportのtoString(base64)/readループも確認。既存bridge frameの改変ではなく既存JSON RPCを利用する構造と整合。
- 出典: file:///workspaces/sodashitsu-remote-web-preview/packages/cli/src/preview/RpcPreviewTransport.ts （http公開出典ではなくローカル一次資料）
- 直し方: —（C8/C9は監査中の指摘後の修正文を再確認）

### C2 登録先は明示portの127.0.0.1、管理portは各HTTP/WS接続時に再検査する
- 場所: design:21,35 / docs末尾
- 種類: 実装・安全境界・検証範囲
- 判定: 確認できた
- 根拠: 「await this.checkPort(app.port);」。beginとwsBeginの双方に同処理があり、request/WebSocketの接続先は127.0.0.1固定。PreviewServiceのcheckPortは既知管理portを拒否。把握できない他環境listenerは本文が保証対象から除いている。
- 出典: file:///workspaces/sodashitsu-remote-web-preview/packages/server/src/preview/PreviewStreams.ts （http公開出典ではなくローカル一次資料）
- 直し方: —（C8/C9は監査中の指摘後の修正文を再確認）

### C3 viewer90秒、helper30秒のlease、poll/workで延長
- 場所: design:23
- 種類: 実装・安全境界・検証範囲
- 判定: 確認できた
- 根拠: 「helper.expires = Date.now() + 30_000;」。watch/pollは90_000、helper/workは30_000。sweep/authorizeとclientGone/unwatchの失効処理も確認。
- 出典: file:///workspaces/sodashitsu-remote-web-preview/packages/server/src/preview/PreviewService.ts （http公開出典ではなくローカル一次資料）
- 直し方: —（C8/C9は監査中の指摘後の修正文を再確認）

### C4 view_openedはUI作成ACKで、アプリの正常性を保証しない
- 場所: design:27 / docs:27
- 種類: 実装・安全境界・検証範囲
- 判定: 確認できた
- 根拠: 「open.resolve({ requestId, status: "view_opened" }); return {};」。nextTick後にpreview.ackを送るがiframe内のDOMやHTTP200を検査しない。PreviewService.ackがview_openedをresolveする。
- 出典: file:///workspaces/sodashitsu-remote-web-preview/packages/server/src/preview/PreviewService.ts （http公開出典ではなくローカル一次資料）
- 直し方: —（C8/C9は監査中の指摘後の修正文を再確認）

### C5 gatewayは127.0.0.1動的port、view別p UUID localhost、1回ticketと専用Secure/HttpOnly cookie
- 場所: design:31
- 種類: 実装・安全境界・検証範囲
- 判定: 確認できた
- 根拠: 「gateway.server.listen(0, "127.0.0.1",」。listen引数、randomUUID host、fragment/bootstrap authorize、ticketUsed、__Host-soda-previewのPath=/;HttpOnly;Secure;SameSite=None、およびcookie重複拒否を確認。対応全browserで使える主張ではない。
- 出典: file:///workspaces/sodashitsu-remote-web-preview/packages/cli/src/preview/LoopbackGateway.ts （http公開出典ではなくローカル一次資料）
- 直し方: —（C8/C9は監査中の指摘後の修正文を再確認）

### C6 gateway cookie/予約Set-CookieをBへ渡さずDomain属性を除去する
- 場所: design:33
- 種類: 実装・安全境界・検証範囲
- 判定: 確認できた
- 根拠: 「Application cookies cannot widen their host boundary through an HTTP response.」。cleanHeadersのrequest cookie予約prefix除去、response Set-Cookie予約prefix除去、Domain置換を確認。HTTP応答に限定した主張であり、JS Domain注入のbrowser挙動はPoCログで別に確認されている。
- 出典: file:///workspaces/sodashitsu-remote-web-preview/packages/cli/src/preview/LoopbackGateway.ts （http公開出典ではなくローカル一次資料）
- 直し方: —（C8/C9は監査中の指摘後の修正文を再確認）

### C7 登録はメモリ内で、stopは転送失効のみ、開発サーバーを止めない
- 場所: design:21 / docs:25
- 種類: 実装・安全境界・検証範囲
- 判定: 確認できた
- 根拠: 「if (remove) this.apps.delete(id); else { app.state = "stopped"; app.generation = randomUUID(); }」。appsはMap、stopはinvalidate→state/generation更新だけで子プロセス操作をしない。dropはcancelRequestへ接続し、再起動復元処理はない。
- 出典: file:///workspaces/sodashitsu-remote-web-preview/packages/server/src/preview/PreviewService.ts （http公開出典ではなくローカル一次資料）
- 直し方: —（C8/C9は監査中の指摘後の修正文を再確認）

### C8 X-Forwarded-Host/ProtoをHTTPだけで再生成、WSでは除去のみ
- 場所: design:35（修正後）
- 種類: 実装・安全境界・検証範囲
- 判定: 確認できた
- 根拠: 「h["x-forwarded-host"] = u.host; h["x-forwarded-proto"] = u.protocol.slice(0, -1);」。HTTP beginにだけ再生成があり、WS wsBeginはsanitizedで既存Forwarded系を削除して再生成しない。初稿のHTTP/WSを区別しない記述は言いすぎであり、指摘後に限定修正を確認。
- 出典: file:///workspaces/sodashitsu-remote-web-preview/packages/server/src/preview/PreviewStreams.ts （http公開出典ではなくローカル一次資料）
- 直し方: —（C8/C9は監査中の指摘後の修正文を再確認）

### C9 実2サーバーE2EのWS確認はtextと第2subprotocolで、binaryはserver単体のみ
- 場所: design:45,47（修正後） / docs:31
- 種類: 実装・安全境界・検証範囲
- 判定: 確認できた
- 根拠: 「wss.on("connection", (socket) => socket.send("hmr-ok"));」。ブラウザ#wsはselected:hmr-okを確認。/tmp/preview-final-e2e.logは同specの1 passed (13.3s)。PreviewStreams.test.tsはbinary:trueと[0,255,1]往復を確認。初稿の遠隔ブラウザbinary確認は食い違うため指摘し、text/単体限定への修正を確認。
- 出典: file:///workspaces/sodashitsu-remote-web-preview/packages/e2e/src/specs/remote-web-preview.spec.ts （http公開出典ではなくローカル一次資料）
- 直し方: —（C8/C9は監査中の指摘後の修正文を再確認）

### C10 ブラウザ検証はLinux Chromium153、HTTPS公開風親は模擬で実公開接続ではない
- 場所: design:47 / docs:31
- 種類: 実装・安全境界・検証範囲
- 判定: 確認できた
- 根拠: 「Playwright-intercepted HTTPS public-shaped origin (not a real public network connection)」。JSONのbrowser=153.0.8010.12/platform=linux、parent模擬の明記とfixture注記を確認。実2サーバー経路の合格は別途preview-final-e2e.logとspecで確認。他OS/browser、実公開HTTPS、実Vite/Next HMR、SSH実機へ一般化していない。
- 出典: file:///tmp/sodashitsu-preview-entry-public-poc.json （http公開出典ではなくローカル一次資料）
- 直し方: —（C8/C9は監査中の指摘後の修正文を再確認）

## 判定数と機械検証

修正後: 確認できた10、食い違う0、言いすぎ0、確かめられない0、対象外0。修正前は食い違う1・言いすぎ1を検出し、双方の訂正を確認した。

fact-check付属claims.pyの抽出・引用照合・lintを利用。出典がfile URLのため、verifyをimportしてURL抽出正規表現だけfile対応へ実行時に拡張している。スキル本体は変更しない。引用は原文にあるかの確認であり、実装の安全性レビューやテストの再実行の代用ではない。

実行結果: verify 10/10一致、NG0・未照合0。lint欠落0。


## 再起動後の実Vite追加文の再確認（2026-10-17）

深さ: ざっと。指定されたdesignの追加検証、利用者文書のVite確認文、test-resultの実Vite節だけを別エージェントが照合。書き手の判定を根拠にせず、PoCソース、永続JSON、実依存のversion、公式2節を開き直した。claims.py extractの候補を読み、重複をまとめて7主張を検査。本文・製品コードは変更していない。記録上の実行結果の照合であり、本チェックでは再実行していない。Next・plugin個別互換性・他OS/browser・実公開HTTPS・別PC間への一般化は本文にもなく、JSONのlimitationsとも整合する。

### C11 Vite 8.3.0 / Linux Chromium153で実測した
- 場所: design:60、docs:32、test-result:420以降
- 種類: 数字・検証環境
- 判定: 確認できた
- 根拠: 「"browser": "153.0.8010.12"」「"vite": "8.3.0"」「"platform": "linux"」。永続JSONと今回の/tmp出力JSONは完全一致。依存package.jsonも8.3.0。
- 出典: file:///workspaces/sodashitsu-remote-web-preview/.aidev/works/20261017-remote-web-preview/vite-poc-report.json （http公開出典ではなくローカル一次資料）
- 直し方: —

### C12 追加base/HMR URL/allowedHosts/proxy設定なしの最小JS/CSSアプリを既存委譲とhelperで配信した
- 場所: design:60、docs:32、test-result:422
- 種類: 検証経路・条件
- 判定: 確認できた
- 根拠: 「createViteServer({ root: app, configFile: false, server: { host: "127.0.0.1", port: 0 }, logLevel: "error" })」。base/HMR/allowedHosts/proxy指定なし。machine.invite→Bのmachine.delegate→AでB選択→実CLI helper→B pane.sock register/open→実iframeの順をソースで確認。
- 出典: file:///workspaces/sodashitsu-remote-web-preview/scripts/remote-web-preview-vite-poc.mjs （http公開出典ではなくローカル一次資料）
- 直し方: —

### C13 JS/CSS更新でDOMとcomputed CSSが変化しdocumentは維持された
- 場所: design:60、docs:32、test-result:422
- 種類: 検証結果
- 判定: 確認できた
- 根拠: 「toHaveText("vite-module-updated", { timeout: 15_000 })」「toHaveCSS("color", "rgb(4, 5, 6)", { timeout: 15_000 })」「toHaveAttribute("data-document-stamp", stamp)」。各編集後に実iframe内を観測。永続JSONのmoduleHmr/cssHmr/documentPreservedがtrueで、観測処理と整合。
- 出典: file:///workspaces/sodashitsu-remote-web-preview/scripts/remote-web-preview-vite-poc.mjs （http公開出典ではなくローカル一次資料）
- 直し方: —

### C14 localhost側のconnected/js-update/css-updateを必要とし127.0.0.1直結だけでは成功しない
- 場所: design:60,62、test-result:422
- 種類: 検証の偽陽性防止
- 判定: 確認できた
- 根拠: 「if (!ws.url().includes("localhost")) return;」。この対象のブラウザ受信フレームについてconnected/js-update/css-updateをassertする。Vite client実コードにdirectSocketHost fallbackがあり、PoCのhost=127.0.0.1とは観測hostが異なる。永続JSONにも3種を確認。
- 出典: file:///workspaces/sodashitsu-remote-web-preview/scripts/remote-web-preview-vite-poc.mjs （http公開出典ではなくローカル一次資料）
- 直し方: —

### C15 stop後iframeが0となりpageErrorsは空だった
- 場所: test-result:422
- 種類: 検証結果
- 判定: 確認できた
- 根拠: 「toHaveCount(0)」「"pageErrors": []」。前者はPoCの停止後DOM判定、後者は永続JSON。pageErrorsの空は報告値であり、一般のエラーなし保証へ広げていない。
- 出典: file:///workspaces/sodashitsu-remote-web-preview/scripts/remote-web-preview-vite-poc.mjs （http公開出典ではなくローカル一次資料）、file:///workspaces/sodashitsu-remote-web-preview/.aidev/works/20261017-remote-web-preview/vite-poc-report.json
- 直し方: —

### C16 Vite既定allowedHostsはlocalhost配下とIPを許可する
- 場所: design:62
- 種類: 公式仕様
- 判定: 確認できた
- 根拠: 「localhost and domains under .localhost and all IP addresses are allowed by default.」。2026-10-17に公式を開き直しclaims.py quote一致。HTTPSでは検査を省略する注記もあるが、今回のHTTP検証の記述とは矛盾しない。
- 出典: https://vite.dev/config/server-options.html#server-allowedhosts
- 直し方: —

### C17 Vite公式server.wsはproxyのWS対応と直接fallbackを説明する
- 場所: design:62
- 種類: 公式仕様
- 判定: 確認できた
- 根拠: 「bypassing the reverse proxies」。同段落に既定reverse proxyはWS転送対応を期待され、接続失敗で直接Vite HMR serverへfallbackすると明記。2026-10-17に公式を開き直しclaims.py quote一致。
- 出典: https://vite.dev/config/server-options.html#server-ws
- 直し方: —

追加分の判定: 確認できた7、食い違う0、言いすぎ0、確かめられない0、対象外0。引用照合12/12一致、未照合0、lint欠落0。既存の10主張と旧/tmp証拠の再検証は今回の範囲外。修正依頼なし。
