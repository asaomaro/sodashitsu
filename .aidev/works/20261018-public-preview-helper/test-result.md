# 検証結果

- `pnpm build`: 成功。
- `pnpm typecheck`: 成功（全パッケージ・scripts）。
- 関連preview・surface・web unit: 8ファイル・38件成功。
- `pnpm --filter @sodashitsu/e2e test preview-public-helper.spec.ts remote-web-preview.spec.ts`: 2件成功（41.5秒）。
  - 実TLSのHTTPS親画面→転送ヘッダー付き実HTTP/WS proxy→B外向き委譲→localhost到達proof→helper→iframeの見出しまでブラウザDOMで確認。
  - localhost確認ページを遮断した場合、helper未接続のまま手動コマンドを案内。
  - 従来localhost自動helper、HTTP/module/API/SSE/upload/WS、cookie隔離、タブ切替、登録/停止、設定領域のスクロールを確認。
- 独立レビュー・修正後の再レビュー完了。必須指摘残なし。

## 負の対照

surfaceの公開URL起動guardだけを一時的に従来の拒否動作へ戻してserverを再build。同じHTTPS E2Eが接続済み表示を待つ箇所で失敗した。元ソースをbyte一致で復元し再build、その後2件とも成功。

```text
    Error: expect(locator).toBeVisible() failed

    Locator: getByText('ブラウザPCのhelperに接続済み', { exact: true })
    Expected: visible
    Timeout: 15000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" getByText('ブラウザPCのhelperに接続済み', { exact: true }) with timeout 15000ms
      - waiting for getByText('ブラウザPCのhelperに接続済み', { exact: true })


      53 |     await header.locator(".machine-select").click();
      54 |     await openNativeTab(page,"web-preview");
    > 55 |     await expect(page.getByText("ブラウザPCのhelperに接続済み",{exact:true})).toBeVisible({timeout:15_000});
         |                                                                     ^
      56 |     expect(methods).toContain("preview.helper_probe");
      57 |     expect(methods.filter(m=>m==="preview.helper_start")).toHaveLength(2);
      58 |     await expect(page.locator("[data-preview-helper-command]")).toHaveCount(0);
        at /workspaces/sodashitsu/packages/e2e/src/specs/preview-public-helper.spec.ts:55:69

```

ログ: `/workspaces/sodashitsu-check-logs/20261018-maximize/` の `build-public-helper.log`、`typecheck-public-helper.log`、`unit-public-helper-final.log`、`e2e-public-helper-final.log`、`negative-public-helper-final.log`。

実Windows/WSL・利用者のChrome/Edge・Cloudflare経路でのクリック操作は未実施。自動試験の親画面は一時自己署名証明書を使い、testcontextだけで証明書とLNAを許可。公開hostnameは試験ブラウザ内だけでloopbackへ解決する。

## 稼働環境への反映

`node packages/server/dist/main.js handoff --state-dir /home/asaomaro/.local/state/sodashitsu` 成功。PID7467の7ペインを保持。localhostと既存のCloudflare公開URLはいずれもHTTP200。稼働サーバの新規probe APIに対し、存在しないviewerで安全なnot_found応答を確認（旧版のunknown methodではない）。sr-pcはonline。利用者のブラウザでの再読み込み・LNA許可後の実操作確認は利用者側。
