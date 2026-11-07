# Grok正式session locator（会話・usage共用）

pinned公開source2bdd1d6（installed1.0.77のcommit一致は未確認）のJsonlStorageAdapterとxai-grok-config/paths/xai-dirsを根拠とする。非empty GROK_HOMEを優先し、else home/.grok。sessions/<encoded-cwd>/<UUID>の正確なUUIDフォルダだけを探す。全sessionを列挙せずCWD groupごとに固定UUIDをprobeし、1000entries/1秒内、重複UUID候補/未完走査/linksはnull。短CWDはURLdecode、長いhashgroupはbounded .cwd metadataから読む。会話本文やusage本文はlocatorから読まない。

export locateGrokSession→{kind,id,dir,cwd|null}、openGrokSessionRecord→usage.json/chat_history.jsonlだけsafe-openする。利用側が自分のsize/schema/sessionID/currentproofを検証する。並行同root/idのlookupはpendingだけ共有し、終了後の結果をcacheしない。pending上限64。新CLI/モデル/認証/設定操作は無し。

6fixture tests pass（正確ID、固定leaf、.cwd、未知/traversal/重複、sessionlink/hardlink、並行/後続移動）。新helper+safeFileだけのstrict/exactOptional/noUnchecked型検査0。親branchは7kind contractを先に取込済みでserver既存4型未対応があるため、fullserver型passとは報告しない。Grok/Cursor会話実装完了後rootbatch型検査対象にする。usage担当はこのhelper commitだけを安定baseへpickでき、7kind profileの依存は無い。

既存の振る舞いを置換するbugfixではなく新しいlocatorなので、旧source負例は無し。安全境界の負例はfixture testsへ含む。installed生成usage fixtureによるcodec実証は別usage担当が行う。
