# U8 phase 2: protected microphone → 通常 user の実 WASAPI 受信

2026-11-07、Windows 実機で PASS。root 操作枠の中で専用の一時 state / loopback port / 自作 receiver を使用し、通常の設定や既存 pane へ入力しない。実マイクや実利用者の音声は使用・保存しない。

## 固定した組合せ

- 製品 source: be88b257b78f95c57fc18c4c98baef38f57c1d81（fresh native session ID の修正済み）。
- user-microphone source normalized SHA256: 5e637d7bc472f3d6117678e60ca2aed8a23cd49d42713cd7c56e3e50407bab0d。
- SDK prepare の無音声 preflight では module SHA256 626a0396d7bb841137a27db6b5a0a4efe1b04cc2b07155781dd1581330a79e40 と新 native session symbols を確認し、正常退役。実測 actor は同じ製品 source から SDK が別に生成した role であり、当該 actor 個体の DLL hash は採取していない。
- 絶対20ms生成 producer SHA256: 8f710cc8c2389486331d9e0cdb49c3d4e3553cf4c6a807c22860810dde382826。
- 測定 runner SHA256: c02a9c565237df81b4f8f4d772c655a4888352416528d6dc7faed08ab0497e0d。
- 受信 fixture SHA256: e78a482f95ec0a8bf24a8bb5b6e4fa622ef148fe4fbe32547010ed7ddbd880c3。
- 測定用 controller の最終 memory-only canvas 観測 SHA256: a83320b793186a49c65b3000fc808452bf618133fb27c7da198fb8f8d98a66dd。

producer は先に Windows で100 zero frames/2秒を無音声校正し、2000.152ms、worker最大遅延0.0108ms、main最大遅延0.2866ms、欠番/順序/20ms遅延0を確認。OS timer、優先度、volume、既定device、service、driver、trust、policyは変更しない。

## 経路と結果

private server を先に起動し、HTTP503の間は read-only connect のみ有界待機。own state の初期 Node REPL 1pane/cwd/shell/agent null を確認し、個別 microphone/protectedMicrophone 許可だけをその一時 state に適用。media未開始の armed 状態から、必要な通常 unlock を行い、fresh same owner/logon/session・非昇格・active console・WTS unlocked を再確認後に source/actor を開始した。

実 source は Windows GDI / secureDesktop / protectedMicrophone / elevated-default。音声 sink は同ユーザーの通常権限 actor で、SYSTEM では WASAPI を起動しない。固定した未使用の仮想 CABLE だけを使用した。

[phase2-result.json](phase2-result.json) は匿名数値の取得結果（private PID のみ除外）。

- baseline: 99 × 20ms窓、RMS最大0.5、997Hz magnitude最大0.06。
- 送信: 997Hz/amplitude8000の300frames、実測5999.627ms。source RMS5656.854/peak8000/clip0。
- 総送信386frames、386ACK。ただし合否は ACK ではなく独立 WASAPI 受信で判断。
- 受信: 997Hz検出301 × 20ms窓、最長同一連続窓301件、対応wall coverage6021ms。検出窓は波形の境界を含み得るため、サンプル精度の音声実長/通信遅延を6.02秒と断定する値ではない。
- 左右の post-baseline 最大 RMS は約5665、997Hz magnitude約8023、両ch clip0。
- Producer の最大worker遅延2.231ms/main delivery2.738ms/callback2.678ms、欠番・順序・20ms以上遅延0。
- receiver の最大read gap46ms。断絶flag変化/gap60ms超で連続区間をresetする既存条件のまま、同一連続区間の最低280framesかつ5500ms/総290framesかつ5700msを通過。capture断絶flag累計1の詳細timestampは採っていない。
- issue0、own receiver/serverの終了とprivate auth state削除を確認。raw音声保存/物理mic/実model呼出し0。

旧 setInterval20ms が Windows では平均30.51msだった問題は生成 fixture の cadence として分離した。native Role.Read の性能改善と producer 修正を合わせた実測なので、以前の tone0 の単独根因をこの結果だけで断定しない。100ms期限・採点・権限チェックは緩めていない。

## 後始末と残る範囲

[phase2-postcheck.json](phase2-postcheck.json): own PID退役、専用18781 listener無し、private state無し、CABLE両端active sessions0、mute/volume/既定device不変。製品source clean、production parentと既存2paneを保持。

この PASS は通常ユーザー receiver と elevated-default source の組合せ。昇格 Default アプリによる受信、UAC desktop中の受信、実 lock / source epoch 失効による停止は未検証で、phase3以降の別試験とする。
