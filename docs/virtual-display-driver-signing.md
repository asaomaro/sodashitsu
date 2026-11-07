# Windows仮想画面ドライバーの署名と配布

Sodashitsu専用IDDはWindows 11 x64向けです。一般の仮想画面ドライバーへファイルを差し替える方式ではなく、専用HWID `Sodashitsu\VirtualDisplayV1` と所有leaseで作成・解放します。既存の物理画面や別製品のdeviceを削除しません。

IDDはUMDFのuser-mode driverです。kernel driverの署名要件をそのまま適用して、全UMDFが同一条件と断定しません。本製品の通常installerは、信頼された署名付きcatalog、配布時のmanifestと署名者の一致、Windows PnPの受け入れを必須にしています。[MicrosoftのIDD概要](https://learn.microsoft.com/en-us/windows-hardware/drivers/display/indirect-display-driver-model-overview)、[user-mode driverの署名](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/windows-driver-signing-tutorial)を参照してください。

## 署名前に用意するもの

- 固定WDK/SDKでビルドした`SodaVirtualDisplay.inf`、`.dll`、`.cat`と同じビルドの`.pdb`。ソースINFの`$ARCH$`などが残るものは使えません。
- 対応するソースcommitとCI run。提出元のSHAは署名後のpackage SHAとは別に記録します。
- 選択した署名サービスの登録と署名鍵。Microsoft Hardware Dashboardの提出には登録済み証明書、EV証明書の関連付け等の条件があります。鍵/PFX/passwordをリポジトリやログへ保存しません。[署名用証明書の条件](https://learn.microsoft.com/en-us/windows-hardware/drivers/dashboard/code-signing-reqs)

本番配布のWHCP/HLKと、テスト向けattestationは区別します。attestationはdesktopのkernel/user-mode両方を対象にしますが、HLK試験の代わりに品質合格を意味するものではありません。preproduction署名は別の信頼構成が必要であり、通常のPCへそのまま導入できるとは扱いません。[Microsoftの署名方式](https://learn.microsoft.com/en-us/windows-hardware/drivers/dashboard/driver-signing-offerings)、[HLK提出](https://learn.microsoft.com/en-us/windows-hardware/drivers/dashboard/hardware-submission-create)

## unsigned提出用CABを準備する

CIの`virtual-display-unsigned-build-only`はビルド全体、`virtual-display-unsigned-submission`は提出素材と未署名CABです。どちらも導入用releaseではありません。

```powershell
python scripts/remote-desktop/virtual-display-driver/prepare-signing.py `
  --package C:/build/SodaVirtualDisplay `
  --symbols C:/build/SodaVirtualDisplay.pdb `
  --output C:/submission-new `
  --source-commit <40桁のソースcommit>
Set-Location C:/submission-new
makecab /F submission.ddf
```

新規フォルダーへ4ファイルと`submission.json`/`submission.ddf`を作ります。既存出力の上書き、リンク経由のパス、別HWID、未stamp INF、x64以外のPEを拒否します。これはソース・PDBの真正性や署名の証明ではありません。CIとcommitの対応もレビューしてください。

提出には署名サービスの手順でCABへ署名し、登録したアカウントから提出します。本ツールは署名/アップロードを実行しません。Microsoftの提出ではcatalogが再生成されるため、返却packageから配布用hashを作り直します。[CABの作成と提出・返却](https://learn.microsoft.com/en-us/windows-hardware/drivers/dashboard/code-signing-attestation)

## 署名返却後の配布用検証

```powershell
scripts/remote-desktop/virtual-display-driver/prepare-release.ps1 `
  -PackagePath C:\returned\SodaVirtualDisplay `
  -OutputPath C:\release-new `
  -SourceCommit <40桁のソースcommit> `
  -SignToolPath 'C:\Program Files (x86)\Windows Kits\10\bin\<SDK>\x64\signtool.exe'
```

Microsoft署名付きSDK SignToolで`/pa /c`によるINF/DLLのcatalog membership、通常installerの署名・HWID・hash照合を行います。`manifest.json`はBOM/末尾改行なしの正確なUTF-8です。`review.json`にmanifest SHA256と署名者証明書のDER SHA256を出力します。返却packageはMicrosoft署名や証明書EKUも確認し、採用した署名方式の結果かをレビューします。[Microsoft署名の検証](https://learn.microsoft.com/en-us/windows-hardware/drivers/dashboard/code-signing-validate)

この検証はインストールもdevice作成もしません。署名済み正例の本番検査は、実際の返却物が得られてから行います。

## 導入と取り消し

配布物のレビュー後、管理者PowerShellで既存`install-virtual-display-driver.ps1`へpackage/manifest/期待SHA/署名者SHAを渡します。最初に`-ValidateOnly`で照合し、同じ引数からそのswitchを外すとDriverStoreへ登録します。登録だけでは画面を作りません。保護brokerも同じ版を導入し、明示的に仮想共有を開始して所有leaseを作ります。

取り消しは共有を閉じて自分のleaseを解放し、専用HWIDのdeviceが残っていないことを確認します。DriverStoreを取り除く場合は、導入時に記録した`oemNN.inf`のProvider/HWIDがSodashitsu専用packageであることを照合してから`pnputil /delete-driver oemNN.inf`を使用します。`/force`、物理GPUの削除、別製品のdevice削除は行いません。実機試験では開始前のmonitor一覧と解放後の一覧、実headless画像、入力/サイズ/再接続/終了時の元構成を確認します。

Secure Boot、署名検査、証明書storeは変更しません。未知CAの信頼追加、testsigning、preproduction信頼構成の導入は、この手順の自動処理に含みません。
