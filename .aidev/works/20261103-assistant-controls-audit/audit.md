# アシスタントテーマのボタン適用範囲点検

対象: WebのVue 136コンポーネント、うちbutton宣言を持つ95コンポーネント・451箇所（v-for等で生成される実画面の個数とは異なる）。

## 統一した基準

- 操作 266箇所: 保存・実行・更新・生成・追加・接続・転送・再試行・確定/キャンセル等。共通の明示指定で金色。
- 危険操作 4箇所: 削除確認等、もとの赤文字/警告枠を維持。
- 通常表示 181箇所: メニュー、画面/タブ移動、一覧行、折り畳み、スイッチ、キー入力欄/キーボード、コンパクトな窓の操作等。元の表示を維持。
- 追加するための入口（作業ビュー/接続ビュー）は同じ操作として扱い、両方を金色にする。メニュー内部の項目は通常表示。
- 拡張の表示/帯ボタン等の汎用的なコンテンツ操作は独自の部品表示を維持。プラグインiframeやask-formのShadow DOM内は隔離部品自身の配色に従う。

## 主な適用漏れ

接続ビュー追加、分析の生成/CSV/JSON保存、予約の登録/編集/実行、リソース更新、ファイル保存、アシスタント起動の再試行、共有/接続設定の保存、転送の開始/停止、グラフの作成/適用。画面ごとのclass名の列挙ではカバーできなかったため、操作自体を明示する指定へ統一した。

## コンポーネント別の宣言数

