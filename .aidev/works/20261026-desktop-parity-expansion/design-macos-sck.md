# macOS native experimental backend

macOS 14以降。Apple ScreenCaptureKitのSCScreenshotManager.captureImageで毎回新しく取得し、JPEGの通常画像を返す。静止画でも古い保持画像を新しい取得として再送しない。H264/音声/clipboard/解像度変更/保護画面はこの差分に含めない。実機が未登録のため、Mac CIのcompile/probe/generated self-testと実機検証を区別する。

- 通常ログイン中のlocal user・on-console・login done・active displayだけ。session非active、sleep、表示構成変更、loginwindow前面、permission失効、取得停止で終了。signin/unattendedは提供しない。
- 入力はローカル起動引数とserver許可に加えてAccessibility/PostEvent許可が必要。能力表に載せたキーと5button/wheel/textだけ。Ctrl+Space等は実キーのまま送信。現物OS入力は自動試験しない。
- source revisionと取得開始前後・公開前を検査。input/解除で未公開画像を失効。1画像ACK待ち、最新候補1つ、stdout/commandを有限にし、期限切れ入力は捨てる。
- --probe/--self-testは画面・OS入力・実clipboard・権限promptを使わない。自己検査はFakeSinkと生成JPEGを使う。通常有効化はSODA_DESKTOP_MACOS_SCK=1とローカルの共有許可を必要とする。
- macOS CIでSDK compileと生成試験、Node fake mac backendの既存WS/ブラウザ経路を検査。独立taskcheck/全体review必須。

参考（API契約のみ参照。サンプル全体のコピーはしない）:
- https://developer.apple.com/documentation/screencapturekit/scscreenshotmanager/captureimage(contentfilter:configuration:completionhandler:)
- https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos
- https://developer.apple.com/documentation/screencapturekit/scframestatus/idle

SCFrameStatus.idleは新しいrasterが生成されなかった状態のため、今回の初期backendはstreamの保持rasterを再送せずfresh screenshotを使う。比較製品と同じFPS/遅延を実機で確認済みとはしない。
