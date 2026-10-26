# 仮想display基盤（第6段階・前半）

現段階はdriver source/package buildとowner-bound lease/native target bindingの基盤。Node/protocol/UI/broker接続、署名済み配布、headless実captureは未完了。第6段階を完了にしない。

MS-PL Microsoft sampleのcommitをSOURCE.mdに固定し、専用hardware ID・1 EDID-less monitor・share container IDを使用。全体のmonitor state/countを置換しない。

自動検証ではfake owner/device/clock、native ABIサイズ、実mode callback関数をfake IDD型で実行。実driver導入・画面取得・表示変更・OS入力・clipboard操作は行っていない。

`validate-virtual-display.ps1` 成功。callback前取消/遅延callback/owner退出/初回ready期限/開始済みdeadline/adapter・container照合/構成変化を検査。`validate-modes.py` 成功。実callbackを抽出し、0/small/exact/large bufferとguard領域、不足時の書込みなしを確認。

ローカルA: 署名Microsoft NuGetでpinned WDK/SDK取得成功。MSBuild18.3はあるがCPP workloadのMicrosoft.Cpp.Default.props欠落でdriver本体build未成立。user OSへの開発環境追加をせずWindows CIへ分離。

独立taskcheck: review_transferで初回ready期限とsample由来default-mode不足buffer書込みを指摘。修正し、修正だけを除去したnegative failure後にexact bytesを復元してpositive成功。

## 初回ready期限

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Late initial active target must expire"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-virtual-display\scripts\remote-desktop\validate-virtual-d
isplay.ps1:4 文字:1
+ [SodaDesktopVirtualDisplayChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 

```

## default-mode buffer境界

```text
checks: /tmp/soda-idd-modes-cup_zfap/checks.cpp:97: int main(): Assertion `buffer.front()==guard&&buffer[count+1]==guard' failed.
Traceback (most recent call last):
  File "/workspaces/sodashitsu-desktop-virtual-display/scripts/remote-desktop/virtual-display-driver/validate-modes.py", line 61, in <module>
    subprocess.run([str(binary)],check=True)
  File "/usr/lib/python3.12/subprocess.py", line 571, in run
    raise CalledProcessError(retcode, process.args,
subprocess.CalledProcessError: Command '['/tmp/soda-idd-modes-cup_zfap/checks']' died with <Signals.SIGABRT: 6>.

```

## Windows CI 本体build

[run 40325102382](https://github.com/asaomaro/sodashitsu/actions/runs/40325102382) と [run 40325095046](https://github.com/asaomaro/sodashitsu/actions/runs/40325095046) 成功。Windows x64 MSBuild/WDKでSodaVirtualDisplay.dll/INF/catalog packageを生成し、fake lease/native ABIチェックとLinuxの実mode callback境界チェックも成功した。NuGet shimの署名・legacy x86 tool default・DEVPKEY link問題を修正した。driverは署名無効でbuildしており、実機へ導入していない。

前回レビュー後のCI/64bit toolpath/initguid変更を含めreview_transferの最終再レビュー通過。Node/既存runtimeへ接続しない独立基盤の追加のため、既存Node全体テストは繰り返していない。
