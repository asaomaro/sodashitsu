# Task9A: native契約とLinux Portal実験版

完了範囲は新native protocol、OSごとのsetup/非対応権限表示、Linuxの明示Portalセッション、実デバイスを使わない検証。task9全体とmacOS実装は未完了。

ローカルSODA_DESKTOP_LINUX_PORTAL=1が必須。import-only probeはOS picker/Gst初期化を行わない。configure後だけGioの型付きD-BusでScreenCast v6/RemoteDesktopを要求する。persist/restoreは使わず、要求path/session、owned FD、pipewire-serial、サイズを固定。shared source/audio/video/Windows管理者機能をadvertiseしない。旧peerに未知fieldを送らない。Windows/WSLルートを維持する。

入力はOS device grantsとローカルallowInputの積。型と全textを入力前検査、raw Ctrl+Space/evdev buttons/wheel、seq/期限/releaseを検査。JPEG公開と入力はrecord全体のRLockで直列化。post-input Gst running-time barrierとsourceInputSeqによって、ACK前の画像をagentの入力後観測に使わない。未計測取得/encodeはunavailableとして—表示。

logindのunique owner/UID/active graphical sessionを固定し、GetAllとI/O threadのGIO filterで不可逆に失効する。main-context配送前のlock→unlockも失効する。filterはEventのみ設定し、I/O threadでブロックやD-Bus呼出しをしない。Portal Closed/stream error/EOS/サイズ変化も終了する。

Portalは静止時の新規取得を保証しない。pipewiresrcのkeepaliveは古いbufferのコピーであるため使わない。1.5秒sampleなしをsource_stalledで明示停止する。通常有効にはせず実験版として扱い、静止producer互換性・macOS・音声等の残件を利用docs/UI/台帳へ記録する。task9を完了扱いしない。

一次資料: xdg-desktop-portal ScreenCast/RemoteDesktop、PipeWire gstpipewiresrc/gstpipewirecore、systemd org.freedesktop.login1、GIO add_filter/signal_subscribe。libportalや他製品のコードはコピーしていない。Portal/Gst/OS入力/lockの実操作は自動検証しない。
