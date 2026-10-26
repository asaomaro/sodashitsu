# 第5段階 native codec 検証

生成bitmap/bytesとfake inputだけで検証。実画面、ユーザー入力、clipboard、OS mode変更は実行していない。

独立レビュー: review_transfer（Node/protocol/Windows）とreview_pointer（browser/UI）。最新の未commit差分も確認し、必須修正なし。reset送信失敗のunit期待値をimages/reason congestedへ訂正し再確認済み。

実hardware encoder: AはH264 avc1.42041e、HEVC hev1.1.6.L63.B0、BはH264 avc1.42401e、HEVC hev1.1.2.L90.90。各4frameとforced random accessを確認。AYUV H264444候補なし。AV1はA出力stall/B初期化E_FAILで未対応。登録候補はencodeVerified=falseであり対応実績に数えない。

AV1 fixtureはChromium software VideoEncoderで生成し、C# normalizerが実sequence headerからcodec stringを取得。production encoderはhardware-only。HEVC fixtureはAの実hardware MFT出力。Linux ChromiumのHEVC復号は非対応のためH264復帰を確認し、HEVC描画成功とは記録しない。

ブラウザ試験: AV1 UDP/WSS/欠損復旧、実AV1同一family解像度変更1280×720→960×540、HEVC decoder非対応、意図的decoder拒否、encoder非対応、旧helper、新codec active decoder failure中のShift解放/操作許可解除/旧callback無視を確認。canvas実pixelと継続frame増加を検査する。

negative controlでは対象修正だけを除去し、失敗の生出力を以下へ記録。元のbytesへ復元して一致を確認済み。

## reset送信不能時の再開防止

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-native-codecs

 ❯ |@sodashitsu/server| src/desktop/DesktopNativeCodecs.test.ts (7 tests | 1 failed | 6 skipped) 13ms
   × stops without opening a replacement stream when the input revocation fence cannot be delivered 12ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeCodecs.test.ts > stops without opening a replacement stream when the input revocation fence cannot be delivered
AssertionError: expected [ …(2) ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ src/desktop/DesktopNativeCodecs.test.ts:42:79
     40|  f.send.mockImplementation((m:unknown)=>(m as {type?:string}).type!=='…
     41|  f.video.fromViewer({type:'native_codec_fallback',id});
     42|  expect(f.write.mock.calls.filter(([m])=>m.type==='native_video'&&m.en…
       |                                                                               ^
     43|  expect(f.write).toHaveBeenCalledWith({type:'release'});
     44|  expect(f.send.mock.calls.map(([m])=>m)).toContainEqual(expect.objectC…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  20:19:35
   Duration  672ms (transform 75%, import 22%, tests 2%, worker 1%)


```

## 単一picture境界

```text
Add-Type : \\wsl.localhost\ubuntu\workspaces\sodashitsu-desktop-native-codecs\scripts\remote-desktop\WindowsDesktopHost
.cs(1750) : �G���[�Ƃ��Ă̌x��: �ϐ� 'pictures' �͊��蓖�Ă��Ă��܂����A���̒l���g�p����Ă��܂���B
\\wsl.localhost\ubuntu\workspaces\sodashitsu-desktop-native-codecs\scripts\remote-desktop\WindowsDesktopHost.cs(1749) :
         foreach(var nal in Configuration(header))Parameter(nal);var nals=Nals(bytes);bool vcl=false,key=true;var prese
nt=new HashSet<int>();
\\wsl.localhost\ubuntu\workspaces\sodashitsu-desktop-native-codecs\scripts\remote-desktop\WindowsDesktopHost.cs(1750) :
 >>>         int pictures=0,delimiters=0;
\\wsl.localhost\ubuntu\workspaces\sodashitsu-desktop-native-codecs\scripts\remote-desktop\WindowsDesktopHost.cs(1751) :
         foreach(var nal in nals){
�����ꏊ \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-native-codecs\scripts\remote-desktop\validate-codec-packe
ts.ps1:3 ����:1
+ Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsDesktopUnlock.cs'), ...
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : InvalidData: (Microsoft.Power...peCompilerError:AddTypeCompilerError) [Add-Type]�AExcepti 
   on
    + FullyQualifiedErrorId : SOURCE_CODE_ERROR,Microsoft.PowerShell.Commands.AddTypeCommand
 

```
