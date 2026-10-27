# モニター別のブラウザ窓

利用者の全残件継続指示に対する段階実装。同一の通常共有・allモニターsourceを複数のブラウザ窓で取得し、各窓がローカルで選択したモニター領域をクリップ表示する。取得/helper/input FIFOは既存の一つを維持する。異モニターごとの独立capture/encoderは本差分では実装しない。帯域/解像度の改善とは主張しない。

- readyの通常sharedMonitors/allのみが別窓の起点。単独/保護/仮想/非対応/未readyには提供しない。複数モニターのうち一つを選び、明示クリックで新しい同origin /desktop-view を開く。noopener,noreferrer。noopenerでの戻り値はブロック判定に使わず、開かない場合のブラウザ設定を説明する。
- 新窓は既存のログインと端末の権限検査・endpoint pin/秘密鍵をそのまま使用する。URL fragmentの厳密schemaはmachine/label/monitor/描画設定/cohortフラグのみ。token/チケット/許可/鍵/画像は含めず、未知field・過長・不整合は拒否する。URLは起動設定を保持して再読込できる。入力/clipboard/mic許可は引き継がない。
- 各窓は全体canvasとcursor overlayを同じ矩形でCSS clipする。fit倍率を選択monitor領域で計算し、全体canvas DOM矩形で物理座標を求め、crop時は表示モニターの最終pixelまでにclampし既存入力へ渡す。隠れた別モニターへdrag入力しない。負座標・異DPI・隙間・native描画・cursor合成も同じsource基準。canvas画素を再生成せず、ACK/freshnessは全体フレームのまま。
- monitor IDがready layoutにない/selectedがall以外なら明示停止し、全画面へ暗黙fallbackしない。topology変更/close/権限失効は従来どおり停止。各窓のローカル表示選択は他窓やsource設定を変更しない。
- backendモニター変更と別窓用ローカル表示選択は異なるUI。全画面取得の共有が必要なことと、別capture未対応を明記する。

検証: 純粋schema/clip/fit計算、実browser popupと左右それぞれの可視色/矩形・入力座標・同一child・片窓終了継続・再読込・native/encrypted・topology停止・不正URL。生成helperのみ。独立taskcheckと全体review、build/typecheck/全体test/関連E2E/独立smokeを行う。負例は片側clip解除と座標をcrop基準へ誤変更して描画/入力テストが落ちることを確認しbytes復元する。
