# Commit Graph

SodashitsuのPJフォルダのコミット履歴を表示する、読み取り専用のビュー。
GitとNode.jsが必要。`git log --graph --oneline --decorate --all -n 100` を5秒ごとに読み、変化時だけ画面を更新する。

```sh
sodactl plugin pack plugins/commit-graph --out commit-graph.sodaplugin
sodactl plugin install commit-graph.sodaplugin --state-dir ~/.local/state/sodashitsu
sodactl plugin enable commit-graph --state-dir ~/.local/state/sodashitsu
sodactl ext reload
```

PJ限定の導入は `--state-dir` の代わりに `--project-dir /path/to/project` を指定する。設定の拡張一覧でプロジェクト拡張の実行を承認する。

PJフォルダを設定したワークスペースで、［ビューを追加］→［コミットグラフ］→対象と配置を選ぶ。ターミナルとアプリのどちらでも追加できる。
タブの［＋］から［コミットグラフ］を選ぶと独立した画面になる。［作業画面］で同じタブの端末へ切り替えられる。

有効なビューを開いた後、エージェントからCLIで操作できます。

```sh
sodactl plugin operations commit-graph --tab <タブID>
sodactl plugin call commit-graph history --tab <タブID> --params '{"limit":20}'
sodactl plugin call commit-graph refresh --pane <ペインID>
```

操作の登録・応答の仕様は `docs/plugin-cli.md` を参照してください。

モバイル幅では、同じ履歴を専用の「コミット履歴（モバイル）」画面で表示する。
`tabView.mobileDisplay` に `commit-graph-mobile` を指定し、主画面アンカーに通常版とモバイル版の両方を公開する。
