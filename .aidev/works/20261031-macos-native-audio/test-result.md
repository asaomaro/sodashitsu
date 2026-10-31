# 検証

- Swift source92e8bffb: hostedMac run41174576082成功、実SDK compile/ad-hoc sign、--self-test生成200checks、既存20negative。capture/input/clipboard false。background actor→実audioLive(main.sync)→fake stop main.async→RunLoop pumpでretired/pipeClose/fatal0を確認。
- Node設定/Web/TUI6files59tests、Linux/Mac synthetic privatePCM/Opus shared・mixed viewer8cases、short-path8tests、POSIX設定3files41tests pass。
- 最新main1d4797aaを取り込みbuild/typecheck pass（最終のtest fixture canonicalization/CI/E2E編集後の確認は後続）。全体920files/13,254tests pass、Windows専用1file/1test skip（/tmp/soda-macos-audio-all.log、exit0）。
- 独立risky taskcheck review_transfer: must/shouldなし。main queue回帰追加で前should解消。Frame/socket/controllerと設定/permission/実child所有権を確認。

## Darwin path負例

隔離copyで既定rootを元のtemporaryへ戻すと、長いTMPDIRからsocket pathが135byteとなり100byte上限を超える回帰が失敗した。修正後1pass、負例1fail。元ソースへ復元しbyte一致を確認。/tmp/soda-mac-pcm-path-{positive,negative}.log。

```text
FAIL DesktopNativePcmPath.test.ts > keeps the default Darwin socket name within sun_path under long per-user TMPDIR
AssertionError: expected 135 to be less than or equal to 100
```

## ローカルbrowser

Mac shared1caseだけを実行し、mediaを開始する前のmachine online表示で45秒timeoutが再現。前sliceでmainと比較済みの同じ初期認証基線問題で、試験を反復しない。/tmp/soda-macos-audio-browser-local.log。fresh CIで新しいaudio browser判定とscreenshotを確認するまで成功扱いにしない。実OS音声デバイスは触らない。

```text
Test timeout of 45000ms exceeded.
Error: expect(locator).toBeVisible() failed
```

最終headで21件目のaudio permission callback負例、Mac/Linux Node境界、fresh browserを確認する。取得・再生の実機確認とは区別する。


最終whole review_transferはorigin/main全29paths（原Swift/Node/UI/CI/docs/負例含む）を読取り、must/shouldなし。最終21負例・Mac/Linux Node境界・fresh browserと生成画像目視はPR後の最終head CIで確認する。配布SDK全体の不足資源は別sliceで点検する。
