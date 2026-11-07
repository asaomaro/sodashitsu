# 仮想音声経路の実測用補助

本ディレクトリの`VirtualCableCapture.cs`と`VirtualCableRender.cs`はsr-pcの今回の単発測定用。製品の自動起動・配布物へ追加しない。host・所有SID・Session1・仮想endpointを固定しており、別PCへそのまま実行しない。

- .NET Frameworkのx64 WinExeとしてコンパイルし、実行前にソース/実行物のSHA256を照合。SSHのSession0から実行せず、ログイン済み所有者Session1で起動する。
- Captureは既知のCABLE Outputだけを開き、最初の2秒を無音baselineとして全20秒をRAMで測定する。readyの後3秒以上待って997Hz生成音を送る。物理マイクや既定deviceへfallbackしない。結果は周波数成分/RMS/チャンク数だけで、生音声は保存しない。
- Renderは既知のCABLE Inputだけに997Hzを最大300frame送る。10秒の書込許可期限、Activeの継続確認、COM解放・PCM零化。Writeが中断を返した場合は失敗し、書き込まなかったframeを加算しない。WASAPIへの書込完了とcapture受音は別の証拠。
- 設定変更はmicrophone許可とendpointの2項目だけを、新規backup後に行う。検証後は元の値とプロパティの省略状態へ戻し、他の最新設定を保持する。OSの既定音声deviceは変更しない。
- Captureの無音/997Hz/2000Hz対照、周波数を誤ったdetectorの拒否、Renderのallowed=false対照を確認する。製品wireが途中でunavailableとなった試行は連続転送成功に含めない。
- 終了後は所有した実行物のprocessがないことを確認して専用rootを削除する。結果JSONの存在だけで正常終了と決めず、okと呼出しreceiptのexitCodeも確認する。

実通話・物理マイク・全frameの受音・長時間安定性の証明には使わない。今回の実結果と対照は隣の`../evidence/virtual-*`、制限と経過は`../tasks.md`に記録する。
