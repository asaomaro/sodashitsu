# 要求

通常権限のnative-copy/audio-pipe/Explorer selection専用EXEを、sodaの共通CLR hostと有効化後だけ準備・loadする固定role DLLへ統合する。無効なroleのコードをloadせず、独自helperの利用者手動導入を不要にする。copy/selectionはSTA、audioはMTAを保つ。独立processによる寿命・既存nonce/PID/入力leaseの境界は維持する。

独立構造点検(review_transfer)では通常3roleにJob/exe名image認証はなく、drag slotはDPAPI PID+作成時刻+保持handle、audioはbridge自身PIDとNamedPipeClientProcessIdを使うことを確認。privileged SigninのSYSTEM/session0と対象sessionは別process、Job/fixed image proofが必要で、通常user writable hostを共用しない。別sliceで検討・変更する。

分割: 共通host/builderと生成試験、次に3起動器/配布inventoryを移行。未配線のhost追加だけでは統合完了としない。
