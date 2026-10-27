# 7B2a 固定登録情報と最小RPC境界

- [x] 専用agentの権限境界を設計し、未接続・後続依存を明記。
- [x] 固定owner/Root/machine/provider/peerと秘密の非列挙、有限な4種類の要求分類を実装・独立taskcheck（全service account判定とは区別）。
- [ ] 生成unit、source負例、元bytes復元後のbuild/typecheck/全体検証。
- [ ] 独立check worktreeのbuild/smoke、crossと追加差分の再レビュー。
- [ ] PR/main/dirty-rootへの保護付き反映。秘密保存・service・実取得/入力は未対応のまま。
