# 構造

- sourceに固定したElectron45.1.0/3OSx2arch catalogだけを使う。URLは公式GitHubの固定origin+version+archive名から構成し、任意URL/command/pathはRPCへ出さない。
- stream downloadを所有stagingへ書き、元の単調期限/AbortSignalを確認。bytes/SHAの一致後だけstream ZIP展開へ進む。whole archive/展開内容の一括RAM読み込みを避ける。
- ZIPはsingle-disk/非ZIP64、有限central catalog、name/type/CRC/size/重複/親/overlap/descriptorを確認。Macの内部framework linksだけを許可し、全linkの字句と実referentを同じstaging内に限定。実行はしない。
- Cacheはprivateなrootの所有と不変identityを呼出側に証明させる。公開済みruntimeを上書き/rename/deleteせず、owned stagingから新しいimmutable ready cohortをatomic publishする。元のruntimeを使う別processを壊さない。
- readが終わるまでphysical FDを所有し、公開前にも元のpermission/epoch/deadlineを確認。cancel後にlate completionで利用可能扱いにしない。
- 準備済みcohortは閉じたinventory/digest/linksを検証し、異常なcohortを実行しない。過剰なstaging/ready数をboundedにし、未所有/activeなものを勝手に掃除しない。

Prototypeはprivate tempだけで検証。Windows/Linux/macOS公式配布archiveのdigest/CRC/全entry/内部symlinkを検証して展開したが、binaryは実行していない。user production cache/OS trust/service/clipboardへ触れない。