| ファイル | 操作 | 危険操作 | 通常表示 |
|---|---:|---:|---:|
| schedule/ScheduleView.vue | 8 | 0 | 2 |
| dashboard/UsageAnalytics.vue | 1 | 0 | 1 |
| dashboard/DashboardView.vue | 0 | 0 | 2 |
| dashboard/UsageInsightsPanel.vue | 4 | 0 | 8 |
| dashboard/PaneInfoView.vue | 0 | 0 | 2 |
| dashboard/UsageAccountCost.vue | 1 | 0 | 0 |
| dashboard/AccountCostDialog.vue | 2 | 0 | 0 |
| dashboard/AgentUsageReport.vue | 1 | 0 | 0 |
| dashboard/PastSessions.vue | 2 | 0 | 0 |
| components/OnboardingDialog.vue | 2 | 0 | 0 |
| components/DisplayScriptMark.vue | 2 | 0 | 0 |
| components/TabViews.vue | 3 | 0 | 3 |
| components/AskDialog.vue | 0 | 0 | 2 |
| components/VscodeSharingSettings.vue | 1 | 0 | 0 |
| components/DisplayTray.vue | 0 | 0 | 2 |
| components/ConversationWindow.vue | 3 | 0 | 2 |
| components/ReceivedDownloads.vue | 2 | 0 | 0 |
| components/NativeTabView.vue | 1 | 0 | 0 |
| components/DashboardDialog.vue | 1 | 0 | 0 |
| components/DetachedView.vue | 1 | 0 | 0 |
| components/WorkspaceView.vue | 6 | 0 | 5 |
| components/DesktopCdpView.vue | 10 | 0 | 3 |
| components/AgentForkDialog.vue | 3 | 0 | 0 |
| components/StatuslineSettingsDialog.vue | 4 | 0 | 1 |
| components/ScreenSwitcher.vue | 0 | 0 | 4 |
| components/SystemFooter.vue | 0 | 0 | 1 |
| components/DesktopEndpointPairing.vue | 4 | 0 | 0 |
| components/SessionToolsWindow.vue | 4 | 0 | 2 |
| components/PaneStatusline.vue | 0 | 0 | 1 |
| components/PluginPackages.vue | 4 | 0 | 0 |
| components/AssistantSettings.vue | 1 | 0 | 0 |
| components/GitHistoryGraph.vue | 0 | 0 | 1 |
| components/Toast.vue | 1 | 0 | 1 |
| components/TabBar.vue | 2 | 0 | 1 |
| components/PaneInfoDialog.vue | 1 | 0 | 0 |
| components/LoginView.vue | 1 | 0 | 0 |
| components/MachineHeader.vue | 0 | 0 | 3 |
| components/WebPreview.vue | 7 | 0 | 1 |
| components/PaneBands.vue | 0 | 0 | 4 |
| components/DisplayFrame.vue | 2 | 0 | 0 |
| components/DesktopCompanionPage.vue | 4 | 0 | 0 |
| components/CommandPopup.vue | 0 | 0 | 1 |
| components/SubagentListDialog.vue | 1 | 0 | 0 |
| components/ReconnectOverlay.vue | 1 | 0 | 0 |
| components/ExtensionApprovalDialog.vue | 3 | 0 | 0 |
| components/DesktopFiles.vue | 8 | 0 | 1 |
| components/NotificationHistoryDialog.vue | 3 | 1 | 2 |
| components/ExtensionSettings.vue | 6 | 0 | 2 |
| components/PanePanel.vue | 0 | 0 | 1 |
| components/Sidebar.vue | 0 | 0 | 10 |
| components/DisplayPanelHead.vue | 0 | 0 | 3 |
| components/PaneActions.vue | 0 | 0 | 9 |
| components/DesktopSettings.vue | 1 | 0 | 0 |
| components/RemoteDesktopWindow.vue | 34 | 0 | 3 |
| components/SystemFooterSettingsDialog.vue | 1 | 0 | 1 |
| components/MachineRows.vue | 0 | 0 | 1 |
| components/LoginSettings.vue | 6 | 0 | 0 |
| components/ViewerTabBar.vue | 1 | 0 | 8 |
| components/DesktopNativeTransfer.vue | 3 | 0 | 0 |
| components/DesktopEndpointSettings.vue | 4 | 0 | 0 |
| components/KeySettings.vue | 16 | 0 | 6 |
| components/NameDialog.vue | 2 | 0 | 0 |
| components/NotificationBell.vue | 0 | 0 | 1 |
| components/WorktreeOpenDialog.vue | 0 | 1 | 0 |
| components/HelpDialog.vue | 1 | 0 | 0 |
| components/AskViewer.vue | 0 | 0 | 1 |
| components/SessionSwitchDialog.vue | 0 | 0 | 1 |
| components/SidebarRowsSettings.vue | 15 | 0 | 1 |
| components/WorkAgentRequests.vue | 2 | 0 | 0 |
| components/WorktreeCreateDialog.vue | 2 | 0 | 0 |
| components/ConfirmDialog.vue | 2 | 0 | 0 |
| components/SettingsDialog.vue | 20 | 0 | 14 |
| screens/ConnectionsScreen.vue | 12 | 0 | 0 |
| resources/ResourceMonitorView.vue | 2 | 0 | 0 |
| components/graph/GraphAddForm.vue | 2 | 0 | 0 |
| components/graph/SubagentPanel.vue | 0 | 0 | 1 |
| components/graph/GraphFrameLayer.vue | 1 | 0 | 1 |
| components/graph/RekeyPicker.vue | 2 | 0 | 0 |
| components/graph/GraphCanvas.vue | 7 | 0 | 12 |
| components/graph/GraphMinimap.vue | 0 | 0 | 1 |
| components/graph/HistoryPanel.vue | 0 | 0 | 2 |
| components/graph/GraphConfirm.vue | 1 | 1 | 0 |
| components/graph/GraphSpaceBar.vue | 0 | 0 | 1 |
| components/graph/LinkPanel.vue | 7 | 1 | 1 |
| components/graph/GraphSubagentLayer.vue | 0 | 0 | 2 |
| components/graph/MobileGraphSheet.vue | 2 | 0 | 1 |
| components/graph/GraphLinkMark.vue | 0 | 0 | 2 |
| components/graph/GraphNode.vue | 1 | 0 | 3 |
| components/graph/PaneChecklist.vue | 2 | 0 | 0 |
| components/graph/GraphTerminalWindow.vue | 3 | 0 | 4 |
| components/graph/SubagentTranscriptWindow.vue | 0 | 0 | 1 |
| mobile/ExtraKeys.vue | 0 | 0 | 11 |
| mobile/MobileShell.vue | 0 | 0 | 13 |
| mobile/MobileDisplaySheet.vue | 3 | 0 | 1 |
| mobile/PanePicker.vue | 0 | 0 | 6 |

操作指定を加えた66ファイルは、追加したdata属性を取り除いた内容が修正前main（50739210）の元ファイルとバイト一致することを機械的に確認済み。
