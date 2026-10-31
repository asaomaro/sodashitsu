# 構造

1. 既存GUI main/preloadをfirst-party資源としてbundle。node/electron builtin以外のJS依存を含め、WindowsからWSLのpnpm symlinkを辿る必要をなくす。元のdist/assets相対配置とCSP/隔離を維持。
2. soda内部の閉じたassistant-host roleがGUI資源と共通Electron runtimeを選ぶ。任意URL/commandをRPCへ出さない。実行先は起動時OS/WSLから固定し、WSL時はWindows側表示を維持。
3. runtimeは固定version/platform/arch+固定digestのmanifest。公式配布だけ、容量/時間/項目/展開先/linksの上限と所有確認、未完了staging cleanup、完了後atomic publish。準備はON時だけ。既に同梱ならdownload不要。
4. Web/TUIは薄い状態とenabled設定だけを読む。ONはserver flagのatomic保存→Controllerのasync resolver。watch/generationとAbortSignalで準備中OFFを中断し、最終flag/metadata再検査後だけ所有するGUI子を起動。停止・handoffは実終了を確認し、未確認childを二重所有しない。
5. 共通runtime上のGUIは既存managed stdin/EOF/attached/disabled契約を使用。ログイン時の独立起動はmanaged modeで無効にし、同じuser-data/端末ID/専用sessionを継続。OS permissionの回避はしない。

独立exeの廃止はpackage scripts/workflow/docsを含めて行い、単なるファイル名変更や独立ZIP導入UIへ置き換えない。

## 資源準備の実装

serverはworkspace dependencyとTS project referenceでdesktop-assistantのcompile後にbuild-hostを実行する。desktop-assistantの通常buildは従来どおりtscのみ、build:hostは開発用の明示生成。pnpm -rでもserver単体buildでも資源を生成し、GUI自体は起動しない。生成フォルダーはpackages/server/assets/assistant-hostでgit管理対象外。Soda packは既存server assetsコピーとDesktop workspaceの配布収録を行う。

main.mjs/preload.cjsはElectronとNode builtinだけを外部依存にし、dist/assets相対配置を保つ。含む依存のLICENSEとSodaのLICENSE/NOTICEを同梱し、全ファイルのサイズ/SHA-256をmanifestへ記録する。privateなnode_modules無しfixtureでsynthetic Electronによる拒否startupとpreloadの固定surface、全manifest entryのbytes/digestを確かめる。実Electron・画面・録音・モデルを実行しない。

runtime catalogは既存依存と同じElectron45.1.0の3OS×x64/arm64。公式SHASUMS256とGitHub release assetsのsizeを取得して固定し、ビルド/通常起動ではdownloadしない。runtimeの準備と利用者設定は未実装。実行時には信頼したSoda資源をimmutableな所有cacheへ写してから起動し、build中の資源交換を実行中GUIへ見せない予定。

一次資料: [Electron配布方式](https://www.electronjs.org/docs/latest/tutorial/application-distribution)、[固定v45.1.0](https://github.com/electron/electron/releases/tag/v45.1.0)、[公式SHASUMS256](https://github.com/electron/electron/releases/download/v45.1.0/SHASUMS256.txt)。

## 後続roleで維持する境界

公式runtime自体は改変せずimmutable cacheへ準備し、検証済みhost資源を別のimmutable app folderへコピーして起動引数で渡す。WSLは両方をWindows側の所有cacheへ置き、bundle済みJSからWSL node_modulesのsymlinkを辿らない。GUIのapp name/userData/端末IDは既存名へ固定する。汎用runtime+app folderはunpackagedとして動くため、Windows managed起動時の既存login-item退役と保存失敗時rollbackをisPackagedだけで落とさないこと（public IPCは引き続きmanaged中の新規startup設定を拒否）。コード署名・Gatekeeper・ExecutionPolicyの回避を追加しない。
