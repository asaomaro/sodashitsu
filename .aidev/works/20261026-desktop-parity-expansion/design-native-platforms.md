# 第9段階: Linux/macOSのnative capture/input

通常のデスクトップ取得と入力をOSの正式なAPIへ接続する。Windows/WSLの既存helper選択を維持し、syntheticをnativeとして提供しない。Linux/macOSの実OS取得・入力・権限変更は自動試験しない。生成driver、API拒否・世代失効、browser描画と各OSの依存確認/コンパイルを分離する。

## 小さい差分へ分割

9Aはnative-platformの旧peer gate、固定失敗理由、OSごとの入力capability、helper検出とLinux Portal。9BはmacOS ScreenCaptureKit/CGEvent。各差分でbuild/typecheck/全体・関連browser、独立taskcheck/全体レビューと修正再レビュー、PR/mergeを行う。task9全体の完了は両backendと利用条件の説明が揃ってから判断する。

- Linux: XDG RemoteDesktop/ScreenCast Portal + PipeWire/GStreamerを使い、BのOS上の共有ダイアログでmonitorを選ぶ。BのSoda共有許可とOS許可は別。readonlyはScreenCast、操作ありはRemoteDesktopと組み合わせる。restore tokenは保存せず、取消/closed/source消失は不可逆に終了する。X11/uinputの権限回避へfallbackしない。PortalのNotify入力とEISは同時使用しない。
- PipeWire: v6以降のpipewire-serialをtarget-objectへ固定する。node IDは再利用され得るので、serialが確認できない経路を暗黙に使わない。最初のLinux版はこの条件を満たすbackendを要件として明示する。GI/PipeWire/GStreamer部品・OS許可・利用可能sourceを区別して通知する。
- macOS: ScreenCaptureKitのSCStreamでcaptureし、CGEventへ入力する。screen-recordingとAccessibilityの許可は別にread-onlyで確認し、自動承認・TCC DB変更をしない。console user/source/stream停止を監視し、source世代をまたぐフレーム・保持入力を使わない。最小OS/SDKと未対応のキーを明記する。

## protocolと境界

新しいsubprotocolとB capabilityを確認したAだけがnativePlatform optionを送る。Bはローカルのbundled backendと要求の一致を検査する。旧viewerへ未知backend/fieldを公開する前に更新案内で拒否する。Windowsの経路へ新helper optionを渡さない。

native Readyのbackend proof、入力capability（key codes/text/buttons/wheel）、未計測timingを定義する。A/B/browserとagent APIの入力境界でcapabilityを守り、未対応キーを別操作へ変換しない。Linux/macOSのimage共有を既存viewer/poolへ接続するが、Winlogon/UAC、物理解像度変更、仮想driver、音声・native video等はOS実装がない限り広告しない。

Portalのローカル選択待ちは専用の有限期限を持ち、通常Windowsの15秒期限を変更しない。viewer停止で進行中のOS request/sessionを取り消す。失敗は固定理由に変換し、native exception/実パス/window titleを転送しない。取得・JPEG化・JSON準備後の出力時に同じsession/epochを確認し、古いbufferを新しい入力後の画像として扱わない。

## 調査した一次資料（2026-10-27）

- RemoteDesktopの作成/OS選択、input方式とsession境界: https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.RemoteDesktop.html
- PipeWire stream serialとnode ID再利用: https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.ScreenCast.html
- libportal公開API（bindingを利用し、ライブラリ実装は複製しない）: https://github.com/flatpak/libportal/blob/main/libportal/remote.h
- ScreenCaptureKit: https://developer.apple.com/documentation/screencapturekit
