# 暗号化agentのローカル鍵基盤

利用者の全残件継続に対する次の分割。agent role/laneはcrypto契約にあるが公開routeはviewerのみ。中継RootRPCに画面やgrantを平文で送る既存agent経路を、そのまま暗号化対応とはしない。

本差分はNode用の既存鍵store/DPAPI/ACL/fixed PowerShell helperをclient-coreの明示.node subpathへ移し、server旧pathはre-exportで保持する。CLIからserver/PTY全体へ依存せず同じ保護を使える基盤にする。browserの標準indexからNodeモジュールをexportしない。helper resource相対パスは同じdepthで維持する。既存vault形式/保存場所/peer許可/required/排他writer/atomic syncは変えない。

- Node専用localIdentity()を追加し、所有者の鍵を非抽出identityとして返す。ネットワークRPCやWeb/UIには公開しない。private secret byteをJSON/ログ/外部引数へ出さない。
- load→非同期restore→load再検査で同じpublicKey/secretとpolicyRevision/closedを確認。active()もowner close/policy変更で即失効。取得完了後は呼出し側がsource/process epochを追加で束縛する。初期化やtrust変更を暗黙に行わない。未初期化/書込中/危険なpath/復号失敗は拒否する。
- 新APIのclose中restore/鍵入替/policy変更の負例を直接source単体で検証。既存server store/ACL/protector/endpointの回帰もfresh build後に検査。Node生成identity同士のagent/provider handshakeのみ検証し、実デスクトップ取得/入力やOS trust/サービス操作を行わない。
- root既存変更を維持、独立taskcheck/全体review/追加再点検、fresh build/typecheck/全体test、独立build/smokeと既存暗号browserを実施する。

本段階ではCLIコマンド、agent recipient接続、Webのagent欄はまだ有効化しない。次差分でCLI identity/status/初期化、後続でB recipient/grant fingerprint結合と暗号transport/CLI/MCP/model/UIを実装する。task10全体の完了とはしない。

独立設計点検のshould対応: Storeは単一ownerで利用し、プロセスlockを解放する前にcloseしpending persistenceをsettledする。localIdentityのactive()は別Store/別プロセスのvault書換えを自動検知するものではなく、呼出し側もsource/process epochを束縛する。後続CLIでもこの制約を維持する。
