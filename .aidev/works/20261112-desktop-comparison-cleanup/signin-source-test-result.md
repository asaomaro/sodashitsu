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

## 削除後・初回導入縮小後の追加コンパイル

上の7セットに加えて次の4セットもMonoでコンパイル成功。Windowsエントリポイントは実行していない。

```
validate-signin-admin-controller.ps1 0
validate-signin-process-evidence.ps1 0
validate-signin-state-layout.ps1 0
validate-signin-install-source.ps1 0
```

## 独立レビュー指摘: 子Jobの停止失敗時のDispose境界

`Child.Dispose`が例外を投げると、外側のコード/runtime保持が解放され得たため、停止を確認できないときはFailFastで通常のunwindを止める境界へ戻した。検査専用の子プロセスが実際の`Child.Dispose`を無効なJob handleで呼び、外側finallyのファイルが作られないことを確認した。実SCMやWindows APIは呼ばない。Windowsの既存Host検証にも同じ子fixtureの確認を追加。

修正箇所だけ元に戻してEXEをコンパイルし直し、元の実装で同じ検査が失敗することと、ソースのバイト一致での復元を確認した。生の出力:

```
fixed: exit=-6 outer_unwound=False
negative_original: exit=1 outer_unwound=True
AssertionError: Failed child cleanup released outer leases
restored: exit=-6 outer_unwound=False
dispose_boundary_negative_control_and_exact_restore_passed
```
