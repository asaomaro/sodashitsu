# ロックカバー専用待機の削除（第一単位）

base 0a6d8871。Web/protocol担当。backend別所有はC#/PS/Provider/SharedCapture。通常Default上LockAppは既Host capture、Winlogonは既SYSTEM RunSecure、UACは既RunProtected。新しいcaptureや独自の待機状態を追加しない。ロック中の既secureDesktop権限境界、allowUnlock/elevated、入力epoch/frame/control再許可は維持。

Webのcover overlay/ref/dismiss pending/inflight/専用button/send/画素非表示を削除。protocolはdismiss commandを削除。DesktopReady.lockScreenCover optionalだけ旧helperを更新エラーへ閉じるため互換パースとして残す。新helperはemit/acceptしない。

比較根拠（コピー実装しない）: RustDesk 95cca3f661f635b3cc85c04935fe8d96d8f432ef src/platform/windows.cc313/347 (OpenInputDesktop/SetThreadDesktop)、src/server/portable_service.rs697 (desktop change時capture再生成)。https://github.com/rustdesk/rustdesk/blob/95cca3f661f635b3cc85c04935fe8d96d8f432ef/src/server/portable_service.rs#L697

第二単位の永久fault縮小は未着手。FreeRDP fba7d19ac85f834700328ed445b8949087de6ccd server/shadow/shadow_input.c87–118 keys解放、shadow_client.c3261–3268 cleanup warning後disconnect/freeはRoot調査の根拠であり、この第一単位で同等に全面変更したとは主張しない。https://github.com/FreeRDP/FreeRDP/blob/fba7d19ac85f834700328ed445b8949087de6ccd/server/shadow/shadow_client.c#L3261

実Windows/接続/input/service/audio/モデル操作0。統合buildはbackend最終統合で1回、作者は全体build重複しない。意味回帰/生成Chrome/旧負例→bytes復元/独立レビューを実施。
