# 要件

管理者アプリ/UAC画面の共有中にも、別に許可した通常ユーザーのフォルダーを転送する。SYSTEM/privileged workerには転送操作とパスを渡さない。signin/lock-coverには広げない。単独/共有、通常/暗号化の既存file laneを使い、接続ごとのgrant・scope変更時停止・checkpoint policyを維持する。
