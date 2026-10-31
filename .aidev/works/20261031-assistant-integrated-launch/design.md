# 構造

- thin LaunchControllerだけをcomposeへ常設し、saved ON時だけBundledLaunchをdynamic import。準備のAbortControllerと元4分期限を一つの直列所有queueで管理する。
- NativeRootはWindows/WSLで固定絶対パスのPowerShellを一時起動。既存EndpointAclPolicyでfixed volume/全祖先owner/置換権限/reparseを検証し、専用rootはcurrent SIDのprotectedDACL。POSIXはcanonical home全祖先をpinし、root/current UID・非他者書込（trusted sticky例外）を確認する。
- 公式固定Electron runtimeは既存Cacheで準備。同梱HostAppのmanifestと全file digest/閉inventoryを検証してprivate immutable appを配置し、署名済runtime bundle内は改変しない。WSL→Windowsのpath変換も有効化のscope内で所有する。
- Generic runtime argvは検証済engine＋app dirのみ。Node-mode環境変数を除去し、managed stdinが親の生存lease。GUI名/userDataはSodashitsu Assistantへ固定。旧login起動はmanaged初期化で解除、保存失敗時は復元。
- strict enabled-only settings RPC。getは薄いstateのみ。setはlocalhost/TUIかつ生きた接続だけ。accepted state保存後の適用はserverの責任で行い、HTTP requestが先に返っても準備・停止は追跡する。
- Webはvisibleな設定画面内だけ状態をpoll、世代とwrite revisionで古いresponseを排除。TUIは設定項目と明示更新を持つ。準備中でもOFF可能。
- standalone package installer/ZIP artifact/electron-builderを削除し、既知の廃止distだけbuild時に掃除する。
