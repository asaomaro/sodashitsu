# タスク

- [x] sr-pcのOS/arch/SecureBoot/UMDF/IDDと既存displayをread-only確認
- [x] 一次資料でUMDFとkernel署名条件・testing/productionを区別
- [x] 期限内CI artifact取得、現在のdriver sourceとの一致確認
- [x] 実提出用CAB作成・展開・4file hash照合（no install）
- [x] 提出用stage生成と配布用署名/membership/manifest検証ツール
- [x] 新規ツールの拒否ケース/既存mode callback検査、実unsigned拒否
- [ ] package/署名境界を含む独立レビュー（taskcheck兼用、親agentへ依頼）
- [ ] 正式署名/配布物取得（外部の署名サービス/登録certが必要）
- [ ] 通常保護下のDriverStore導入と所有仮想画面実capture/解放

最後の2項は生成試験で完了としない。sr-pcの表示/信頼は変更していない。
