# 検証記録

2026-10-21。成果物用worktree `/workspaces/sodashitsu-work-agent` で検証。実稼働のA/B、認証設定、会話履歴は変更していない。

## 結果

- `pnpm build`: 成功。追加修正後のserver/CLIビルドも成功。
- `pnpm typecheck`: 全体成功。最終差分についても再確認。
- 全体 `vitest run --maxWorkers=2`: 733ファイル中731成功、11221件成功。2件は下記の通り再確認して成功。全体が初回からすべて成功したとの扱いにはしない。
- `soda.pty.integration.test.ts`: 全体実行中に追加したソースがdistより新しくなり、beforeAllで停止。再ビルド後、実PTY起動・描画・入力・復元を含むテスト成功。
- 既存 `SettingsDialog.test.ts` の伝播テスト: 全体実行時15秒timeout。同じテストを単独再実行し成功。該当の製品/テストソースは変更していない。失敗切り分けの再試行は各1回で終了。
- 起動機能関連9ファイル227件成功。その後、実exec中断のcancelledフラグ確認と、現Codexの設定読戻し/Web起動timeoutの最終差分を個別に再確認。
- `pnpm smoke`: 成功。分離した一時stateのサーバを使い、ブラウザ上の端末canvas、初回案内、キー入力が実PTYへ届くことを確認。
- `git diff --check`: 成功。

## A/B実通信

`workAgent.integration.test.ts` が一時ディレクトリで実SodashitsuサーバA/Bを起動。Bでの要求だけではAのCLIが起動せず、Aの受付後に専用paneが作られる。AのCLIはfixture実行ファイルで、実モデル/APIは呼ばない。

ネイティブargv、remote規約/メモ、Bでのファイル更新・コマンド実行・メモ更新、JSONエスケープで1MiB超となる応答後の継続、execの実プロセス中断、同一launchから33回連続exec（完了channelを閉じ、Bのjob上限に達しない）、二重起動拒否、PJ変更/切断後の失敗を確認。Aのファイルは変更されない。一般の接続cookieは子へ渡さない。

## 現行ネイティブCodexの境界

Codex 0.163.0を実起動し、localhostだけのfake Responses providerとfixture MCPでdispatchを検証。外部モデルへの通信・課金は発生させない。別コンテキストでも正負対照を実施。

- 現行CLIは `features.unified_exec=false` を渡しても一覧にtrueを返す。これを起動必須条件にすると誤拒否になるため、必須条件から除外。
- 実際のgeneratedArgsで `shell_tool=false` のとき `exec_command` / `write_stdin` はregistryに存在せず、`remote_work`は存在する。同じ引数でshell_toolだけtrueにした対照では両shell APIが出現。
- `view_image=false`、他の禁止設定は読戻しで必須検証。`code_mode_host=true` はMCPのdispatchに必要。
- read-only sandboxでネイティブapply_patchは拒否され、一時ファイルは不変。
- 専用remote_workだけを許可し、fixture MCPへの実dispatchが成功。
- 最終実CLIのfeatures出力を製品のpreflight検証関数に通し成功。

証拠は `/workspaces/sodashitsu-check-logs/20261021-work-agent/review-probe/` と `codex-effective-final.log`。Windowsでの実CLI起動/実モデル会話は今回の自動検証に含まない。対応するCLIと両側Sodashitsuの更新が必要。

## 回帰テストの負対照

各修正だけを一時的に外して失敗を確認し、検証後に元ファイルとの一致を確認。IPCはテストが使う修正前の読取上限を復元して実通信を検証。以下は失敗時の生の出力。

### 通常resumeの抑止

```text
 FAIL  |@sodashitsu/server| src/session/SessionService.test.ts > SessionService — workspace の自動の名前 > 復元 — 公式フック連携の会話再開（design D9〜D11） > managed remote agent never restores with plain native resume
AssertionError: expected [ 'claude --resume remote-session\r' ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "claude --resume remote-session
",
+ ]

 ❯ src/session/SessionService.test.ts:2025:70
```

### 4MiB IPC応答

```text
 FAIL  |@sodashitsu/cli| src/workAgent.integration.test.ts > B requests; A starts its own CLI and routes tools/memory only to B, preserving resume args
Error: 作業先proxyが切断されました。ローカルでは代行しません
 ❯ WorkAgentClient.close src/workAgentIo.ts:65:78
     63|   close() {
     64|     if (this.closed) return; this.closed = true; this.socket.destroy();
     65|     for (const p of this.pending.values()) { clearTimeout(p.timer); p.…
       |                                                                              ^
     66|     this.pending.clear();
     67|   }
 ❯ src/workAgentIo.ts:36:22
```

### MCP中断通知

```text
 FAIL  |@sodashitsu/cli| src/workAgent.test.ts > forwards cancellation while a remote command is pending and remains usable
AssertionError: the given combination of arguments (undefined and string) is invalid for this assertion. You can use an array, a map, an object, a set, a string, or a weakset instead of a string
 ❯ src/workAgent.test.ts:71:88
     69|   await vi.waitFor(() => expect(client.request).toHaveBeenCalledWith("…
     70|   send({ method: "notifications/cancelled", params: { requestId: 2 } }…
     71|   await vi.waitFor(() => expect(replies.find(r => r.id === 2)?.result.…
       |                                                                                        ^
     72|   send({ id: 3, method: "ping" });
     73|   await vi.waitFor(() => expect(replies.find(r => r.id === 3)?.result)…
```

### 連続execの回収

完了channelを閉じない修正前の保持方式に戻し、serverを再ビルドして同じ実通信テストを実施。失敗後にソースのbyte一致と復元ビルド成功を確認。

```text
 FAIL  |@sodashitsu/cli| src/workAgent.integration.test.ts > B requests; A starts its own CLI and routes tools/memory only to B, preserving resume args
Error: 接続先の操作に失敗しました。接続とPJを確認してください
 ❯ src/workAgentIo.ts:33:33
     31|           if (!p) continue;
     32|           this.pending.delete(m.id); clearTimeout(p.timer);
     33|           if (m.error) p.reject(Error(String(m.error))); else p.resolv…
       |                                 ^
     34|         }
     35|       } catch { /* Reject all requests without logging private input. …
```
