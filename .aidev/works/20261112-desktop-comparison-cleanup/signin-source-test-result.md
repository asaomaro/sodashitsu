# サインイン整理: ソース検証

実行場所: `/workspaces/sodashitsu-signin-cleanup`。Windows実機のサービス・Task・レジストリ・鍵は操作していない。

## Node

```
node scripts/remote-desktop/validate-signin-bootstrap.mjs
signin_bootstrap_standard_node_loader_passed

pnpm exec vitest run packages/server/src/signin/bundle.test.ts packages/server/src/signin/nativePackage.test.ts
Test Files  2 passed (2)
Tests  2 passed (2)
```

最初のbundleテストは隔離worktreeのprotocol/client-coreのdistがなく失敗。両packageをビルド後に成功。

## C# のコンパイル

UbuntuのMono 6.8パッケージを`/tmp/soda-signin-csharp`に展開し、各PowerShellの閉じたソース一覧をlibraryとしてコンパイルした。パッケージをシステムへインストールしていない。コンパイル済みのSYSTEMエントリポイントは実行していない。

```
build-signin-host.ps1 0
control-signin-service.ps1 0
control-signin-admin.ps1 0
validate-signin-worker.ps1 0
validate-signin-host.ps1 0
install-signin-service.ps1 0
upgrade-signin-service.ps1 0
```

MonoでのコンパイルはWindows PowerShell 5.1でのコンパイルやSCM/DPAPI/WTS/Jobの実機検証の代わりではない。

## 純粋な生成テスト

一時的なMainから、OS入力/SCM/DPAPIを呼ばない既存の検査だけを実行。

```
signin_scope_generated_epoch_expiry_frame_and_input_passed
signin_presence_generated_readonly_expiry_and_commands_passed
signin_native_closed_roles_generated_pass
```

`git diff --check`成功。独立レビューとWindowsのコンパイル・実機検証は統合担当で実施する。
