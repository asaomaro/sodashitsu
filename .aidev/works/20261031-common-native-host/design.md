# 設計

通常権限3roleだけを共通CLR imageへ移行する。固定role/type/相対DLL名/32hex module ID/64hex digestを閉じた契約にし、任意pathや型名を受けない。DLLはbounded read + SHA256 + hardlink拒否後にメモリloadし、copy/selection専用STA thread、audio MTAでMainへ渡す。SYSTEMはbuilder/host両方で拒否する。

固定SDK builderはEndpointAclPolicyでcurrent-user private cacheと祖先、fixed driveを確認する。host source SHA族の中にimmutable UUID host cohortを発行し、owned backup付きatomic current pointerで切替える。使用中PEは上書き/削除しない。module準備は直前host ID+hashを要求し、当該roleの固定ソースだけをcompileする。host familyは24項目、roleは128個、fileは8MiB上限。metadata不整合/absent pointerだけをfresh cohortで復旧し、不正pointer等は拒否する。

Node ownerは構築時IOなし。明示prepare時に固定PowerShellへbounded stdin JSON、owned childの実closeまで待つ。WSLではmounted PEを起動し、SDK pathのみWindowsへ変換する。module builder終了後は既知rootからartifactを登録するため、OFF後にpath変換processやpreflightを開始しない。role argvとpreflight成功前は実行pathを公開しない。disable時はprepareをretireし、各role childの実close後だけmoduleをstamp/links/closed inventory確認して削除する。同時closeは同一Promiseを共有する。

既存nonce/epoch/PID/creation time/held handle/pipe peer PIDを維持する。通常roleに元からJob/exe image認証はない。privileged service/workerのJob/fixed image境界とは混同しない。

配布物へhost/builder/固定role sourceの12資源を追加する。旧3production builderは撤去する。selection旧builderは既存blocked-stdin watchdogのprivate fixtureとしてだけ残す。
