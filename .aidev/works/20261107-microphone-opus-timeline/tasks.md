# Opusマイク転送の時刻ずれ

## 再現と原因

sr-pcへ実ブラウザUIから997Hz生成音を転送すると、6秒確認の前にOpusが停止する。PCMは同じ経路で完走する。物理マイクは使わない。ブラウザAPIの呼出し回数ではconfigure3/encode69/close3、送信66frameで局所回復を使い切っていた。CPU重複走査の修正後も再現した。

実Chromiumの生成AudioData8個をOpusへ入力し、途中のinput timestampを1つ飛ばしてもoutput timestampは連続となることを確認（flushの末尾packetは別途存在）。製品はencodeQueueSize等で捨てる前にseq/timestampを進めていた。その後の連続outputとencoding Mapのキーがずれて未照合entryが残り、200ms局所回復を繰り返す。

加えて、連続input100個でも279999/539999/1059999µsの出力を観測（本来280000/540000/1060000、各-1µs）。完全一致のMap照合では、これも未照合entryを残す。gap修正だけの実UIでは停止が残ったため、丸めを別要因として修正する。

## 修正

encode前の混雑判定を通ったframeだけがseq/timestampを進める。捨てたPCMは従来どおり零化。最大pending12/encoding queue2、100msの鮮度、200ms局所回復、500ms ACK期限、回復2回、権限/停止/旧encoder出力の無視を維持。PCMやサーバーのprotocolは変更しない。output timestampは最寄り20ms区切りとの差が±1µs以内の場合だけ同一encoderのMapと照合する。±2µs以上/NaN/Infinityは照合せず、古い音声の鮮度確認も維持する。

## タスク

- [x] 混雑で捨てたframeがencode timelineへ穴を残さない修正。
- [x] 混雑後も連続outputを送信し、ACK後も不要な回復を起こさない回帰テスト。
- [x] 旧コードでは新規1件が失敗/既存13件成功、修正後14件成功。byte exact復元を確認。
- [x] Web全体249file/3927件成功、Node24で型チェックを含むbuild成功。
- [x] 独立レビュー/追加丸め修正の再レビューは必須指摘なし。
- [x] 実ブラウザUIのOpus再測定、設定復元、main/Windows反映。


丸め補正の±1µs正例、±2µs/10000/NaN/Infinityの負例、古い±1µs出力の破棄を追加し23件が成功。丸め補正だけを戻す負例では新規2件が失敗し21件成功、byte exact復元を確認。独立再レビュー必須指摘なし。


## 実機再確認

実UIのOpus 10秒はconfigure1/encode490/490frame/ACK442/maxPending10、starting→running→stoppedで成功。CABLE Output captureは無音baseline99/peak0、997Hz387chunks（約7.74秒）を検出。全frame受音の証明とは区別する。15秒再試行もconfigure1/encode723/723frame/ACK716/maxPending8で完走した。意図した停止以外の圧縮器再起動はない。各試行後に設定の値/省略状態を復元し、capture専用root/processを除去。物理マイクは使わず、生成fixtureだけを入力。

利用者の『再発しなければ解決扱い』という方針に従い、この確認範囲のmic途中停止を解決扱いとする。実通話や別ブラウザ/別OSの全組合せはこの検査に含まない。


## Windows導入

main cf8c1013をsr-pcのC:\git\sodashitsuへfast-forwardし、Node24.18.0/Corepack pnpm9.15.9でWeb build（型チェック含む）を実施。SSH側の180秒待機は時間切れになったが、元処理を再送せず既存rootの完了記録を読んでbuildExitCode0/completedを確認。元owner/子processなし。fresh確認でもHEAD一致/checkout clean、Windows通常7780が返すindex.htmlとentry JSのSHA256が実buildと一致した。更新の専用rootは除去。通常サーバーの既存2paneは同じIDで保持されている。

稼働中の中継側にも修正版Web資産を配信済み。既存のWeb画面は再読み込みで新しいbundleを使う。
